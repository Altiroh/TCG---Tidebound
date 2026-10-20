-- ═══════════════════════════════════════════════════════════════════════
-- SALON DE COMBAT ENTRE AMIS (20/10/2026)
--
-- À appliquer APRÈS 20261018120000 (amis).
--
-- « Proposer un combat » depuis la fiche d'un ami crée un SALON :
--   1. `invited` : l'invitation attend l'ami — elle s'affiche dans son
--      Courrier (et une alerte), il l'accepte ou la refuse ;
--   2. `open`    : les deux capitaines sont dans le salon, chacun choisit son
--      deck et se déclare PRÊT. Quand les deux le sont, `countdown_at` note
--      l'instant : un compte à rebours de 5 s s'affiche des deux côtés, et
--      se retire dès que l'un se dédit ;
--   3. `starting` puis `started` : au bout du compte, le serveur crée la
--      partie (match amical, `private_invite`) et la note dans `match_id` ;
--      les deux écrans y entrent.
-- `declined` (refus), `cancelled` (l'un est parti) closent le salon.
--
-- Serveur seul (clé service_role) : aucune policy navigateur.
-- Entièrement idempotente : rejouable sans risque.
-- ═══════════════════════════════════════════════════════════════════════

create table if not exists public.battle_lobbies (
  id uuid primary key default gen_random_uuid(),
  host_id uuid not null references public.profiles (id) on delete cascade,
  guest_id uuid not null references public.profiles (id) on delete cascade,
  status text not null default 'invited',
  host_deck_id text,
  guest_deck_id text,
  host_ready boolean not null default false,
  guest_ready boolean not null default false,
  host_seen_at timestamptz not null default now(),
  guest_seen_at timestamptz,
  -- Les deux sont prêts depuis cet instant : la partie part 5 s plus tard.
  countdown_at timestamptz,
  match_id uuid references public.matches (id) on delete set null,
  -- Dernier échec de lancement, montré aux deux (deck devenu injouable…).
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint battle_lobbies_status check (status in ('invited', 'open', 'starting', 'started', 'declined', 'cancelled')),
  constraint battle_lobbies_distinct_players check (host_id <> guest_id)
);

create index if not exists battle_lobbies_guest_idx on public.battle_lobbies (guest_id, status);
create index if not exists battle_lobbies_host_idx on public.battle_lobbies (host_id, status);

alter table public.battle_lobbies enable row level security;
revoke all on table public.battle_lobbies from anon, authenticated;
