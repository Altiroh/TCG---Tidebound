-- Cartes, decks, collection, boosters, économie et onboarding.
--
-- Source de vérité : `TCG_DATABASE.md` et "Boosters & économie de
-- collection" (Notion, verrouillage du 2026-09-08). Ce schéma suit
-- fidèlement les tables "à prévoir" listées dans ces documents, avec deux
-- écarts assumés par rapport au schéma proposé :
--   1. `cards.id` est le SLUG du moteur (`CardDefinition.id`,
--      `game/cards/sets/core.ts`), pas un uuid séparé — pour rester
--      directement joignable avec le catalogue TypeScript sans table de
--      correspondance supplémentaire.
--   2. `card_type` reprend les valeurs françaises réellement utilisées par
--      le moteur (`marin`/`creature`/`equipement`/`structure`/`objet`/
--      `anomalie`), pas la traduction anglaise indicative du document.
--
-- Comme pour `matches` : cette table `cards` est un MIROIR serveur utilisé
-- par les systèmes de collection/boosters/deckbuilding pour valider la
-- possession et les règles d'exemplaires. Le moteur de jeu
-- (`game/cards/sets/core.ts`, `dispatch()`) reste l'unique source de
-- vérité pour la RÉSOLUTION d'une partie ; il ne lit jamais cette table.
-- À synchroniser via `scripts/seedCards.ts` (npx tsx scripts/seedCards.ts)
-- plutôt qu'en dupliquant les 80 cartes à la main dans cette migration.
--
-- Rareté : `TCG_DATABASE.md` ne fournit pas encore l'assignation
-- carte-par-carte des raretés (seuls les poids par palier sont verrouillés
-- : commune 55 / peu commune 28 / rare 12 / abyssale 5). `rarity` est donc
-- posée ici en `common`/55 par défaut, à corriger carte par carte dès que
-- le design verrouille cette liste — ne pas s'y fier pour l'équilibrage
-- des boosters tant que ce n'est pas fait.

-- --- cartes ---------------------------------------------------------------

create type public.card_type as enum ('marin', 'creature', 'equipement', 'structure', 'objet', 'anomalie');
create type public.card_rarity as enum ('common', 'uncommon', 'rare', 'abyssal');

create table public.cards (
  id text primary key, -- CardDefinition.id (slug), ex: 'murene-aveugle'
  name text not null,
  card_type public.card_type not null,
  subtypes text[] not null default '{}',
  reason_cost smallint not null,
  power smallint,
  resistance smallint,
  rules_text text,
  rarity public.card_rarity not null default 'common', -- TODO design : à verrouiller carte par carte
  rarity_weight smallint not null default 55,
  max_copies smallint not null default 3,
  duration_turns smallint,
  visible_tides text[],
  is_collectible boolean not null default true,
  is_enabled boolean not null default true,
  set_code text not null default 'core',
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.cards enable row level security;

create policy "cards are readable by any authenticated user"
  on public.cards for select
  to authenticated
  using (true);

-- Pas de policy insert/update/delete pour `authenticated` : la table n'est
-- écrite que par le script de seed / migrations (clé service_role), jamais
-- par le navigateur ou une Server Action utilisateur.

-- --- decks de base système --------------------------------------------

create table public.system_decks (
  id text primary key, -- correspond à DeckList.id (game/cards/decks/preconstructed.ts)
  ship_id text not null, -- id de Navire, validé côté code via getShipDefinition() ; pas de table `ships` séparée
  name text not null,
  is_enabled boolean not null default true,
  version integer not null default 1
);

create table public.system_deck_cards (
  system_deck_id text not null references public.system_decks (id) on delete cascade,
  card_id text not null references public.cards (id),
  quantity smallint not null check (quantity > 0),
  primary key (system_deck_id, card_id)
);

alter table public.system_decks enable row level security;
alter table public.system_deck_cards enable row level security;

create policy "system decks are readable by any authenticated user"
  on public.system_decks for select to authenticated using (true);

create policy "system deck cards are readable by any authenticated user"
  on public.system_deck_cards for select to authenticated using (true);

-- --- decks personnels ---------------------------------------------------

create table public.player_decks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  ship_id text not null,
  name text not null,
  -- Jamais fait confiance tel quel : recalculé côté serveur (via
  -- `game/rules/deckValidation.ts`) à partir de la collection, du Navire
  -- et de `cards.max_copies` avant toute utilisation en partie.
  is_valid boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.player_deck_cards (
  deck_id uuid not null references public.player_decks (id) on delete cascade,
  card_id text not null references public.cards (id),
  quantity smallint not null check (quantity > 0),
  primary key (deck_id, card_id)
);

alter table public.player_decks enable row level security;
alter table public.player_deck_cards enable row level security;

create policy "a user can manage their own decks"
  on public.player_decks for all
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "a user can manage the cards of their own decks"
  on public.player_deck_cards for all
  to authenticated
  using (exists (select 1 from public.player_decks d where d.id = deck_id and d.user_id = auth.uid()))
  with check (exists (select 1 from public.player_decks d where d.id = deck_id and d.user_id = auth.uid()));

-- --- collection ----------------------------------------------------------

create table public.player_cards (
  user_id uuid not null references public.profiles (id) on delete cascade,
  card_id text not null references public.cards (id),
  quantity integer not null default 0 check (quantity >= 0),
  first_obtained_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, card_id)
);

