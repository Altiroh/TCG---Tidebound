-- Progression joueur — tutoriel, paliers 1-50, connexions, préconstruits,
-- exploits.
--
-- Source de vérité design : Notion « Progression joueur — Tutoriel, XP,
-- Quêtes & Préconstruits » (2026-09-15). Deux exigences de sa section 13
-- dirigent tout ce fichier :
--
--   > Les récompenses doivent être persistées côté serveur et protégées
--   > contre les doubles claims.
--   > Prévoir les champs nécessaires pour ajouter ensuite de nouvelles
--   > quêtes, récompenses, niveaux et préconstruits sans recoder le système
--   > en dur.
--
-- D'où le parti pris : chaque type de récompense a sa propre table à clé
-- naturelle (joueur + palier, joueur + exploit, joueur + deck…), et
-- l'anti-double-claim repose sur ces CLÉS PRIMAIRES, jamais sur une
-- vérification applicative. Le CONTENU des récompenses, lui, reste en
-- TypeScript (`game/progression/levelRewards.ts`, `game/quests/catalog.ts`,
-- `game/achievements/catalog.ts`), testé et modifiable sans migration : la
-- base stocke ce qui a été donné, pas ce qu'il y a à donner.
--
-- Comme le reste du schéma, aucune policy d'écriture pour `authenticated` :
-- seules les fonctions `security definer` ci-dessous, appelées par des
-- Server Actions avec la clé service_role, peuvent créditer quoi que ce soit.

-- ======================================================================
-- 1. ÉCONOMIE — le booster Standard passe de 500 à 150 Tides
-- ======================================================================
-- Valeur VERROUILLÉE par la spec (§5 : « 150 Tides = 1 booster Standard »).
-- Toute la progression est calibrée par rapport à elle.
update public.booster_definitions set price_currency = 150 where id = 'standard';

-- ======================================================================
-- 2. PROGRESSION — compteurs quotidiens et Jetons de Préconstruit
-- ======================================================================
alter table public.player_progression
  -- Première victoire du jour : le bonus n'est plus réservé au PvP côté XP
  -- (§7 parle de « la première victoire du jour », sans distinction de
  -- mode), d'où une colonne propre. `last_pvp_win_day` reste, elle sert
  -- encore au bonus de Tides, réservé au PvP.
  add column if not exists last_win_day date,
  -- Bonus « 3 parties terminées dans la journée » : il faut savoir combien
  -- de parties ont déjà été terminées AUJOURD'HUI, pas au total.
  add column if not exists daily_matches_day date,
  add column if not exists daily_matches_count integer not null default 0 check (daily_matches_count >= 0),
  -- Jetons de Préconstruit (§4) — ressource persistée du joueur, dépensée
  -- dans Decks → Préconstruits.
  add column if not exists precon_tokens integer not null default 0 check (precon_tokens >= 0),
  -- SÉRIE DE JOURS JOUÉS (« Marin régulier »). Trois colonnes plutôt
  -- qu'une : `play_streak_day` est le dernier jour COMPTÉ, sans quoi
  -- plusieurs parties le même jour gonfleraient la série ; `play_streak`
  -- est la série courante ; `best_play_streak` la garde en mémoire pour le
  -- profil, une série cassée ne devant pas effacer ce qui a été tenu.
  --
  -- Une série n'est pas dérivable après coup : sans ces colonnes il
  -- faudrait un historique de toutes les parties, et « 3 jours d'affilée »
  -- resterait indistinguable de « 3 jours dans le mois ».
  add column if not exists play_streak_day date,
  add column if not exists play_streak integer not null default 0 check (play_streak >= 0),
  add column if not exists best_play_streak integer not null default 0 check (best_play_streak >= 0);

-- ======================================================================
-- 3. PALIERS DE NIVEAU DÉJÀ OCTROYÉS
-- ======================================================================
-- Anti-double-claim des paliers 1-50. La clé primaire est la garantie : un
-- palier ne peut être crédité qu'une fois, même si deux parties se
-- terminent simultanément ou si une récompense est rejouée.
create table if not exists public.player_level_rewards (
  user_id uuid not null references public.profiles (id) on delete cascade,
  level integer not null check (level >= 1),
  -- Ce qui a réellement été crédité, pour l'historique du profil (§12).
  granted jsonb not null default '[]'::jsonb,
  granted_at timestamptz not null default now(),
  primary key (user_id, level)
);

alter table public.player_level_rewards enable row level security;

drop policy if exists "a user can read their own level rewards" on public.player_level_rewards;
drop policy if exists "a user can read their own level rewards" on public.player_level_rewards;
create policy "a user can read their own level rewards"
  on public.player_level_rewards for select to authenticated using (user_id = auth.uid());

-- ======================================================================
-- 4. COSMÉTIQUES DÉBLOQUÉS
-- ======================================================================
create table if not exists public.player_cosmetics (
  user_id uuid not null references public.profiles (id) on delete cascade,
  -- 'frame' | 'title' | 'avatar' | 'cardBack' | 'shipSkin' — la liste vit
  -- en TypeScript (`CosmeticKind`) : une nouvelle famille ne demande pas de
  -- migration.
  cosmetic_kind text not null,
  cosmetic_id text not null,
  label text not null default '',
  equipped boolean not null default false,
  unlocked_at timestamptz not null default now(),
  primary key (user_id, cosmetic_kind, cosmetic_id)
);

alter table public.player_cosmetics enable row level security;

drop policy if exists "a user can read their own cosmetics" on public.player_cosmetics;
drop policy if exists "a user can read their own cosmetics" on public.player_cosmetics;
create policy "a user can read their own cosmetics"
  on public.player_cosmetics for select to authenticated using (user_id = auth.uid());

-- ======================================================================
-- 5. CHOIX DE CARTE EN ATTENTE
-- ======================================================================
-- « Carte commune au choix parmi 3 » (§6) : le palier ouvre un CHOIX, il ne
-- crédite rien tout de suite. Les propositions sont tirées côté serveur à
-- l'octroi et figées ici — sans ça, un joueur pourrait recharger la page
-- jusqu'à obtenir les cartes qui l'intéressent.
create table if not exists public.player_card_choices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  -- Origine du choix : 'level' aujourd'hui, d'autres sources plus tard.
  source text not null default 'level',
  source_ref text not null,
  rarity public.card_rarity not null,
  offered_card_ids text[] not null,
  chosen_card_id text references public.cards (id),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  -- Un palier n'ouvre qu'un seul choix : clé d'idempotence.
  unique (user_id, source, source_ref)
);

