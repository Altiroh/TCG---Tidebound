-- ======================================================================
-- BANQUE D'ÉQUILIBRAGE — le relevé détaillé de chaque partie terminée,
-- carte par carte, pour rééquilibrer sur des chiffres réels
-- ======================================================================
-- Les compteurs à vie (`player_lifetime_stats`) disent ce qu'un JOUEUR a
-- fait. Pour rééquilibrer, il faut savoir ce que fait une CARTE : dans
-- combien de decks elle entre, à quel tour elle sort, ce qu'elle frappe,
-- et surtout si le camp qui la joue gagne plus souvent que celui qui ne la
-- joue pas. Rien de tout ça n'est affiché au joueur : c'est une banque de
-- mesures, lue par l'équipe (`npm run banque`).
--
-- Le relevé vient de `computeMatchBalanceReport` (`game/balance/`), dérivé
-- du journal d'événements par le serveur — jamais du client.
--
-- Trois tables, une écriture :
--
--   1. `balance_matches` — une ligne par partie : mode, difficulté du bot,
--      durée, tours, issue, siège du premier joueur, version du relevé et
--      build de l'application.
--   2. `balance_match_seats` — une ligne par SIÈGE (bot compris) : Navire,
--      deck, issue, tours joués, Ancrage final, et le relevé complet des
--      statistiques de partie (`stats`, mêmes clés que les compteurs à vie).
--   3. `balance_card_lines` — une ligne par siège et par carte : exemplaires,
--      vues en main, poses, tour moyen, dégâts, destructions, morts…, avec
--      l'EMPREINTE de la définition (`def_hash`) pour séparer l'avant et
--      l'après d'une retouche. L'issue, le mode, le camp et le Navire y sont
--      recopiés : une agrégation par carte n'a besoin d'aucune jointure.
--
--   `record_match_balance_report` écrit le tout d'un bloc, IDEMPOTENTE par
--   partie (clé `balance_matches.match_id`).
--
-- Pas de clé étrangère vers `matches` : la banque doit survivre au ménage
-- des vieilles parties. Le joueur, lui, est oublié (`on delete set null`)
-- si son compte est supprimé — la mesure reste, anonyme.
--
-- Accès : aucune politique RLS, donc rien pour `anon` / `authenticated` ;
-- les vues sont `security_invoker` et leurs droits retirés aux mêmes rôles.
-- Seul le serveur (service_role) lit et écrit.
--
-- La propriétaire applique les migrations À LA MAIN : tant que celle-ci ne
-- l'est pas, l'appel d'écriture échoue, se journalise, et la fin de partie
-- continue comme avant.
--
-- Entièrement idempotente : rejouable sans risque.


-- --- 1. Tables ------------------------------------------------------------

create table if not exists public.balance_matches (
  match_id uuid primary key,
  mode text not null,
  bot_difficulty text,
  report_version smallint not null,
  build text,
  seconds integer not null default 0 check (seconds >= 0),
  table_turns integer not null default 0 check (table_turns >= 0),
  end_reason text,
  -- NULL : match nul.
  winner_seat smallint check (winner_seat in (1, 2)),
  first_seat smallint check (first_seat in (1, 2)),
  finished_at timestamptz not null default now()
);

create index if not exists balance_matches_finished_at_idx on public.balance_matches (finished_at desc);

alter table public.balance_matches enable row level security;

create table if not exists public.balance_match_seats (
  match_id uuid not null references public.balance_matches (match_id) on delete cascade,
  seat smallint not null check (seat in (1, 2)),
  user_id uuid references public.profiles (id) on delete set null,
  is_bot boolean not null default false,
  ship_id text not null,
  deck_id text,
  result text not null check (result in ('win', 'loss', 'draw')),
  went_first boolean not null default false,
  own_turns integer not null default 0,
  final_anchor integer not null default 0,
  final_reason integer not null default 0,
  ship_ability_uses integer not null default 0,
  ship_ability_damage integer not null default 0,
  -- Partie vraiment jouée par ce siège (pas un abandon immédiat) — même règle que les récompenses.
  counts_as_played boolean not null default true,
  stats jsonb not null default '{}'::jsonb,
  primary key (match_id, seat)
);

create index if not exists balance_match_seats_user_idx on public.balance_match_seats (user_id) where user_id is not null;
create index if not exists balance_match_seats_ship_idx on public.balance_match_seats (ship_id);

