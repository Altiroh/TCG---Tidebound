-- Schéma initial : profils, parties en ligne.
--
-- Principe directeur (cf. README "Le client n'est jamais la source de
-- vérité") : le NAVIGATEUR n'écrit jamais directement `matches`. Toute
-- écriture passe par une Server Action Next.js (exécutée côté serveur)
-- qui appelle `dispatch()` (le moteur, `/game`) — seule autorité sur la
-- légalité d'un coup — puis persiste le résultat via le client Supabase
-- authentifié de l'utilisateur (pas de clé service_role : les policies
-- RLS ci-dessous suffisent, une Server Action n'étant pas du code
-- navigateur). Aucune requête client (browser) n'écrit cette table.

-- --- profiles -------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "profiles are readable by any authenticated user"
  on public.profiles for select
  to authenticated
  using (true);

create policy "a user can update their own profile"
  on public.profiles for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- Crée automatiquement un profil à l'inscription (déclenché sur auth.users,
-- schéma géré par Supabase Auth). `security definer` : nécessaire pour
-- pouvoir écrire dans `public.profiles` depuis un trigger sur `auth.users`.
create function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1)));
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- --- matches ----------------------------------------------------------

create table public.matches (
  id uuid primary key default gen_random_uuid(),
  -- Code court partagé hors-bande (ex: lien) pour rejoindre une partie
  -- privée en attente d'un second joueur.
  invite_code text not null unique,

  player1_id uuid not null references public.profiles (id),
  player2_id uuid references public.profiles (id),
  -- Identifiant du deck de base système choisi par chaque joueur
  -- (`DeckList.id` dans `game/cards/decks/preconstructed.ts` — pas encore
  -- de deck personnel persisté, cf. `TCG_DATABASE.md`).
  player1_deck_id text not null,
  player2_deck_id text,

  -- État complet du moteur (`GameState`, `game/state/types.ts`), unique
  -- source de vérité de la partie une fois commencée. `null` tant que la
  -- partie est en attente d'un second joueur.
  state jsonb,

  status text not null default 'waiting'
    check (status in ('waiting', 'active', 'finished', 'abandoned')),
  winner_id uuid references public.profiles (id),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index matches_player1_id_idx on public.matches (player1_id);
create index matches_player2_id_idx on public.matches (player2_id);
create index matches_invite_code_idx on public.matches (invite_code);

alter table public.matches enable row level security;

create policy "players can read their own matches"
  on public.matches for select
  to authenticated
  using (player1_id = auth.uid() or player2_id = auth.uid());

-- Nécessaire pour que le flux "rejoindre par code" puisse localiser une
-- partie avant que l'appelant en soit membre. N'expose que les parties
-- encore ouvertes (pas de fuite d'état de partie en cours/terminée).
create policy "anyone authenticated can find a waiting match by invite code"
  on public.matches for select
  to authenticated
  using (status = 'waiting');

create policy "a user can create a match as player1"
  on public.matches for insert
  to authenticated
  with check (player1_id = auth.uid());

-- USING couvre à la fois "je suis déjà participant" et "la partie est
-- encore ouverte" (nécessaire pour la rejoindre, avant d'être membre) ;
-- WITH CHECK garantit qu'après l'écriture l'appelant EST bien un des deux
-- joueurs (empêche de modifier une partie sans y participer).
create policy "participants can update their match, including joining an open one"
  on public.matches for update
  to authenticated
  using (player1_id = auth.uid() or player2_id = auth.uid() or (status = 'waiting' and player2_id is null))
  with check (player1_id = auth.uid() or player2_id = auth.uid());

-- --- realtime -----------------------------------------------------------

alter publication supabase_realtime add table public.matches;