alter table public.player_card_choices enable row level security;

drop policy if exists "a user can read their own card choices" on public.player_card_choices;
drop policy if exists "a user can read their own card choices" on public.player_card_choices;
create policy "a user can read their own card choices"
  on public.player_card_choices for select to authenticated using (user_id = auth.uid());

create index if not exists player_card_choices_pending_idx
  on public.player_card_choices (user_id) where resolved_at is null;

-- ======================================================================
-- 6. RÉCOMPENSES DE CONNEXION — cycle de 7, non punitif
-- ======================================================================
-- Ce qui rend le système NON PUNITIF (§8 : « Pas de streak remis à zéro »)
-- est le choix de ce qui est stocké : une ÉTAPE, pas une date de dernière
-- connexion consécutive. Rien, dans ce schéma, ne permet de « perdre » une
-- progression après une absence — il n'y a aucun compteur à réinitialiser.
create table if not exists public.player_login_rewards (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  step integer not null default 1 check (step >= 1),
  last_claimed_day date,
  total_claims integer not null default 0 check (total_claims >= 0),
  updated_at timestamptz not null default now()
);

alter table public.player_login_rewards enable row level security;

drop policy if exists "a user can read their own login rewards" on public.player_login_rewards;
drop policy if exists "a user can read their own login rewards" on public.player_login_rewards;
create policy "a user can read their own login rewards"
  on public.player_login_rewards for select to authenticated using (user_id = auth.uid());

-- ======================================================================
-- 7. EXPLOITS
-- ======================================================================
-- « Permanents et non renouvelables » (§10) : la clé primaire suffit à le
-- garantir. Les exploits sont ÉVALUÉS à partir des compteurs persistés
-- (`game/achievements/catalog.ts`), donc rattrapables : un exploit ajouté
-- plus tard se débloque à la première synchronisation d'un compte déjà
-- avancé, sans rejouer d'événements.
create table if not exists public.player_achievements (
  user_id uuid not null references public.profiles (id) on delete cascade,
  code text not null,
  tides_granted integer not null default 0,
  unlocked_at timestamptz not null default now(),
  primary key (user_id, code)
);

alter table public.player_achievements enable row level security;

drop policy if exists "a user can read their own achievements" on public.player_achievements;
drop policy if exists "a user can read their own achievements" on public.player_achievements;
create policy "a user can read their own achievements"
  on public.player_achievements for select to authenticated using (user_id = auth.uid());

-- ======================================================================
-- 8. DECKS FOURNIS PAR LE JEU — emprunt et préconstruits
-- ======================================================================
-- `source` distingue les deux familles de la spec (§3 et §4) :
--   'borrowed'     — deck d'emprunt gratuit, UN seul par joueur ;
--   'precon_token' — préconstruit débloqué en dépensant un Jeton.
-- Les cartes ne sont PAS créditées à la collection : un deck fourni se joue
-- avec des cartes prêtées, que les boosters remplacent progressivement par
-- des cartes réellement possédées (§3).
create table if not exists public.player_deck_unlocks (
  user_id uuid not null references public.profiles (id) on delete cascade,
  -- Identifiant de `game/cards/decks/catalog.ts` — pas de FK : le catalogue
  -- de decks vit en TypeScript, comme celui des quêtes et des exploits.
  deck_id text not null,
  source text not null check (source in ('borrowed', 'precon_token')),
  unlocked_at timestamptz not null default now(),
  primary key (user_id, deck_id)
);

alter table public.player_deck_unlocks enable row level security;

drop policy if exists "a user can read their own deck unlocks" on public.player_deck_unlocks;
drop policy if exists "a user can read their own deck unlocks" on public.player_deck_unlocks;
create policy "a user can read their own deck unlocks"
  on public.player_deck_unlocks for select to authenticated using (user_id = auth.uid());

-- Un seul deck d'EMPRUNT par joueur (§3 : « le joueur choisit son premier
-- deck d'emprunt »). Un index unique partiel plutôt qu'une vérification
-- applicative : deux clics simultanés ne peuvent pas en créer deux.
create unique index if not exists player_deck_unlocks_one_borrowed_idx
  on public.player_deck_unlocks (user_id) where source = 'borrowed';

-- ======================================================================
-- 9. QUÊTES — XP et remplacement gratuit
-- ======================================================================
alter table public.quests
  -- Les quêtes rapportent désormais XP **et** Tides (§9).
  add column if not exists reward_xp integer not null default 0 check (reward_xp >= 0),
  add column if not exists name text,
  -- Catégorie d'interface : 'cartes' | 'parties' | 'decks' | 'stats' |
  -- 'maree' (Notion « Catalogue de quêtes — Tidebound »). En `text` libre
  -- plutôt qu'en enum : la liste vit en TypeScript (`QuestCategory`), et
  -- une sixième famille ne doit pas demander de migration.
  add column if not exists category text,
  -- 'sum' (défaut) ou 'set' : un objectif `set` compte des valeurs
  -- DISTINCTES (« jouer avec 2 decks différents ») et a donc besoin de se
  -- souvenir de ce qui a déjà été vu, pas seulement d'un total.
  add column if not exists progress_kind text not null default 'sum';

-- Mémoire des valeurs distinctes déjà vues, pour les objectifs `set`.
-- Tableau JSON de chaînes ; `progress_value` en est la taille.
alter table public.player_quest_progress
  add column if not exists progress_meta jsonb not null default '[]'::jsonb;

-- Remplacements consommés par période (§9 : « prévoir 1 remplacement
-- gratuit par jour »). Une ligne par joueur et par période.
create table if not exists public.player_quest_rerolls (
  user_id uuid not null references public.profiles (id) on delete cascade,
  period_key text not null,
  used integer not null default 0 check (used >= 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, period_key)
);

alter table public.player_quest_rerolls enable row level security;

drop policy if exists "a user can read their own quest rerolls" on public.player_quest_rerolls;
drop policy if exists "a user can read their own quest rerolls" on public.player_quest_rerolls;
create policy "a user can read their own quest rerolls"
  on public.player_quest_rerolls for select to authenticated using (user_id = auth.uid());