alter table public.balance_match_seats enable row level security;

create table if not exists public.balance_card_lines (
  match_id uuid not null,
  seat smallint not null,
  card_id text not null check (card_id ~ '^[a-z0-9][a-z0-9-]{0,95}$'),
  def_hash text not null,
  copies integer not null default 0 check (copies >= 0),
  seen integer not null default 0 check (seen >= 0),
  played integer not null default 0 check (played >= 0),
  play_turn_sum integer not null default 0 check (play_turn_sum >= 0),
  summoned integer not null default 0 check (summoned >= 0),
  damage_dealt integer not null default 0 check (damage_dealt >= 0),
  ship_damage integer not null default 0 check (ship_damage >= 0),
  kills integer not null default 0 check (kills >= 0),
  deaths integer not null default 0 check (deaths >= 0),
  reactions integer not null default 0 check (reactions >= 0),
  abilities integer not null default 0 check (abilities >= 0),
  -- Recopiés du siège et de la partie, pour agréger sans jointure.
  result text not null check (result in ('win', 'loss', 'draw')),
  is_bot boolean not null default false,
  mode text not null,
  ship_id text not null,
  counts_as_played boolean not null default true,
  primary key (match_id, seat, card_id),
  foreign key (match_id, seat) references public.balance_match_seats (match_id, seat) on delete cascade
);

create index if not exists balance_card_lines_card_idx on public.balance_card_lines (card_id, def_hash);

alter table public.balance_card_lines enable row level security;


-- --- 2. Écriture d'un relevé ------------------------------------------------
/*
 * `p_report` :
 *   {
 *     "mode": "bot" | "matchmaking" | "friendly" | …,
 *     "bot_difficulty": "facile" | … | null,
 *     "version": 1, "build": "<sha>" | null,
 *     "seconds": 0, "table_turns": 0, "end_reason": "anchorZero" | …,
 *     "winner_seat": 1 | 2 | null, "first_seat": 1 | 2 | null,
 *     "seats": [ { "seat", "user_id", "is_bot", "ship_id", "deck_id",
 *                  "result", "went_first", "own_turns", "final_anchor",
 *                  "final_reason", "ship_ability_uses",
 *                  "ship_ability_damage", "counts_as_played", "stats",
 *                  "cards": [ { "card_id", "def_hash", "copies", "seen",
 *                               "played", "play_turn_sum", "summoned",
 *                               "damage_dealt", "ship_damage", "kills",
 *                               "deaths", "reactions", "abilities" } ] } ]
 *   }
 *
 * Défensive sur le volume (2 sièges, 200 cartes par siège) ; les
 * contraintes des tables refusent le reste (valeurs négatives, issue
 * inconnue) — et avec elles TOUT le relevé, puisque l'écriture est un seul
 * bloc. Retour : `recorded` = la partie vient d'être versée.
 */
create or replace function public.record_match_balance_report(
  p_match_id uuid,
  p_report jsonb
)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  v_seat jsonb;
  v_cards integer := 0;