alter table public.player_cards enable row level security;

create policy "a user can read their own collection"
  on public.player_cards for select
  to authenticated
  using (user_id = auth.uid());

-- Pas de policy insert/update/delete : la collection n'évolue que via des
-- Server Actions authentifiées avec la clé service_role (ouverture de
-- booster, recyclage, octroi de départ) — jamais en écriture directe
-- navigateur, pour les mêmes raisons que `matches.state`.

-- --- boosters --------------------------------------------------------

create table public.booster_definitions (
  id text primary key, -- ex: 'standard', 'welcome_tutorial'
  name text not null,
  card_count smallint not null default 8,
  price_currency integer, -- null = non achetable (ex: booster de bienvenue)
  is_purchasable boolean not null default true,
  is_enabled boolean not null default true
);

create table public.booster_slots (
  booster_definition_id text not null references public.booster_definitions (id) on delete cascade,
  slot_index smallint not null,
  -- L'un des deux est renseigné : rareté garantie (slots 1-7 du format
  -- standard) ou pondération multi-rareté en JSON (slot "Profondeur").
  guaranteed_rarity public.card_rarity,
  weighted_rarities jsonb,
  primary key (booster_definition_id, slot_index),
  constraint booster_slot_has_rule check (guaranteed_rarity is not null or weighted_rarities is not null)
);

alter table public.booster_definitions enable row level security;
alter table public.booster_slots enable row level security;

create policy "booster definitions are readable by any authenticated user"
  on public.booster_definitions for select to authenticated using (true);

create policy "booster slots are readable by any authenticated user"
  on public.booster_slots for select to authenticated using (true);

-- Format standard verrouillé (Notion "Boosters & économie de collection") :
-- 8 cartes, slots 1-4 Commune garantie, 5-6 Peu commune garantie, 7 Rare ou
-- mieux garantie, 8 = slot Profondeur (55% Peu commune / 35% Rare / 10%
-- Abyssale). Mini Booster de Bienvenue (tutoriel) : 2 Communes, 1 Peu
-- commune, 1 Rare ou mieux.
insert into public.booster_definitions (id, name, card_count, price_currency, is_purchasable, is_enabled) values
  ('standard', 'Booster standard', 8, 500, true, true),
  ('welcome_tutorial', 'Mini Booster de Bienvenue', 4, null, false, true);

insert into public.booster_slots (booster_definition_id, slot_index, guaranteed_rarity, weighted_rarities) values
  ('standard', 1, 'common', null),
  ('standard', 2, 'common', null),
  ('standard', 3, 'common', null),
  ('standard', 4, 'common', null),
  ('standard', 5, 'uncommon', null),
  ('standard', 6, 'uncommon', null),
  ('standard', 7, 'rare', null),
  ('standard', 8, null, '{"uncommon": 55, "rare": 35, "abyssal": 10}'),
  ('welcome_tutorial', 1, 'common', null),
  ('welcome_tutorial', 2, 'common', null),
  ('welcome_tutorial', 3, 'uncommon', null),
  ('welcome_tutorial', 4, 'rare', null);

