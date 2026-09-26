-- ======================================================================
-- Cartes favorites et CARNETS — le catalogue à sa façon, sur le COMPTE
-- ======================================================================
-- Deux gestes, pensés comme Pinterest :
--
--   • le FAVORI (le cœur) : une carte qu'on aime, d'un clic ;
--   • les CARNETS : des groupes NOMMÉS de cartes (« Combo Abysses »,
--     « Mes Marionnettes ») — une carte peut vivre dans plusieurs carnets,
--     un carnet a une carte de couverture.
--
-- `card_id` est en TEXTE : l'id figé d'une carte du catalogue (jamais
-- renommé, cf. CLAUDE.md). Les serveurs applicatifs vérifient qu'il existe ;
-- une carte retirée un jour laisse une ligne sans effet, que l'écran ignore.
--
-- Le joueur lit, crée, modifie et retire LES SIENS (RLS) ; rien d'autre n'y
-- touche. Plafonds (carnets par joueur, longueur du nom) tenus par le
-- serveur applicatif (`features/collection/shelf/shelf.ts`) ET ici, pour
-- qu'un appel direct à l'API ne les contourne pas.
--
-- Rejouable : `if not exists`, `drop ... if exists`.

-- ── Favoris ────────────────────────────────────────────────────────────
create table if not exists public.player_card_favorites (
  user_id uuid not null references public.profiles (id) on delete cascade,
  card_id text not null check (length(card_id) between 1 and 120),
  created_at timestamptz not null default now(),
  primary key (user_id, card_id)
);

alter table public.player_card_favorites enable row level security;

drop policy if exists "a user can read their own card favorites" on public.player_card_favorites;
create policy "a user can read their own card favorites"
  on public.player_card_favorites for select to authenticated using (user_id = (select auth.uid()));

drop policy if exists "a user can add their own card favorites" on public.player_card_favorites;
create policy "a user can add their own card favorites"
  on public.player_card_favorites for insert to authenticated with check (user_id = (select auth.uid()));

drop policy if exists "a user can remove their own card favorites" on public.player_card_favorites;
create policy "a user can remove their own card favorites"
  on public.player_card_favorites for delete to authenticated using (user_id = (select auth.uid()));

-- ── Carnets ────────────────────────────────────────────────────────────
create table if not exists public.player_card_notebooks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 40),
  -- Carte de couverture choisie ; nulle : la première carte ajoutée sert.
  cover_card_id text check (cover_card_id is null or length(cover_card_id) between 1 and 120),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Deux carnets du même joueur ne portent pas le même nom (casse ignorée).
create unique index if not exists player_card_notebooks_user_name_key
  on public.player_card_notebooks (user_id, lower(btrim(name)));
create index if not exists player_card_notebooks_user_idx on public.player_card_notebooks (user_id, updated_at desc);

alter table public.player_card_notebooks enable row level security;

drop policy if exists "a user can read their own notebooks" on public.player_card_notebooks;
create policy "a user can read their own notebooks"
  on public.player_card_notebooks for select to authenticated using (user_id = (select auth.uid()));

drop policy if exists "a user can create their own notebooks" on public.player_card_notebooks;
create policy "a user can create their own notebooks"
  on public.player_card_notebooks for insert to authenticated with check (user_id = (select auth.uid()));

drop policy if exists "a user can update their own notebooks" on public.player_card_notebooks;
create policy "a user can update their own notebooks"
  on public.player_card_notebooks for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

drop policy if exists "a user can delete their own notebooks" on public.player_card_notebooks;
create policy "a user can delete their own notebooks"
  on public.player_card_notebooks for delete to authenticated using (user_id = (select auth.uid()));

-- Plafond de carnets par joueur (même valeur que NOTEBOOK_LIMIT, shelf.ts).
create or replace function public.enforce_notebook_limit()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if (select count(*) from public.player_card_notebooks where user_id = new.user_id) >= 50 then
    raise exception 'notebook_limit' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists player_card_notebooks_limit on public.player_card_notebooks;
create trigger player_card_notebooks_limit
  before insert on public.player_card_notebooks
  for each row execute function public.enforce_notebook_limit();

-- ── Cartes des carnets ─────────────────────────────────────────────────
create table if not exists public.player_card_notebook_cards (
  notebook_id uuid not null references public.player_card_notebooks (id) on delete cascade,
  card_id text not null check (length(card_id) between 1 and 120),
  added_at timestamptz not null default now(),
  primary key (notebook_id, card_id)
);

alter table public.player_card_notebook_cards enable row level security;

-- Le carnet doit appartenir au joueur : c'est lui qui porte la propriété.
drop policy if exists "a user can read the cards of their notebooks" on public.player_card_notebook_cards;
create policy "a user can read the cards of their notebooks"
  on public.player_card_notebook_cards for select to authenticated
  using (exists (select 1 from public.player_card_notebooks n where n.id = notebook_id and n.user_id = (select auth.uid())));

drop policy if exists "a user can add cards to their notebooks" on public.player_card_notebook_cards;
create policy "a user can add cards to their notebooks"
  on public.player_card_notebook_cards for insert to authenticated
  with check (exists (select 1 from public.player_card_notebooks n where n.id = notebook_id and n.user_id = (select auth.uid())));

drop policy if exists "a user can remove cards from their notebooks" on public.player_card_notebook_cards;
create policy "a user can remove cards from their notebooks"
  on public.player_card_notebook_cards for delete to authenticated
  using (exists (select 1 from public.player_card_notebooks n where n.id = notebook_id and n.user_id = (select auth.uid())));