begin
  perform public.assert_server_caller('record_match_balance_report');

  if p_match_id is null or p_report is null or jsonb_typeof(p_report) <> 'object' then
    return jsonb_build_object('ok', false, 'error', 'Relevé invalide.');
  end if;
  if jsonb_typeof(p_report -> 'seats') <> 'array' or jsonb_array_length(p_report -> 'seats') not between 1 and 2 then
    return jsonb_build_object('ok', false, 'error', 'Sièges invalides.');
  end if;
  for v_seat in select value from jsonb_array_elements(p_report -> 'seats') loop
    if jsonb_typeof(v_seat -> 'cards') <> 'array' or jsonb_array_length(v_seat -> 'cards') > 200 then
      return jsonb_build_object('ok', false, 'error', 'Relevé de cartes invalide.');
    end if;
  end loop;

  insert into public.balance_matches (
    match_id, mode, bot_difficulty, report_version, build, seconds, table_turns, end_reason, winner_seat, first_seat
  )
  values (
    p_match_id,
    coalesce(p_report ->> 'mode', 'inconnu'),
    p_report ->> 'bot_difficulty',
    coalesce((p_report ->> 'version')::smallint, 0),
    left(p_report ->> 'build', 64),
    greatest(0, coalesce((p_report ->> 'seconds')::integer, 0)),
    greatest(0, coalesce((p_report ->> 'table_turns')::integer, 0)),
    left(p_report ->> 'end_reason', 32),
    (p_report ->> 'winner_seat')::smallint,
    (p_report ->> 'first_seat')::smallint
  )
  on conflict (match_id) do nothing;

  if not found then
    return jsonb_build_object('ok', true, 'recorded', false);
  end if;

  insert into public.balance_match_seats (
    match_id, seat, user_id, is_bot, ship_id, deck_id, result, went_first, own_turns,
    final_anchor, final_reason, ship_ability_uses, ship_ability_damage, counts_as_played, stats
  )
  select
    p_match_id,
    (s ->> 'seat')::smallint,
    (s ->> 'user_id')::uuid,
    coalesce((s ->> 'is_bot')::boolean, false),
    s ->> 'ship_id',
    left(s ->> 'deck_id', 128),
    s ->> 'result',
    coalesce((s ->> 'went_first')::boolean, false),
    coalesce((s ->> 'own_turns')::integer, 0),
    coalesce((s ->> 'final_anchor')::integer, 0),
    coalesce((s ->> 'final_reason')::integer, 0),
    coalesce((s ->> 'ship_ability_uses')::integer, 0),
    coalesce((s ->> 'ship_ability_damage')::integer, 0),
    coalesce((s ->> 'counts_as_played')::boolean, true),
    case when jsonb_typeof(s -> 'stats') = 'object' then s -> 'stats' else '{}'::jsonb end
  from jsonb_array_elements(p_report -> 'seats') as s;

  insert into public.balance_card_lines (
    match_id, seat, card_id, def_hash, copies, seen, played, play_turn_sum, summoned, damage_dealt,
    ship_damage, kills, deaths, reactions, abilities, result, is_bot, mode, ship_id, counts_as_played
  )
  select
    p_match_id,
    seat.seat,
    c ->> 'card_id',
    coalesce(left(c ->> 'def_hash', 16), ''),
    coalesce((c ->> 'copies')::integer, 0),
    coalesce((c ->> 'seen')::integer, 0),
    coalesce((c ->> 'played')::integer, 0),
    coalesce((c ->> 'play_turn_sum')::integer, 0),
    coalesce((c ->> 'summoned')::integer, 0),
    coalesce((c ->> 'damage_dealt')::integer, 0),
    coalesce((c ->> 'ship_damage')::integer, 0),
    coalesce((c ->> 'kills')::integer, 0),
    coalesce((c ->> 'deaths')::integer, 0),
    coalesce((c ->> 'reactions')::integer, 0),
    coalesce((c ->> 'abilities')::integer, 0),
    seat.result,
    seat.is_bot,
    coalesce(p_report ->> 'mode', 'inconnu'),
    seat.ship_id,
    seat.counts_as_played
  from jsonb_array_elements(p_report -> 'seats') as s
  join public.balance_match_seats as seat
    on seat.match_id = p_match_id and seat.seat = (s ->> 'seat')::smallint
  cross join lateral jsonb_array_elements(s -> 'cards') as c;

  get diagnostics v_cards = row_count;

  return jsonb_build_object('ok', true, 'recorded', true, 'cards', v_cards);
end;
$$;