-- ======================================================================
-- 10. NOUVEAU COMPTE — plus de booster automatique
-- ======================================================================
-- Changement de règle (§1) : « S'il termine le tutoriel, il reçoit 1 booster
-- de récompense. S'il passe le tutoriel, il ne reçoit pas ce booster. » Le
-- booster n'est donc plus offert à la création du compte ; c'est
-- `complete_tutorial` qui le crédite, et seulement en cas de réussite.
--
-- Les Tides de départ passent de 500 à 150 : le repère a changé (un booster
-- coûte 150), et laisser 500 donnerait plus de 3 boosters à un compte neuf,
-- ce qui contredit « la collection doit rester quelque chose que le joueur
-- construit lui-même ».
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1)));

  insert into public.player_currency (user_id, balance) values (new.id, 150);
  insert into public.currency_transactions (user_id, amount, reason) values (new.id, 150, 'starter_grant');
  insert into public.player_onboarding (user_id, starter_currency_granted, starter_standard_booster_claimed)
    values (new.id, true, false);
  insert into public.player_progression (user_id) values (new.id);
  insert into public.player_login_rewards (user_id) values (new.id);

  return new;
end;
$$;

-- Comptes existants : la ligne de connexions manquait.
insert into public.player_login_rewards (user_id)
select id from public.profiles
on conflict (user_id) do nothing;