create table public.player_boosters (
  user_id uuid not null references public.profiles (id) on delete cascade,
  booster_definition_id text not null references public.booster_definitions (id),
  quantity integer not null default 0 check (quantity >= 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, booster_definition_id)
);

create table public.booster_openings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  booster_definition_id text not null references public.booster_definitions (id),
  opened_at timestamptz not null default now()
);

create table public.booster_opening_cards (
  booster_opening_id uuid not null references public.booster_openings (id) on delete cascade,
  slot_index smallint not null,
  card_id text not null references public.cards (id),
  primary key (booster_opening_id, slot_index)
);

create table public.player_pity (
  user_id uuid not null references public.profiles (id) on delete cascade,
  booster_definition_id text not null references public.booster_definitions (id),
  packs_since_abyssal integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, booster_definition_id)
);

alter table public.player_boosters enable row level security;
alter table public.booster_openings enable row level security;
alter table public.booster_opening_cards enable row level security;
alter table public.player_pity enable row level security;

create policy "a user can read their own unopened boosters"
  on public.player_boosters for select to authenticated using (user_id = auth.uid());

create policy "a user can read their own booster opening history"
  on public.booster_openings for select to authenticated using (user_id = auth.uid());

create policy "a user can read the cards from their own booster openings"
  on public.booster_opening_cards for select
  to authenticated
  using (exists (select 1 from public.booster_openings o where o.id = booster_opening_id and o.user_id = auth.uid()));

create policy "a user can read their own pity counter"
  on public.player_pity for select to authenticated using (user_id = auth.uid());

-- Aucune policy insert/update/delete sur ces 4 tables : l'ouverture d'un
-- booster est "entièrement autoritaire côté serveur" (pity, protection
-- Abyssale, tirage) — le client ne génère et ne reroll jamais les cartes
-- lui-même, cf. Notion "Boosters & économie de collection".

-- --- monnaie et économie -----------------------------------------------

create table public.player_currency (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  balance integer not null default 0 check (balance >= 0),
  updated_at timestamptz not null default now()
);

create table public.currency_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  amount integer not null, -- positif = crédit, négatif = débit
  reason text not null, -- ex: 'match_reward_pvp_win', 'booster_purchase', 'card_recycle', 'starter_grant'
  reference_id uuid, -- référence polymorphe (id de match, de booster_opening, ...), pas de FK typée
  created_at timestamptz not null default now()
);

create index currency_transactions_user_id_idx on public.currency_transactions (user_id);

alter table public.player_currency enable row level security;
alter table public.currency_transactions enable row level security;

create policy "a user can read their own currency balance"
  on public.player_currency for select to authenticated using (user_id = auth.uid());

create policy "a user can read their own currency transactions"
  on public.currency_transactions for select to authenticated using (user_id = auth.uid());

-- --- quêtes ---------------------------------------------------------------

create table public.quests (
  id uuid primary key default gen_random_uuid(),
  quest_type text not null check (quest_type in ('daily', 'weekly')),
  objective_key text not null, -- ex: 'play_matches', 'play_creatures', 'break_objects' — jamais une carte/rareté précise
  target_value integer not null,
  reward_currency integer not null default 0,
  reward_booster_definition_id text references public.booster_definitions (id),
  -- true = éligible en partie contre bot (cadrage : les bots ne rapportent
  -- jamais de monnaie directe, mais peuvent faire progresser ces quêtes).
  bot_progress_allowed boolean not null default false,
  period text,
  is_enabled boolean not null default true
);

create table public.player_quest_progress (
  user_id uuid not null references public.profiles (id) on delete cascade,
  quest_id uuid not null references public.quests (id) on delete cascade,
  progress_value integer not null default 0,
  completed_at timestamptz,
  claimed_at timestamptz,
  primary key (user_id, quest_id)
);

alter table public.quests enable row level security;
alter table public.player_quest_progress enable row level security;

create policy "quests are readable by any authenticated user"
  on public.quests for select to authenticated using (true);