revoke all on function public.record_match_balance_report(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.record_match_balance_report(uuid, jsonb) to service_role;


-- --- 3. Vues d'agrégation ------------------------------------------------
/*
 * Lues par `npm run banque`. Toutes excluent les parties non jouées
 * (`counts_as_played`) ; le camp (`is_bot`) reste une colonne de
 * regroupement : le bot joue moins bien qu'un humain, ses chiffres ne se
 * mélangent pas à ceux des joueurs.
 *
 * Lecture des taux, à la manière des tableaux de draft :
 *   - `win_rate_in_deck`  : victoires du camp qui a la carte dans son deck ;
 *   - `win_rate_seen`     : … quand elle est passée par la main ;
 *   - `win_rate_not_seen` : … quand elle est restée dans le deck ;
 *   - `win_rate_played`   : … quand elle a été jouée.
 * L'écart `win_rate_seen - win_rate_not_seen` est l'indicateur le plus
 * honnête de ce qu'une carte APPORTE (il neutralise la force du deck).
 * Les nuls comptent comme des non-victoires.
 */
create or replace view public.balance_card_overview
with (security_invoker = true) as
select
  card_id,
  is_bot,
  count(*) filter (where copies > 0) as matches_in_deck,
  round(avg((result = 'win')::int) filter (where copies > 0), 4) as win_rate_in_deck,
  count(*) filter (where seen > 0) as matches_seen,
  round(avg((result = 'win')::int) filter (where seen > 0), 4) as win_rate_seen,
  count(*) filter (where copies > 0 and seen = 0) as matches_not_seen,
  round(avg((result = 'win')::int) filter (where copies > 0 and seen = 0), 4) as win_rate_not_seen,
  count(*) filter (where played > 0) as matches_played,
  round(avg((result = 'win')::int) filter (where played > 0), 4) as win_rate_played,
  sum(played) as plays,
  round(sum(play_turn_sum)::numeric / nullif(sum(played), 0), 2) as avg_play_turn,
  round(sum(copies)::numeric / nullif(count(*) filter (where copies > 0), 0), 2) as avg_copies,
  sum(summoned) as summoned,
  sum(damage_dealt) as damage_dealt,
  round(sum(damage_dealt)::numeric / nullif(sum(played) + sum(summoned), 0), 2) as damage_per_appearance,
  sum(ship_damage) as ship_damage,
  sum(kills) as kills,
  round(sum(kills)::numeric / nullif(sum(played) + sum(summoned), 0), 2) as kills_per_appearance,
  sum(deaths) as deaths,
  sum(reactions) as reactions,
  sum(abilities) as abilities
from public.balance_card_lines
where counts_as_played
group by card_id, is_bot;

-- Même lecture, VERSION par version de la carte : avant / après une retouche.
create or replace view public.balance_card_versions
with (security_invoker = true) as
select
  card_id,
  def_hash,
  is_bot,
  min(m.finished_at) as first_seen_at,
  max(m.finished_at) as last_seen_at,
  count(*) filter (where copies > 0) as matches_in_deck,
  round(avg((result = 'win')::int) filter (where copies > 0), 4) as win_rate_in_deck,
  round(avg((result = 'win')::int) filter (where seen > 0), 4) as win_rate_seen,
  round(avg((result = 'win')::int) filter (where played > 0), 4) as win_rate_played,
  sum(played) as plays
from public.balance_card_lines as l
join public.balance_matches as m using (match_id)
where counts_as_played
group by card_id, def_hash, is_bot;

create or replace view public.balance_ship_overview
with (security_invoker = true) as
select
  s.ship_id,
  s.is_bot,
  count(*) as matches,
  round(avg((s.result = 'win')::int), 4) as win_rate,
  round(avg((s.result = 'win')::int) filter (where s.went_first), 4) as win_rate_first,
  round(avg((s.result = 'win')::int) filter (where not s.went_first), 4) as win_rate_second,
  round(avg(s.own_turns), 2) as avg_own_turns,
  round(avg(m.seconds), 0) as avg_seconds,
  round(avg(s.final_anchor) filter (where s.result = 'win'), 2) as avg_anchor_on_win,
  round(avg(s.ship_ability_uses), 2) as avg_ability_uses,
  round(avg(s.ship_ability_damage), 2) as avg_ability_damage
from public.balance_match_seats as s
join public.balance_matches as m using (match_id)
where s.counts_as_played
group by s.ship_id, s.is_bot;

create or replace view public.balance_match_overview
with (security_invoker = true) as
select
  mode,
  bot_difficulty,
  count(*) as matches,
  round(avg((winner_seat = first_seat)::int) filter (where winner_seat is not null), 4) as first_player_win_rate,
  count(*) filter (where winner_seat is null) as draws,
  round(avg(table_turns), 2) as avg_table_turns,
  round(avg(seconds), 0) as avg_seconds,
  count(*) filter (where end_reason = 'concede') as concedes,
  count(*) filter (where end_reason = 'timeout') as timeouts,
  count(*) filter (where end_reason = 'oceanJudgment') as ocean_judgments
from public.balance_matches
group by mode, bot_difficulty;

revoke all on public.balance_matches, public.balance_match_seats, public.balance_card_lines from anon, authenticated;
revoke all on public.balance_card_overview, public.balance_card_versions, public.balance_ship_overview, public.balance_match_overview from anon, authenticated;
grant select on public.balance_card_overview, public.balance_card_versions, public.balance_ship_overview, public.balance_match_overview to service_role;
grant select, insert on public.balance_matches, public.balance_match_seats, public.balance_card_lines to service_role;
