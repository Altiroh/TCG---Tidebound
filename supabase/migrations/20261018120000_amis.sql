-- Amis : code ami, demandes, présence en ligne, défis en match amical.
--
-- Décision du 28/09/2026 : on affronte un joueur précis par code
-- d'invitation OU depuis sa liste d'amis. Tout passe par le serveur (clé
-- service_role) : aucune de ces tables n'accepte d'écriture navigateur, et
-- chacun ne lit que ce qui le concerne.
--
--   1. CODE AMI. Les pseudos ne sont pas uniques (et la recherche par pseudo
--      rouvrirait l'annuaire de tous les comptes, fermé par l'audit) : on
--      s'ajoute par un code de 8 caractères, propre à chaque joueur.
--   2. `friendships` : une ligne par paire, dans l'ordre des identifiants
--      (`user_a < user_b`) — la paire ne peut exister qu'une fois. En
--      attente tant que le destinataire n'a pas accepté.
--   3. `player_presence` : dernier signe de vie de l'appli ouverte. « En
--      ligne » se lit côté serveur, jamais par le navigateur.
--   4. `friend_challenges` : un défi est un MATCH AMICAL en attente
--      (`matches`, mode `private_invite`) dont le code est remis à l'ami
--      défié. Il ne rapporte rien, comme tout match amical.
--
-- Entièrement idempotente : rejouable sans risque.


-- ======================================================================
-- 1. CODE AMI
-- ======================================================================

create or replace function public.generate_friend_code()
returns text
language sql
volatile
set search_path = public
as $$
  -- Même alphabet que les codes d'invitation : ni 0/O, ni 1/I/L.
  select string_agg(substr('ABCDEFGHJKMNPQRSTUVWXYZ23456789', 1 + floor(random() * 31)::int, 1), '')
  from generate_series(1, 8);
$$;

alter table public.profiles
  add column if not exists friend_code text;

update public.profiles set friend_code = public.generate_friend_code() where friend_code is null;

alter table public.profiles alter column friend_code set default public.generate_friend_code();
alter table public.profiles alter column friend_code set not null;

create unique index if not exists profiles_friend_code_key on public.profiles (friend_code);


-- ======================================================================
-- 2. AMITIÉS
-- ======================================================================

create table if not exists public.friendships (
  user_a uuid not null references public.profiles (id) on delete cascade,
  user_b uuid not null references public.profiles (id) on delete cascade,
  -- Qui a envoyé la demande : c'est l'AUTRE qui peut l'accepter.
  requested_by uuid not null references public.profiles (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted')),
  created_at timestamptz not null default now(),
  accepted_at timestamptz,
  primary key (user_a, user_b),
  check (user_a < user_b),
  check (requested_by in (user_a, user_b))
);

create index if not exists friendships_user_b_idx on public.friendships (user_b);

alter table public.friendships enable row level security;

drop policy if exists "a user can read their own friendships" on public.friendships;
create policy "a user can read their own friendships"
  on public.friendships for select
  to authenticated
  using ((select auth.uid()) in (user_a, user_b));


-- ======================================================================
-- 3. PRÉSENCE
-- ======================================================================

create table if not exists public.player_presence (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  last_seen_at timestamptz not null default now()
);

alter table public.player_presence enable row level security;
-- Aucune policy : la présence d'un ami se lit par le serveur, qui vérifie l'amitié.


-- ======================================================================
-- 4. DÉFIS
-- ======================================================================

create table if not exists public.friend_challenges (
  id uuid primary key default gen_random_uuid(),
  from_user uuid not null references public.profiles (id) on delete cascade,
  to_user uuid not null references public.profiles (id) on delete cascade,
  match_id uuid not null references public.matches (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'declined')),
  created_at timestamptz not null default now(),
  check (from_user <> to_user)
);

create index if not exists friend_challenges_to_user_idx on public.friend_challenges (to_user, status);

alter table public.friend_challenges enable row level security;

drop policy if exists "a user can read the challenges they sent or received" on public.friend_challenges;
create policy "a user can read the challenges they sent or received"
  on public.friend_challenges for select
  to authenticated
  using ((select auth.uid()) in (from_user, to_user));


-- ======================================================================
-- 5. PROFILS : les amis (et demandes) se voient
-- ======================================================================
-- Reprend la policy de `20261016120000_audit_securite.sql` (soi et ses
-- adversaires) et y ajoute les joueurs liés par une amitié, acceptée ou en
-- attente — une demande reçue doit dire de qui elle vient.

drop policy if exists "a user can read their own profile and their opponents" on public.profiles;
drop policy if exists "a user can read their own profile, opponents and friends" on public.profiles;
create policy "a user can read their own profile, opponents and friends"
  on public.profiles for select
  to authenticated
  using (
    id = (select auth.uid())
    or exists (
      select 1 from public.matches m
      where (m.player1_id = (select auth.uid()) and m.player2_id = profiles.id)
         or (m.player2_id = (select auth.uid()) and m.player1_id = profiles.id)
    )
    or exists (
      select 1 from public.friendships f
      where (f.user_a = (select auth.uid()) and f.user_b = profiles.id)
         or (f.user_b = (select auth.uid()) and f.user_a = profiles.id)
    )
  );

-- Valeur par défaut de `profiles.friend_code` : pas d'appel direct par l'API.
revoke all on function public.generate_friend_code() from public, anon, authenticated;