create policy "a user can read their own quest progress"
  on public.player_quest_progress for select to authenticated using (user_id = auth.uid());

-- --- onboarding ------------------------------------------------------

create table public.player_onboarding (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  tutorial_status text not null default 'not_started' check (tutorial_status in ('not_started', 'completed', 'skipped')),
  tutorial_reward_claimed boolean not null default false,
  starter_standard_booster_claimed boolean not null default false,
  starter_currency_granted boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.player_onboarding enable row level security;

create policy "a user can read their own onboarding state"
  on public.player_onboarding for select to authenticated using (user_id = auth.uid());

-- --- octroi de départ automatique --------------------------------------
--
-- Étend le trigger existant (`handle_new_user`, migration init) : en plus
-- du profil, un nouveau compte reçoit immédiatement 500 crédits (prix
-- prototype d'1 booster standard) et 1 booster standard offert (cadrage
-- "Onboarding joueur — verrouillé"). Valeurs volontairement en dur pour
-- l'instant ; à sortir en configuration serveur si elles doivent changer
-- souvent. `create or replace` : même fonction, même trigger existant, pas
-- besoin de recréer le trigger.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1)));

  insert into public.player_currency (user_id, balance) values (new.id, 500);
  insert into public.currency_transactions (user_id, amount, reason) values (new.id, 500, 'starter_grant');
  insert into public.player_boosters (user_id, booster_definition_id, quantity) values (new.id, 'standard', 1);
  insert into public.player_onboarding (user_id, starter_currency_granted, starter_standard_booster_claimed)
    values (new.id, true, true);

  return new;
end;
$$;

-- --- matchmaking -----------------------------------------------------

-- File d'attente : un joueur ne peut avoir qu'une seule entrée à la fois.
create table public.matchmaking_queue (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  deck_id text not null, -- id de deck système OU uuid de player_decks, en texte (même convention que matches.player1_deck_id)
  queued_at timestamptz not null default now()
);

alter table public.matchmaking_queue enable row level security;

create policy "a user can manage their own matchmaking queue entry"
  on public.matchmaking_queue for all
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Tente d'apparier l'appelant (déduit de auth.uid(), jamais d'un paramètre
-- — pour qu'un appelant ne puisse jamais consommer/retirer l'entrée de
-- quelqu'un d'autre sans se lier lui-même au match résultant) avec le
-- joueur en attente depuis le plus longtemps. `for update skip locked`
-- rend l'appariement sûr sous accès concurrents : deux joueurs qui
-- rejoignent en même temps ne peuvent pas se voler mutuellement le même
-- adversaire. Ne fait QUE désigner/retirer l'adversaire de la file ; la
-- création de la partie elle-même (appel à `createGameState()`, insertion
-- dans `matches`) reste côté TypeScript (Server Action), le moteur n'étant
-- pas appelable depuis SQL.
create or replace function public.claim_matchmaking_opponent()
returns table (opponent_user_id uuid, opponent_deck_id text)
language plpgsql
security definer set search_path = public
as $$
declare
  caller uuid := auth.uid();
  found record;
begin
  if caller is null then
    raise exception 'claim_matchmaking_opponent: authentification requise';
  end if;

  select q.user_id, q.deck_id into found
  from public.matchmaking_queue q
  where q.user_id <> caller
  order by q.queued_at asc
  for update skip locked
  limit 1;

  if found.user_id is null then
    return;
  end if;

  delete from public.matchmaking_queue where user_id = found.user_id;
  return query select found.user_id, found.deck_id;
end;
$$;

revoke all on function public.claim_matchmaking_opponent() from public;
grant execute on function public.claim_matchmaking_opponent() to authenticated;

-- --- historique de parties : extension de `matches` ---------------------

alter table public.matches
  add column mode text not null default 'private_invite' check (mode in ('private_invite', 'matchmaking', 'bot')),
  add column is_vs_bot boolean not null default false,
  add column finished_at timestamptz;

create index matches_status_idx on public.matches (status);
create index matches_finished_at_idx on public.matches (finished_at) where finished_at is not null;

-- --- réaltime --------------------------------------------------------

alter publication supabase_realtime add table public.matchmaking_queue;
