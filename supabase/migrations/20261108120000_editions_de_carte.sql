-- ═══════════════════════════════════════════════════════════════════════
-- ÉDITIONS DE CARTE (18/10/2026) — Collection visuelle V2, phase 3
--
-- Une ÉDITION = une illustration (classique, styled, styled-fa) ET une
-- finition (classique, monochrome, foil, negative, prismatic, star-foil).
-- `game/cosmetics/editions.ts` en est la source de vérité versionnée.
--
--  1. `player_card_editions` : les éditions RARES possédées, avec leur
--     quantité (la Classique Standard n'y figure jamais : c'est la carte).
--     Comme les finitions avant elles, un exemplaire d'édition est AUSSI
--     compté dans `player_cards` — l'exemplaire est d'abord une carte.
--     Les lignes de `player_card_finishes` y sont reprises (illustration
--     classique) ; l'ancienne table reste en place, plus écrite.
--  2. `add_card_editions` : ajout des éditions tirées à une ouverture.
--  3. `player_card_display` + `set_card_display` : l'édition qu'un joueur
--     montre EN PARTIE pour une carte. Refusée si elle n'est pas possédée.
--
-- Écriture et lecture par le SERVEUR (service_role) seulement.
-- Le code tolère l'absence de cette migration : il retombe alors sur
-- `player_card_finishes` et la Classique en partie.
-- Entièrement idempotent : rejouable sans risque.
-- ═══════════════════════════════════════════════════════════════════════

create table if not exists public.player_card_editions (
  user_id uuid not null references auth.users(id) on delete cascade,
  card_id text not null,
  artwork text not null,
  finish text not null,
  quantity integer not null default 1,
  first_obtained_at timestamptz not null default now(),
  primary key (user_id, card_id, artwork, finish),
  constraint player_card_editions_artwork check (artwork in ('classique', 'styled', 'styled-fa')),
  constraint player_card_editions_finish check (finish in ('classique', 'monochrome', 'foil', 'negative', 'prismatic', 'star-foil')),
  constraint player_card_editions_rare check (not (artwork = 'classique' and finish = 'classique')),
  constraint player_card_editions_quantity check (quantity >= 0)
);

alter table public.player_card_editions enable row level security;
revoke all on table public.player_card_editions from anon, authenticated;

-- Reprise des finitions déjà tirées (une seule fois : `on conflict do nothing`).
insert into public.player_card_editions (user_id, card_id, artwork, finish, quantity, first_obtained_at)
select user_id, card_id, 'classique', finish, quantity, first_obtained_at
from public.player_card_finishes
where quantity > 0
on conflict (user_id, card_id, artwork, finish) do nothing;


/*
 * Ajoute à la collection les éditions tirées à une ouverture.
 * `p_card_ids[i]` a été obtenue dans l'illustration `p_artworks[i]` et la
 * finition `p_finishes[i]`. Une édition inconnue est refusée en bloc.
 */
create or replace function public.add_card_editions(p_user_id uuid, p_card_ids text[], p_artworks text[], p_finishes text[])
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  i integer;
  n integer := coalesce(array_length(p_card_ids, 1), 0);
begin
  perform public.assert_server_caller('add_card_editions');

  if p_card_ids is null or p_artworks is null or p_finishes is null
     or array_length(p_artworks, 1) is distinct from array_length(p_card_ids, 1)
     or array_length(p_finishes, 1) is distinct from array_length(p_card_ids, 1) then
    return jsonb_build_object('ok', false, 'error', 'Éditions illisibles.');
  end if;

  for i in 1 .. n loop
    insert into public.player_card_editions as e (user_id, card_id, artwork, finish, quantity)
      values (p_user_id, p_card_ids[i], p_artworks[i], p_finishes[i], 1)
    on conflict (user_id, card_id, artwork, finish) do update
      set quantity = e.quantity + 1;
  end loop;

  return jsonb_build_object('ok', true);
exception
  when check_violation then
    return jsonb_build_object('ok', false, 'error', 'Édition inconnue.');
end;
$$;

revoke all on function public.add_card_editions(uuid, text[], text[], text[]) from public, anon, authenticated;
grant execute on function public.add_card_editions(uuid, text[], text[], text[]) to service_role;


create table if not exists public.player_card_display (
  user_id uuid not null references auth.users(id) on delete cascade,
  card_id text not null,
  artwork text not null,
  finish text not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, card_id),
  constraint player_card_display_artwork check (artwork in ('classique', 'styled', 'styled-fa')),
  constraint player_card_display_finish check (finish in ('classique', 'monochrome', 'foil', 'negative', 'prismatic', 'star-foil'))
);

alter table public.player_card_display enable row level security;
revoke all on table public.player_card_display from anon, authenticated;


/*
 * Choisit l'édition montrée EN PARTIE pour une carte. La Classique efface
 * le choix ; toute autre édition doit être possédée.
 */
create or replace function public.set_card_display(p_user_id uuid, p_card_id text, p_artwork text, p_finish text)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
begin
  perform public.assert_server_caller('set_card_display');

  if p_artwork = 'classique' and p_finish = 'classique' then
    delete from public.player_card_display where user_id = p_user_id and card_id = p_card_id;
    return jsonb_build_object('ok', true);
  end if;

  if not exists (
    select 1 from public.player_card_editions
    where user_id = p_user_id and card_id = p_card_id and artwork = p_artwork and finish = p_finish and quantity > 0
  ) then
    return jsonb_build_object('ok', false, 'error', 'Édition non possédée.');
  end if;

  insert into public.player_card_display as d (user_id, card_id, artwork, finish)
    values (p_user_id, p_card_id, p_artwork, p_finish)
  on conflict (user_id, card_id) do update
    set artwork = excluded.artwork, finish = excluded.finish, updated_at = now();

  return jsonb_build_object('ok', true);
exception
  when check_violation then
    return jsonb_build_object('ok', false, 'error', 'Édition inconnue.');
end;
$$;

revoke all on function public.set_card_display(uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.set_card_display(uuid, text, text, text) to service_role;
