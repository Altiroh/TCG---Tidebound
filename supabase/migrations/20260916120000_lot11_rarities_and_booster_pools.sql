-- Lot 11, nouvelles raretés, pools de boosters et recalibrage des prix.
--
-- Trois changements de fond, dans cet ordre :
--
--   1. `card_rarity` cesse d'être un ENUM. Le Lot 11 (Notion « Les Masques
--      Noyés / Théâtre Englouti », 15/09/2026) introduit Épique et
--      Légendaire, et un enum PostgreSQL ne peut pas recevoir une valeur
--      puis l'utiliser dans la MÊME transaction (« New enum values must be
--      committed before they can be used »). Comme ce fichier est fait pour
--      être collé d'un bloc dans l'éditeur SQL, l'enum rendait l'opération
--      impossible. Le jeu de valeurs vient de changer une fois : il
--      changera encore. Une colonne texte sous contrainte `check` porte
--      exactement la même garantie, se lit pareil, et fait d'un futur
--      palier une ligne à modifier plutôt qu'une migration à risque.
--
--   2. Les POOLS de boosters deviennent une vraie table. Jusqu'ici le
--      tirage filtrait sur `set_code = 'core'` plus une liste de raretés
--      exclues : tout le Lot 10 Cra-Poiscail était donc intirable, et trois
--      boosters aux contenus distincts étaient inexprimables. Le cadrage
--      l'annonçait déjà : « La table `booster_pool_cards` devient la source
--      d'autorité pour savoir dans quels boosters une carte peut réellement
--      apparaître. »
--
--   3. Deux boosters de plus et un prix recalibré : Défaut à 100 Tides,
--      Poissons pas frais et Étrangeté sous-marine à 150.
--
-- Idempotent : rejouable sans risque.

-- ======================================================================
-- 1. RARETÉS — de l'enum au texte contraint
-- ======================================================================
do $$
begin
  -- Seulement si la colonne est encore un enum : rejouer ce fichier ne doit
  -- pas retenter une conversion déjà faite.
  if exists (
    select 1 from pg_attribute a
    join pg_class c on c.oid = a.attrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'cards' and a.attname = 'rarity'
      and format_type(a.atttypid, a.atttypmod) = 'card_rarity'
  ) then
    -- Une signature d'`open_card_choice` héritée d'une base ancienne peut
    -- encore référencer le type : elle retiendrait la suppression.
    drop function if exists public.open_card_choice(uuid, text, text, public.card_rarity, text[]);

    alter table public.cards alter column rarity drop default;
    alter table public.cards alter column rarity type text using rarity::text;
    alter table public.booster_slots alter column guaranteed_rarity type text using guaranteed_rarity::text;
    -- `pool_excluded_rarities` est supprimée plus bas (§5) : inutile de la
    -- convertir, il suffit qu'elle ne retienne plus le type.
    alter table public.booster_definitions drop column if exists pool_excluded_rarities;

    -- `player_card_choices` n'existe que depuis la migration de progression.
    if exists (select 1 from pg_class where relname = 'player_card_choices' and relnamespace = 'public'::regnamespace) then
      alter table public.player_card_choices alter column rarity type text using rarity::text;
    end if;

    drop type if exists public.card_rarity;
  end if;
end $$;

/*
 * Jeu de valeurs autorisé — miroir de `CardRarity` (`game/boosters/types.ts`).
 * Ordre croissant : `epic` et `legendary` s'intercalent entre `rare` et
 * `abyssal`. Une Abyssale n'est pas un palier de plus, c'est une variante
 * « beaucoup plus rare d'une carte existante », et elle reste le seul lot
 * du slot Profondeur.
 */
alter table public.cards drop constraint if exists cards_rarity_check;
alter table public.cards add constraint cards_rarity_check
  check (rarity in ('common', 'uncommon', 'rare', 'epic', 'legendary', 'abyssal'));

alter table public.booster_slots drop constraint if exists booster_slots_guaranteed_rarity_check;
alter table public.booster_slots add constraint booster_slots_guaranteed_rarity_check
  check (guaranteed_rarity is null or guaranteed_rarity in ('common', 'uncommon', 'rare', 'epic', 'legendary', 'abyssal'));

-- ======================================================================
-- 2. POOLS DE BOOSTERS
-- ======================================================================
-- Source d'autorité de l'éligibilité, comme le cadrage le demande :
-- « l'éligibilité est définie au niveau du pool de booster, pas déduite
-- automatiquement de la rareté ou de l'archétype ».
--
-- Une carte peut appartenir à PLUSIEURS pools : trois cartes passerelles
-- (Pulcinella Gonflé en B1 + B3, Arlecchino des Profondeurs et Le Masque
-- Fendu en B2 + B3) relient les boosters entre eux. Ce sont des
-- réimpressions de pool, pas de nouvelles cartes — d'où la clé composite.
create table if not exists public.booster_pool_cards (
  booster_definition_id text not null references public.booster_definitions (id) on delete cascade,
  card_id text not null references public.cards (id) on delete cascade,
  -- Retirer une carte d'un booster sans perdre la ligne ni son historique.
  is_enabled boolean not null default true,
  primary key (booster_definition_id, card_id)
);