-- ======================================================================
-- 11. OCTROI DES RÉCOMPENSES DE PARTIE (réécrit)
-- ======================================================================
-- Tout le CALCUL reste en TypeScript (`computeMatchReward`) : XP, Tides,
-- bonus quotidiens, anti-AFK, paliers franchis. Cette fonction ne fait que
-- l'APPLIQUER, atomiquement et une seule fois.
--
-- `p_level_rewards` : `[{ "level": 10, "items": [ {...}, ... ] }, ...]`.
-- Chaque palier est inséré dans `player_level_rewards` AVANT d'être
-- appliqué ; si la ligne existait déjà, ce palier est ignoré. L'octroi
-- redevient donc sûr même si l'appelant se trompe de `level_before`.
create or replace function public.grant_match_progression(
  p_match_id uuid,
  p_user_id uuid,
  p_xp integer,
  p_tides integer,
  p_target_level integer,
  p_level_before integer,
  p_first_win_of_day boolean,
  p_is_pvp_win boolean,
  p_is_win boolean,
  p_counts_for_daily boolean,
  p_level_rewards jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  v_xp_total bigint;
  v_level integer;
  v_tokens integer := 0;
  v_today date := (now() at time zone 'utc')::date;
  v_reward jsonb;
  v_item jsonb;
  v_level_value integer;
  v_extra_tides integer := 0;
  v_streak integer := 0;
begin
  perform public.assert_server_caller('grant_match_progression');

  if p_xp < 0 or p_tides < 0 then
    raise exception 'grant_match_progression: montants négatifs refusés (xp=%, tides=%)', p_xp, p_tides;
  end if;

  -- Clé d'idempotence. Si la ligne existe déjà, cette partie a déjà payé :
  -- on ressort l'état courant sans rien re-créditer.
  insert into public.match_rewards (
    match_id, user_id, xp_granted, tides_granted, level_before, level_after, first_win_of_day
  )
  values (p_match_id, p_user_id, p_xp, p_tides, p_level_before, p_target_level, p_first_win_of_day)
  on conflict (match_id, user_id) do nothing;

  if not found then
    select pp.xp_total, pp.level into v_xp_total, v_level
    from public.player_progression pp where pp.user_id = p_user_id;
    return jsonb_build_object('granted', false, 'xp_total', coalesce(v_xp_total, 0), 'level', coalesce(v_level, 1));
  end if;

  insert into public.player_progression (
    user_id, xp_total, level, matches_played, pvp_wins, last_pvp_win_day, last_win_day,
    daily_matches_day, daily_matches_count, play_streak_day, play_streak, best_play_streak
  )
  values (
    p_user_id,
    p_xp,
    greatest(1, p_target_level),
    1,
    case when p_is_pvp_win then 1 else 0 end,
    case when p_is_pvp_win then v_today else null end,
    case when p_is_win then v_today else null end,
    v_today,
    case when p_counts_for_daily then 1 else 0 end,
    v_today,
    1,
    1
  )
  on conflict (user_id) do update set
    xp_total = player_progression.xp_total + p_xp,
    level = greatest(player_progression.level, p_target_level),
    matches_played = player_progression.matches_played + 1,
    pvp_wins = player_progression.pvp_wins + case when p_is_pvp_win then 1 else 0 end,
    last_pvp_win_day = case when p_is_pvp_win then v_today else player_progression.last_pvp_win_day end,
    last_win_day = case when p_is_win then v_today else player_progression.last_win_day end,
    -- Compteur du jour : remis à 1 quand on change de journée UTC, incrémenté sinon.
    daily_matches_day = v_today,
    daily_matches_count = case
      when player_progression.daily_matches_day is distinct from v_today then case when p_counts_for_daily then 1 else 0 end
      else player_progression.daily_matches_count + case when p_counts_for_daily then 1 else 0 end
    end,
    -- SÉRIE. Trois cas, et un seul incrémente : même jour (rien ne bouge,
    -- la série se compte en jours, pas en parties), veille (+1), plus
    -- ancien ou jamais (la série repart à 1 — cette partie-ci en est le
    -- premier jour, pas 0).
    play_streak = case
      when player_progression.play_streak_day = v_today then greatest(player_progression.play_streak, 1)
      when player_progression.play_streak_day = v_today - 1 then player_progression.play_streak + 1
      else 1
    end,
    play_streak_day = v_today,
    best_play_streak = greatest(
      player_progression.best_play_streak,
      case
        when player_progression.play_streak_day = v_today then greatest(player_progression.play_streak, 1)
        when player_progression.play_streak_day = v_today - 1 then player_progression.play_streak + 1
        else 1
      end
    ),
    updated_at = now()
  returning player_progression.xp_total, player_progression.level, player_progression.play_streak
  into v_xp_total, v_level, v_streak;

  -- --- paliers franchis, un par un et une seule fois --------------------
  for v_reward in select * from jsonb_array_elements(coalesce(p_level_rewards, '[]'::jsonb)) loop
    v_level_value := (v_reward ->> 'level')::integer;

    insert into public.player_level_rewards (user_id, level, granted)
    values (p_user_id, v_level_value, coalesce(v_reward -> 'items', '[]'::jsonb))
    on conflict (user_id, level) do nothing;

    -- Palier déjà octroyé auparavant : on ne le rejoue pas.
    if not found then
      continue;
    end if;

    for v_item in select * from jsonb_array_elements(coalesce(v_reward -> 'items', '[]'::jsonb)) loop
      case v_item ->> 'kind'
        when 'tides' then
          v_extra_tides := v_extra_tides + coalesce((v_item ->> 'amount')::integer, 0);
        when 'booster' then
          insert into public.player_boosters (user_id, booster_definition_id, quantity)
          values (p_user_id, v_item ->> 'boosterId', coalesce((v_item ->> 'count')::integer, 1))
          on conflict (user_id, booster_definition_id) do update set
            quantity = player_boosters.quantity + coalesce((v_item ->> 'count')::integer, 1),
            updated_at = now();
        when 'preconToken' then
          v_tokens := v_tokens + coalesce((v_item ->> 'count')::integer, 1);
        when 'cosmetic' then
          insert into public.player_cosmetics (user_id, cosmetic_kind, cosmetic_id, label)
          values (p_user_id, v_item ->> 'cosmetic', v_item ->> 'id', coalesce(v_item ->> 'label', ''))
          on conflict (user_id, cosmetic_kind, cosmetic_id) do nothing;
        else
          -- 'cardChoice' et tout type futur : ouvert séparément par
          -- `open_card_choice`, qui a besoin d'un tirage de cartes.
          null;
      end case;
    end loop;
  end loop;

  if v_tokens > 0 then
    update public.player_progression
      set precon_tokens = player_progression.precon_tokens + v_tokens, updated_at = now()
      where user_id = p_user_id;
  end if;

  -- `p_tides` porte déjà les Tides de partie ET de palier calculées par
  -- l'appelant ; `v_extra_tides` ne sert qu'à recréditer un palier que
  -- l'appelant croyait déjà octroyé et qui ne l'était pas. Les deux ne
  -- peuvent pas se cumuler : on prend le maximum des deux lectures.
  if p_tides > 0 then
    insert into public.player_currency (user_id, balance)
    values (p_user_id, p_tides)
    on conflict (user_id) do update set
      balance = player_currency.balance + p_tides,
      updated_at = now();

    insert into public.currency_transactions (user_id, amount, reason, reference_id)
    values (p_user_id, p_tides, 'match_reward', p_match_id);
  end if;

  -- `play_streak` remonte à l'appelant : la progression des quêtes de série
  -- en a besoin, et la relire séparément ouvrirait une fenêtre où une autre
  -- partie l'aurait déjà changée.
  return jsonb_build_object(
    'granted', true,
    'xp_total', v_xp_total,
    'level', v_level,
    'precon_tokens_gained', v_tokens,
    'play_streak', v_streak
  );
end;
$$;

revoke all on function public.grant_match_progression(uuid, uuid, integer, integer, integer, integer, boolean, boolean, boolean, boolean, jsonb) from public, anon, authenticated;
grant execute on function public.grant_match_progression(uuid, uuid, integer, integer, integer, integer, boolean, boolean, boolean, boolean, jsonb) to service_role;

-- L'ancienne signature (9 arguments) n'a plus d'appelant : la retirer évite
-- qu'un appel périmé continue de créditer sans les nouveaux compteurs.
drop function if exists public.grant_match_progression(uuid, uuid, integer, integer, integer, integer, boolean, boolean, jsonb);

-- ======================================================================
-- 12. TUTORIEL
-- ======================================================================
-- §1 et §2 : le booster récompense l'APPRENTISSAGE. Terminer le tutoriel le
-- crédite une fois ; le passer ne crédite rien. Dans les deux cas l'état
-- devient définitif, donc l'écran de proposition ne revient pas.
create or replace function public.finish_tutorial(p_user_id uuid, p_completed boolean, p_booster_id text default 'standard')
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  v_status text;
  v_claimed boolean;
  v_granted boolean := false;
begin
  perform public.assert_server_caller('finish_tutorial');

  insert into public.player_onboarding (user_id) values (p_user_id)
  on conflict (user_id) do nothing;

  select po.tutorial_status, po.tutorial_reward_claimed into v_status, v_claimed
  from public.player_onboarding po where po.user_id = p_user_id
  for update;

  -- Le booster n'est crédité qu'une fois, et seulement pour un tutoriel
  -- TERMINÉ : repasser par « terminer » après avoir passé le tutoriel ne
  -- rouvre pas la récompense.
  if p_completed and not coalesce(v_claimed, false) then
    insert into public.player_boosters (user_id, booster_definition_id, quantity)
    values (p_user_id, p_booster_id, 1)
    on conflict (user_id, booster_definition_id) do update set
      quantity = player_boosters.quantity + 1,
      updated_at = now();
    v_granted := true;
  end if;

  update public.player_onboarding
    set tutorial_status = case when p_completed then 'completed' else 'skipped' end,
        tutorial_reward_claimed = coalesce(tutorial_reward_claimed, false) or v_granted,
        starter_standard_booster_claimed = coalesce(starter_standard_booster_claimed, false) or v_granted,
        updated_at = now()
    where user_id = p_user_id;

  return jsonb_build_object('ok', true, 'booster_granted', v_granted, 'status', case when p_completed then 'completed' else 'skipped' end);
end;
$$;

revoke all on function public.finish_tutorial(uuid, boolean, text) from public, anon, authenticated;
grant execute on function public.finish_tutorial(uuid, boolean, text) to service_role;

-- ======================================================================
-- 13. RÉCOMPENSE DE CONNEXION
-- ======================================================================
-- Une réclamation par jour UTC, et l'étape avance d'un cran — jamais de
-- remise à zéro. `for update` sérialise deux onglets ouverts en même temps ;
-- `last_claimed_day` est la garantie anti-double-claim.
create or replace function public.claim_login_reward(
  p_user_id uuid,
  p_step integer,
  p_next_step integer,
  p_tides integer,
  p_xp integer,
  p_booster_id text default null,
  p_card_id text default null
)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  v_today date := (now() at time zone 'utc')::date;
  v_last date;
  v_step integer;
begin
  perform public.assert_server_caller('claim_login_reward');

  insert into public.player_login_rewards (user_id) values (p_user_id)
  on conflict (user_id) do nothing;

  select plr.last_claimed_day, plr.step into v_last, v_step
  from public.player_login_rewards plr where plr.user_id = p_user_id
  for update;

  if v_last = v_today then
    return jsonb_build_object('ok', false, 'error', 'Récompense de connexion déjà réclamée aujourd''hui.', 'step', v_step);
  end if;

  -- L'étape appliquée est celle de la BASE, pas celle envoyée par
  -- l'appelant : une page restée ouverte ne peut pas rejouer une ancienne
  -- étape plus généreuse.
  if v_step is distinct from p_step then
    return jsonb_build_object('ok', false, 'error', 'Étape de connexion périmée, rechargez la page.', 'step', v_step);
  end if;

  update public.player_login_rewards
    set step = p_next_step, last_claimed_day = v_today, total_claims = total_claims + 1, updated_at = now()
    where user_id = p_user_id;

  if coalesce(p_tides, 0) > 0 then
    insert into public.player_currency (user_id, balance) values (p_user_id, p_tides)
    on conflict (user_id) do update set balance = player_currency.balance + p_tides, updated_at = now();
    insert into public.currency_transactions (user_id, amount, reason) values (p_user_id, p_tides, 'login_reward');
  end if;

  if coalesce(p_xp, 0) > 0 then
    insert into public.player_progression (user_id, xp_total) values (p_user_id, p_xp)
    on conflict (user_id) do update set xp_total = player_progression.xp_total + p_xp, updated_at = now();
  end if;

  if p_booster_id is not null then
    insert into public.player_boosters (user_id, booster_definition_id, quantity)
    values (p_user_id, p_booster_id, 1)
    on conflict (user_id, booster_definition_id) do update set
      quantity = player_boosters.quantity + 1, updated_at = now();
  end if;

  if p_card_id is not null then
    insert into public.player_cards (user_id, card_id, quantity) values (p_user_id, p_card_id, 1)
    on conflict (user_id, card_id) do update set
      quantity = player_cards.quantity + 1, updated_at = now();
  end if;

  return jsonb_build_object('ok', true, 'step', p_next_step, 'tides', coalesce(p_tides, 0), 'xp', coalesce(p_xp, 0));
end;
$$;

revoke all on function public.claim_login_reward(uuid, integer, integer, integer, integer, text, text) from public, anon, authenticated;
grant execute on function public.claim_login_reward(uuid, integer, integer, integer, integer, text, text) to service_role;

-- ======================================================================
-- 14. DECKS D'EMPRUNT ET PRÉCONSTRUITS
-- ======================================================================
-- Deck d'emprunt : gratuit, un seul, garanti par l'index unique partiel.
create or replace function public.claim_borrowed_deck(p_user_id uuid, p_deck_id text)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  v_existing text;
begin
  perform public.assert_server_caller('claim_borrowed_deck');

  select pdu.deck_id into v_existing
  from public.player_deck_unlocks pdu
  where pdu.user_id = p_user_id and pdu.source = 'borrowed';

  if v_existing is not null then
    return jsonb_build_object('ok', false, 'error', 'Vous avez déjà choisi votre deck d''emprunt.', 'deck_id', v_existing);
  end if;

  insert into public.player_deck_unlocks (user_id, deck_id, source)
  values (p_user_id, p_deck_id, 'borrowed')
  on conflict (user_id, deck_id) do nothing;

  return jsonb_build_object('ok', true, 'deck_id', p_deck_id);
end;
$$;

revoke all on function public.claim_borrowed_deck(uuid, text) from public, anon, authenticated;
grant execute on function public.claim_borrowed_deck(uuid, text) to service_role;

-- Préconstruit : coûte un Jeton. Le débit du jeton et le déblocage sont
-- dans la même transaction, sinon deux clics simultanés débloqueraient deux
-- decks pour un seul jeton.
create or replace function public.unlock_precon_deck(p_user_id uuid, p_deck_id text)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  v_tokens integer;
begin
  perform public.assert_server_caller('unlock_precon_deck');

  if exists (select 1 from public.player_deck_unlocks where user_id = p_user_id and deck_id = p_deck_id) then
    return jsonb_build_object('ok', false, 'error', 'Ce préconstruit est déjà débloqué.');
  end if;

  select pp.precon_tokens into v_tokens
  from public.player_progression pp where pp.user_id = p_user_id
  for update;

  if coalesce(v_tokens, 0) < 1 then
    return jsonb_build_object('ok', false, 'error', 'Aucun Jeton de Préconstruit disponible.', 'tokens', coalesce(v_tokens, 0));
  end if;

  update public.player_progression
    set precon_tokens = player_progression.precon_tokens - 1, updated_at = now()
    where user_id = p_user_id;

  insert into public.player_deck_unlocks (user_id, deck_id, source)
  values (p_user_id, p_deck_id, 'precon_token');

  return jsonb_build_object('ok', true, 'deck_id', p_deck_id, 'tokens', v_tokens - 1);
end;
$$;

revoke all on function public.unlock_precon_deck(uuid, text) from public, anon, authenticated;
grant execute on function public.unlock_precon_deck(uuid, text) to service_role;

-- ======================================================================
-- 15. EXPLOITS
-- ======================================================================
-- `p_achievements` : `[{ "code": "first_win", "tides": 25 }, ...]`, déjà
-- filtré par l'appelant sur ce que les compteurs autorisent. La clé
-- primaire fait le reste : un exploit déjà obtenu n'est jamais recrédité.
create or replace function public.grant_achievements(p_user_id uuid, p_achievements jsonb)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  v_entry jsonb;
  v_code text;
  v_tides integer;
  v_granted text[] := '{}';
  v_total integer := 0;
begin
  perform public.assert_server_caller('grant_achievements');

  for v_entry in select * from jsonb_array_elements(coalesce(p_achievements, '[]'::jsonb)) loop
    v_code := v_entry ->> 'code';
    v_tides := coalesce((v_entry ->> 'tides')::integer, 0);

    insert into public.player_achievements (user_id, code, tides_granted)
    values (p_user_id, v_code, v_tides)
    on conflict (user_id, code) do nothing;

    if found then
      v_granted := array_append(v_granted, v_code);
      v_total := v_total + v_tides;
    end if;
  end loop;

  if v_total > 0 then
    insert into public.player_currency (user_id, balance) values (p_user_id, v_total)
    on conflict (user_id) do update set balance = player_currency.balance + v_total, updated_at = now();
    insert into public.currency_transactions (user_id, amount, reason) values (p_user_id, v_total, 'achievement_reward');
  end if;

  return jsonb_build_object('ok', true, 'granted', to_jsonb(v_granted), 'tides', v_total);
end;
$$;

revoke all on function public.grant_achievements(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.grant_achievements(uuid, jsonb) to service_role;

-- ======================================================================
-- 16. RÉCLAMATION DE QUÊTE — avec XP
-- ======================================================================
create or replace function public.claim_quest_reward(p_user_id uuid, p_quest_id uuid, p_period_key text)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  v_completed_at timestamptz;
  v_claimed_at timestamptz;
  v_reward integer;
  v_xp integer;
  v_booster text;
  v_balance integer;
begin
  perform public.assert_server_caller('claim_quest_reward');

  select pqp.completed_at, pqp.claimed_at into v_completed_at, v_claimed_at
  from public.player_quest_progress pqp
  where pqp.user_id = p_user_id and pqp.quest_id = p_quest_id and pqp.period_key = p_period_key
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'Quête introuvable.');
  end if;
  if v_completed_at is null then
    return jsonb_build_object('ok', false, 'error', 'Cette quête n''est pas encore terminée.');
  end if;
  if v_claimed_at is not null then
    return jsonb_build_object('ok', false, 'error', 'Récompense déjà réclamée.');
  end if;

  select q.reward_currency, q.reward_xp, q.reward_booster_definition_id into v_reward, v_xp, v_booster
  from public.quests q where q.id = p_quest_id;

  update public.player_quest_progress
    set claimed_at = now()
    where user_id = p_user_id and quest_id = p_quest_id and period_key = p_period_key;

  if coalesce(v_reward, 0) > 0 then
    insert into public.player_currency (user_id, balance)
    values (p_user_id, v_reward)
    on conflict (user_id) do update set
      balance = player_currency.balance + v_reward,
      updated_at = now();

    insert into public.currency_transactions (user_id, amount, reason, reference_id)
    values (p_user_id, v_reward, 'quest_reward', p_quest_id);
  end if;

  -- Nouveauté : une quête rapporte aussi de l'XP (§9). Le passage de niveau
  -- éventuel est rattrapé à la partie suivante — `computeMatchReward`
  -- recalcule toujours le niveau depuis l'XP cumulée.
  if coalesce(v_xp, 0) > 0 then
    insert into public.player_progression (user_id, xp_total) values (p_user_id, v_xp)
    on conflict (user_id) do update set xp_total = player_progression.xp_total + v_xp, updated_at = now();
  end if;

  if v_booster is not null then
    insert into public.player_boosters (user_id, booster_definition_id, quantity)
    values (p_user_id, v_booster, 1)
    on conflict (user_id, booster_definition_id) do update set
      quantity = player_boosters.quantity + 1,
      updated_at = now();
  end if;

  select pc.balance into v_balance from public.player_currency pc where pc.user_id = p_user_id;

  return jsonb_build_object(
    'ok', true,
    'tides_gained', coalesce(v_reward, 0),
    'xp_gained', coalesce(v_xp, 0),
    'booster_id', v_booster,
    'balance', coalesce(v_balance, 0)
  );
end;
$$;

revoke all on function public.claim_quest_reward(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.claim_quest_reward(uuid, uuid, text) to service_role;

-- ======================================================================
-- 16 bis. PROGRESSION D'UNE PARTIE — cumuls ET ensembles
-- ======================================================================
-- Deux familles d'objectifs coexistent désormais :
--   * `sum`  — on additionne (« Jouer 15 Créatures ») ;
--   * `set`  — on compte des valeurs DISTINCTES (« Jouer avec 2 decks
--              différents »), d'où `progress_meta`, l'ensemble de ce que le
--              joueur a déjà vu pour cette quête et cette période.
--
-- `p_sets` : `{ objective_key: ["valeur", ...] }`. La fusion se fait en SQL
-- plutôt qu'en lisant-modifiant-réécrivant côté application : deux parties
-- terminées en même temps perdraient sinon l'une des deux valeurs.
create or replace function public.record_match_quest_progress(
  p_match_id uuid,
  p_user_id uuid,
  p_vs_bot boolean,
  p_period_keys text[],
  p_progress jsonb,
  p_sets jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  v_completed integer := 0;
  v_set_completed integer := 0;
  v_max_completed integer := 0;
  v_meta_completed integer := 0;
  -- Journalières qui viennent de basculer : c'est ce que compte la
  -- méta-quête « Terminer N quêtes journalières ».
  v_daily_completed integer := 0;
  v_daily_from_sets integer := 0;
  v_daily_from_max integer := 0;
begin
  perform public.assert_server_caller('record_match_quest_progress');

  insert into public.match_quest_progress (match_id, user_id, progress)
  values (p_match_id, p_user_id, coalesce(p_progress, '{}'::jsonb))
  on conflict (match_id, user_id) do nothing;

  if not found then
    return jsonb_build_object('ok', true, 'recorded', false, 'completed', 0);
  end if;

  -- --- objectifs cumulatifs --------------------------------------------
  with advanced as (
    update public.player_quest_progress pqp
      set progress_value = least(q.target_value, pqp.progress_value + (p_progress ->> q.objective_key)::integer),
          completed_at = case
            when pqp.progress_value + (p_progress ->> q.objective_key)::integer >= q.target_value then now()
            else null
          end
      from public.quests q
      where q.id = pqp.quest_id
        and pqp.user_id = p_user_id
        and pqp.period_key = any (p_period_keys)
        and pqp.completed_at is null
        and coalesce(q.progress_kind, 'sum') = 'sum'
        and p_progress ? q.objective_key
        and (p_progress ->> q.objective_key)::integer > 0
        and (not p_vs_bot or q.bot_progress_allowed)
      returning pqp.completed_at, q.quest_type
  )
  select
    count(*) filter (where completed_at is not null),
    count(*) filter (where completed_at is not null and quest_type = 'daily')
  into v_completed, v_daily_completed
  from advanced;

  -- --- objectifs d'ensemble ---------------------------------------------
  -- Union de l'ensemble mémorisé et des valeurs apportées par la partie,
  -- puis recomptage : une valeur déjà vue ne fait donc jamais avancer.
  with merged as (
    select
      pqp.quest_id,
      pqp.period_key,
      q.target_value,
      q.quest_type,
      (
        select coalesce(jsonb_agg(distinct value), '[]'::jsonb)
        from (
          select jsonb_array_elements_text(pqp.progress_meta) as value
          union
          select jsonb_array_elements_text(p_sets -> q.objective_key) as value
        ) as combined
      ) as next_meta
    from public.player_quest_progress pqp
    join public.quests q on q.id = pqp.quest_id
    where pqp.user_id = p_user_id
      and pqp.period_key = any (p_period_keys)
      and pqp.completed_at is null
      and q.progress_kind = 'set'
      and p_sets ? q.objective_key
      and (not p_vs_bot or q.bot_progress_allowed)
  ),
  advanced_sets as (
    update public.player_quest_progress pqp
      set progress_meta = m.next_meta,
          progress_value = least(m.target_value, jsonb_array_length(m.next_meta)),
          completed_at = case when jsonb_array_length(m.next_meta) >= m.target_value then now() else null end
      from merged m
      where pqp.user_id = p_user_id and pqp.quest_id = m.quest_id and pqp.period_key = m.period_key
      returning pqp.completed_at, m.quest_type
  )
  select
    count(*) filter (where completed_at is not null),
    count(*) filter (where completed_at is not null and quest_type = 'daily')
  into v_set_completed, v_daily_from_sets
  from advanced_sets;

  -- --- objectifs de MAXIMUM ---------------------------------------------
  -- La valeur reçue est un ÉTAT du compte (une série de jours), pas un
  -- incrément : on garde la plus grande vue pendant la période. Une série
  -- cassée fait donc redescendre le compte du joueur sans défaire la quête
  -- — perdre une quête déjà gagnée parce qu'on a sauté un soir serait la
  -- punir deux fois.
  with advanced_max as (
    update public.player_quest_progress pqp
      set progress_value = least(q.target_value, greatest(pqp.progress_value, (p_progress ->> q.objective_key)::integer)),
          completed_at = case
            when greatest(pqp.progress_value, (p_progress ->> q.objective_key)::integer) >= q.target_value then now()
            else null
          end
      from public.quests q
      where q.id = pqp.quest_id
        and pqp.user_id = p_user_id
        and pqp.period_key = any (p_period_keys)
        and pqp.completed_at is null
        and q.progress_kind = 'max'
        and p_progress ? q.objective_key
        and (p_progress ->> q.objective_key)::integer > 0
        and (not p_vs_bot or q.bot_progress_allowed)
      returning pqp.completed_at, q.quest_type
  )
  select
    count(*) filter (where completed_at is not null),
    count(*) filter (where completed_at is not null and quest_type = 'daily')
  into v_max_completed, v_daily_from_max
  from advanced_max;

  v_daily_completed := v_daily_completed + v_daily_from_sets + v_daily_from_max;

  -- --- méta-quête : « Terminer N quêtes journalières » -------------------
  -- Elle se nourrit des passes ci-dessus, et doit donc venir APRÈS elles.
  -- Aucune boucle possible : son objectif n'est jamais dans `p_progress`,
  -- les passes précédentes ne peuvent pas la toucher, et elle ne compte que
  -- des quêtes JOURNALIÈRES alors qu'elle est hebdomadaire.
  --
  -- Compte la COMPLÉTION, pas la réclamation : une journalière terminée et
  -- laissée sans être réclamée compte quand même — c'est de l'avoir faite
  -- qu'on récompense.
  if v_daily_completed > 0 then
    with advanced_meta as (
      update public.player_quest_progress pqp
        set progress_value = least(q.target_value, pqp.progress_value + v_daily_completed),
            completed_at = case when pqp.progress_value + v_daily_completed >= q.target_value then now() else null end
        from public.quests q
        where q.id = pqp.quest_id
          and pqp.user_id = p_user_id
          and pqp.period_key = any (p_period_keys)
          and pqp.completed_at is null
          and q.objective_key = 'complete_daily_quests'
          and (not p_vs_bot or q.bot_progress_allowed)
        returning pqp.completed_at
    )
    select count(*) filter (where completed_at is not null) into v_meta_completed from advanced_meta;
  end if;

  return jsonb_build_object(
    'ok', true,
    'recorded', true,
    'completed', v_completed + v_set_completed + v_max_completed + v_meta_completed,
    'dailies_completed', v_daily_completed
  );
end;
$$;

revoke all on function public.record_match_quest_progress(uuid, uuid, boolean, text[], jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.record_match_quest_progress(uuid, uuid, boolean, text[], jsonb, jsonb) to service_role;

-- L'ancienne signature (5 arguments) n'a plus d'appelant : la retirer évite
-- qu'un appel périmé continue d'écrire sans gérer les ensembles.
drop function if exists public.record_match_quest_progress(uuid, uuid, boolean, text[], jsonb);

-- Une quête remplacée repart d'un ensemble vide : `reroll_player_quest`
-- supprime puis réinsère la ligne, `progress_meta` reprend son défaut.

-- ======================================================================
-- 17. REMPLACEMENT D'UNE QUÊTE
-- ======================================================================
-- Le TIRAGE de la remplaçante est fait en TypeScript
-- (`pickReplacementQuest`, déterministe). Cette fonction vérifie le quota,
-- le consomme, et échange la ligne — le tout dans une transaction, pour que
-- deux clics ne consomment pas deux remplacements différents.
--
-- Une quête déjà TERMINÉE n'est pas remplaçable : ce serait un moyen de
-- rejouer la même récompense.
create or replace function public.reroll_player_quest(
  p_user_id uuid,
  p_period_key text,
  p_quest_id uuid,
  p_new_quest_code text,
  p_max_rerolls integer
)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  v_used integer;
  v_completed_at timestamptz;
  v_new_quest_id uuid;
begin
  perform public.assert_server_caller('reroll_player_quest');

  select q.id into v_new_quest_id from public.quests q where q.code = p_new_quest_code and q.is_enabled;
  if v_new_quest_id is null then
    return jsonb_build_object('ok', false, 'error', 'Quête de remplacement introuvable.');
  end if;

  insert into public.player_quest_rerolls (user_id, period_key) values (p_user_id, p_period_key)
  on conflict (user_id, period_key) do nothing;

  select pqr.used into v_used
  from public.player_quest_rerolls pqr
  where pqr.user_id = p_user_id and pqr.period_key = p_period_key
  for update;

  if coalesce(v_used, 0) >= p_max_rerolls then
    return jsonb_build_object('ok', false, 'error', 'Plus de remplacement disponible pour cette période.');
  end if;

  select pqp.completed_at into v_completed_at
  from public.player_quest_progress pqp
  where pqp.user_id = p_user_id and pqp.quest_id = p_quest_id and pqp.period_key = p_period_key
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'Quête introuvable.');
  end if;
  if v_completed_at is not null then
    return jsonb_build_object('ok', false, 'error', 'Une quête terminée ne peut pas être remplacée.');
  end if;

  delete from public.player_quest_progress
    where user_id = p_user_id and quest_id = p_quest_id and period_key = p_period_key;

  insert into public.player_quest_progress (user_id, quest_id, period_key)
  values (p_user_id, v_new_quest_id, p_period_key)
  on conflict (user_id, quest_id, period_key) do nothing;

  update public.player_quest_rerolls
    set used = used + 1, updated_at = now()
    where user_id = p_user_id and period_key = p_period_key;

  return jsonb_build_object('ok', true, 'quest_id', v_new_quest_id, 'remaining', p_max_rerolls - coalesce(v_used, 0) - 1);
end;
$$;

revoke all on function public.reroll_player_quest(uuid, text, uuid, text, integer) from public, anon, authenticated;
grant execute on function public.reroll_player_quest(uuid, text, uuid, text, integer) to service_role;

-- ======================================================================
-- 18. CHOIX DE CARTE DE PALIER
-- ======================================================================
-- Ouverture : les propositions sont figées ici, une seule fois par palier.
-- La rareté est prise en TEXTE, pas en `card_rarity` : la migration du Lot
-- 11 convertit l'enum en colonne texte contrainte, et une signature qui
-- référencerait encore le type rendrait ce fichier injouable après elle.
-- Une signature enum laissée par un passage antérieur est retirée d'abord.
do $do$
begin
  if exists (select 1 from pg_type where typname = 'card_rarity' and typnamespace = 'public'::regnamespace) then
    execute 'drop function if exists public.open_card_choice(uuid, text, text, public.card_rarity, text[])';
  end if;
end $do$;

create or replace function public.open_card_choice(
  p_user_id uuid,
  p_source text,
  p_source_ref text,
  p_rarity text,
  p_card_ids text[]
)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  v_id uuid;
begin
  perform public.assert_server_caller('open_card_choice');

  insert into public.player_card_choices (user_id, source, source_ref, rarity, offered_card_ids)
  values (p_user_id, p_source, p_source_ref, p_rarity, p_card_ids)
  on conflict (user_id, source, source_ref) do nothing
  returning id into v_id;

  return jsonb_build_object('ok', true, 'opened', v_id is not null, 'choice_id', v_id);
end;
$$;

revoke all on function public.open_card_choice(uuid, text, text, text, text[]) from public, anon, authenticated;
grant execute on function public.open_card_choice(uuid, text, text, text, text[]) to service_role;

-- Résolution : la carte doit faire partie des propositions figées, et le
-- choix ne peut être tranché qu'une fois.
create or replace function public.resolve_card_choice(p_user_id uuid, p_choice_id uuid, p_card_id text)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  v_offered text[];
  v_resolved timestamptz;
begin
  perform public.assert_server_caller('resolve_card_choice');

  select pcc.offered_card_ids, pcc.resolved_at into v_offered, v_resolved
  from public.player_card_choices pcc
  where pcc.id = p_choice_id and pcc.user_id = p_user_id
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'Choix introuvable.');
  end if;
  if v_resolved is not null then
    return jsonb_build_object('ok', false, 'error', 'Choix déjà effectué.');
  end if;
  if not (p_card_id = any (v_offered)) then
    return jsonb_build_object('ok', false, 'error', 'Cette carte ne fait pas partie des propositions.');
  end if;

  update public.player_card_choices
    set chosen_card_id = p_card_id, resolved_at = now()
    where id = p_choice_id;

  insert into public.player_cards (user_id, card_id, quantity)
  values (p_user_id, p_card_id, 1)
  on conflict (user_id, card_id) do update set
    quantity = player_cards.quantity + 1, updated_at = now();

  return jsonb_build_object('ok', true, 'card_id', p_card_id);
end;
$$;

revoke all on function public.resolve_card_choice(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.resolve_card_choice(uuid, uuid, text) to service_role;

-- ======================================================================
-- 19. ÉQUIPER UN COSMÉTIQUE
-- ======================================================================
-- Aujourd'hui, seuls les DOS DE CARTE ont un rendu (catalogue TypeScript
-- `game/cosmetics/cardBacks.ts`) ; la fonction est écrite pour toutes les
-- familles, puisque la spec demande d'ajouter des cosmétiques « sans
-- recoder le système en dur ».
--
-- Un seul équipé par famille : la mise à zéro et l'équipement sont dans la
-- MÊME fonction, donc dans la même transaction — jamais d'état où le joueur
-- n'a plus aucun cosmétique de la famille.
--
-- `p_cosmetic_id` nul = revenir à l'apparence par défaut. Le défaut n'est
-- pas stocké : il n'est possédé par personne en base, il est possédé par
-- tout le monde par construction. Retirer une ligne suffit à y revenir.
create or replace function public.equip_cosmetic(
  p_user_id uuid,
  p_cosmetic_kind text,
  p_cosmetic_id text
)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  v_owned boolean;
begin
  perform public.assert_server_caller('equip_cosmetic');

  if p_cosmetic_id is not null then
    select true into v_owned
    from public.player_cosmetics
    where user_id = p_user_id
      and cosmetic_kind = p_cosmetic_kind
      and cosmetic_id = p_cosmetic_id;

    -- Refus plutôt que déblocage implicite : équiper n'a jamais le droit de
    -- donner. Un cosmétique s'obtient par un palier de niveau, pas par un
    -- appel bien formé.
    if v_owned is not true then
      return jsonb_build_object('ok', false, 'error', 'not_owned');
    end if;
  end if;

  update public.player_cosmetics
  set equipped = false
  where user_id = p_user_id
    and cosmetic_kind = p_cosmetic_kind
    and equipped;

  if p_cosmetic_id is not null then
    update public.player_cosmetics
    set equipped = true
    where user_id = p_user_id
      and cosmetic_kind = p_cosmetic_kind
      and cosmetic_id = p_cosmetic_id;
  end if;

  return jsonb_build_object('ok', true, 'cosmetic_id', p_cosmetic_id);
end;
$$;

revoke all on function public.equip_cosmetic(uuid, text, text) from public, anon, authenticated;
grant execute on function public.equip_cosmetic(uuid, text, text) to service_role;
