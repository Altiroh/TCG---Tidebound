-- ═══════════════════════════════════════════════════════════════════════
-- FINITIONS DE CARTE (16/10/2026)
--
-- Monochrome, Star Foil, Prismatic, Negative : des versions TRÈS RARES de
-- n'importe quelle carte, tirées à l'ouverture d'un booster
-- (`game/cosmetics/finishes.ts`, `drawBooster`). Purement visuelles : le
-- jeu ne les lit jamais. La Classique n'est pas stockée — c'est la carte.
--
-- Une ligne par joueur, carte et finition, avec le nombre d'exemplaires
-- obtenus dans cette finition. L'exemplaire lui-même reste compté dans
-- `player_cards` (écrit par `open_booster`) : une finition s'AJOUTE à la
-- collection, elle ne la remplace pas.
--
-- Écriture et lecture passent par le SERVEUR (clé service_role), comme les
-- autres tables du joueur depuis l'audit de sécurité (20261016120000).
-- Le serveur tolère l'absence de cette migration : sans elle, les
-- finitions tirées ne sont simplement pas conservées.
--
-- Entièrement idempotent : rejouable sans risque.
-- ═══════════════════════════════════════════════════════════════════════

create table if not exists public.player_card_finishes (
  user_id uuid not null references auth.users(id) on delete cascade,
  card_id text not null,
  finish text not null,
  quantity integer not null default 1,
  first_obtained_at timestamptz not null default now(),
  primary key (user_id, card_id, finish),
  constraint player_card_finishes_finish check (finish in ('monochrome', 'star-foil', 'prismatic', 'negative')),
  constraint player_card_finishes_quantity check (quantity >= 0)
);

alter table public.player_card_finishes enable row level security;

revoke all on table public.player_card_finishes from anon, authenticated;


/*
 * Ajoute à la collection les finitions tirées à une ouverture.
 *
 * `p_card_ids[i]` a été obtenue dans la finition `p_finishes[i]` : les deux
 * tableaux sont de même longueur. Une finition inconnue est refusée en bloc.
 */
create or replace function public.add_card_finishes(p_user_id uuid, p_card_ids text[], p_finishes text[])
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  i integer;
begin
  perform public.assert_server_caller('add_card_finishes');

  if p_card_ids is null or p_finishes is null or array_length(p_card_ids, 1) is distinct from array_length(p_finishes, 1) then
    return jsonb_build_object('ok', false, 'error', 'Finitions illisibles.');
  end if;

  for i in 1 .. coalesce(array_length(p_card_ids, 1), 0) loop
    insert into public.player_card_finishes as f (user_id, card_id, finish, quantity)
      values (p_user_id, p_card_ids[i], p_finishes[i], 1)
    on conflict (user_id, card_id, finish) do update
      set quantity = f.quantity + 1;
  end loop;

  return jsonb_build_object('ok', true);
exception
  when check_violation then
    return jsonb_build_object('ok', false, 'error', 'Finition inconnue.');
end;
$$;

revoke all on function public.add_card_finishes(uuid, text[], text[]) from public, anon, authenticated;
grant execute on function public.add_card_finishes(uuid, text[], text[]) to service_role;