create index if not exists booster_pool_cards_booster_idx
  on public.booster_pool_cards (booster_definition_id) where is_enabled;

alter table public.booster_pool_cards enable row level security;

drop policy if exists "booster pools are readable by any authenticated user" on public.booster_pool_cards;
create policy "booster pools are readable by any authenticated user"
  on public.booster_pool_cards for select to authenticated using (true);

-- ======================================================================
-- 3. LES TROIS BOOSTERS ACHETABLES
-- ======================================================================
-- Prix retenus : le Défaut descend de 150 à 100 Tides, les deux nouveaux
-- sont 50 Tides plus chers. Le Défaut reste le pool d'apprentissage, donc
-- le moins cher ; B2 et B3 se paient leur contenu plus spécialisé.
insert into public.booster_definitions (id, name, card_count, price_currency, is_purchasable, is_enabled) values
  ('standard', 'Booster Défaut', 8, 100, true, true),
  ('poissons-pas-frais', 'Poissons pas frais', 8, 150, true, true),
  ('etrangete-sous-marine', 'Étrangeté sous-marine', 8, 150, true, true)
on conflict (id) do update set
  name = excluded.name,
  card_count = excluded.card_count,
  price_currency = excluded.price_currency,
  is_purchasable = excluded.is_purchasable,
  is_enabled = excluded.is_enabled;

-- Format des trois boosters achetables : identique, et verrouillé par le
-- cadrage — 8 cartes, slots 1-4 Commune, 5-6 Peu commune, 7 « Rare ou
-- mieux », 8 slot Profondeur (55 % Peu commune / 35 % Rare / 10 % Abyssale).
--
-- Le slot 7 devient PONDÉRÉ. Il était « Rare » exact, ce qui convenait tant
-- que Rare était le palier le plus haut hors Abyssale ; depuis le Lot 11,
-- Épique et Légendaire existent et ne tombent dans AUCUN slot — les trois
-- cartes concernées seraient inobtenables. La pondération rend sa lettre au
-- texte du cadrage (« le slot 7 garantit AU MINIMUM une Rare ») en laissant
-- la Rare largement majoritaire, et sans toucher à l'Abyssale, qui reste
-- concentrée sur le slot Profondeur et son pity.
delete from public.booster_slots where booster_definition_id in ('standard', 'poissons-pas-frais', 'etrangete-sous-marine');

insert into public.booster_slots (booster_definition_id, slot_index, guaranteed_rarity, weighted_rarities)
select b.id, s.slot_index, s.guaranteed_rarity, s.weighted_rarities
from (values ('standard'), ('poissons-pas-frais'), ('etrangete-sous-marine')) as b(id)
cross join (values
  (1, 'common', null::jsonb),
  (2, 'common', null),
  (3, 'common', null),
  (4, 'common', null),
  (5, 'uncommon', null),
  (6, 'uncommon', null),
  (7, null, '{"rare": 85, "epic": 12, "legendary": 3}'::jsonb),
  (8, null, '{"uncommon": 55, "rare": 35, "abyssal": 10}'::jsonb)
) as s(slot_index, guaranteed_rarity, weighted_rarities);

-- ======================================================================
-- 4. LE POOL EST LA SEULE AUTORITÉ
-- ======================================================================
-- Garde-fou : un booster achetable sans pool consommerait le booster du
-- joueur pour ne rien lui donner. La fonction d'ouverture refuse déjà de
-- tirer sur un pool vide ; cette vue rend le trou visible avant, côté
-- exploitation.
create or replace view public.booster_pool_health as
select
  bd.id as booster_definition_id,
  bd.name,
  bd.price_currency,
  count(bpc.card_id) filter (where bpc.is_enabled) as pool_size,
  count(*) filter (where bpc.is_enabled and c.rarity = 'common') as commons,
  count(*) filter (where bpc.is_enabled and c.rarity = 'uncommon') as uncommons,
  count(*) filter (where bpc.is_enabled and c.rarity = 'rare') as rares,
  count(*) filter (where bpc.is_enabled and c.rarity in ('epic', 'legendary')) as high_tier,
  count(*) filter (where bpc.is_enabled and c.rarity = 'abyssal') as abyssals
from public.booster_definitions bd
left join public.booster_pool_cards bpc on bpc.booster_definition_id = bd.id
left join public.cards c on c.id = bpc.card_id and c.is_collectible and c.is_enabled
where bd.is_enabled
group by bd.id, bd.name, bd.price_currency;

revoke all on public.booster_pool_health from public, anon, authenticated;
grant select on public.booster_pool_health to service_role;

-- ======================================================================
-- 5. NETTOYAGE — `pool_excluded_rarities` n'a plus de lecteur
-- ======================================================================
-- Elle exprimait « pas d'Abyssale dans le Booster de Bienvenue », une
-- approximation qui n'avait de sens que tant que tous les boosters
-- partageaient le même pool. Le pool du Booster de Bienvenue est désormais
-- explicite ; garder les deux mécanismes, c'est se garantir qu'ils
-- divergeront. La colonne est retirée plutôt que laissée vide.
alter table public.booster_definitions drop column if exists pool_excluded_rarities;
