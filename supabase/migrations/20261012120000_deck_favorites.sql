-- ======================================================================
-- Decks favoris — l'étoile de la liste des decks, sur le COMPTE
-- ======================================================================
-- Une ligne par deck marqué favori. `deck_id` est en TEXTE : l'uuid d'un
-- deck du joueur (`player_decks.id`) OU l'id d'un préconstruit du jeu —
-- même convention que `matches.player1_deck_id`. Un deck du joueur effacé
-- pour de bon laisse une ligne orpheline, sans effet : l'écran ne montre
-- que les favoris qui existent encore.
--
-- Le joueur lit, ajoute et retire LES SIENS (RLS) ; rien d'autre n'y touche.

create table if not exists public.player_deck_favorites (
  user_id uuid not null references public.profiles (id) on delete cascade,
  deck_id text not null check (length(deck_id) between 1 and 120),
  created_at timestamptz not null default now(),
  primary key (user_id, deck_id)
);

alter table public.player_deck_favorites enable row level security;

drop policy if exists "a user can read their own deck favorites" on public.player_deck_favorites;
create policy "a user can read their own deck favorites"
  on public.player_deck_favorites for select to authenticated using (user_id = (select auth.uid()));

drop policy if exists "a user can add their own deck favorites" on public.player_deck_favorites;
create policy "a user can add their own deck favorites"
  on public.player_deck_favorites for insert to authenticated with check (user_id = (select auth.uid()));

drop policy if exists "a user can remove their own deck favorites" on public.player_deck_favorites;
create policy "a user can remove their own deck favorites"
  on public.player_deck_favorites for delete to authenticated using (user_id = (select auth.uid()));
