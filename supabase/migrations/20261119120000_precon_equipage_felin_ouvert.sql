-- ======================================================================
-- L'ÉQUIPAGE FÉLIN — préconstruit OUVERT (28/10/2026)
-- ======================================================================
--
-- ENTIÈREMENT REJOUABLE (`create or replace`). À appliquer à la main, avec
-- le seed (`npm run seed:cards` ou `npm run seed:sql`) qui ajoute ses cartes.
--
-- Les illustrations de l'Équipage Félin sont livrées : ses cartes entrent au
-- catalogue, et le préconstruit `l-equipage-felin` s'achète au Jeton. Le
-- code l'ouvre seul (`deckOfferFor`) ; cette migration retire le refus
-- posé en base par `20261118120000_precon_equipage_felin_verrouille.sql`.
--
-- Reprend à l'identique la version du 15/10/2026
-- (`20261104120000_starters_premiere_mission.sql`).
create or replace function public.unlock_precon_deck(p_user_id uuid, p_deck_id text)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  v_tokens integer;
begin
  perform public.assert_server_caller('unlock_precon_deck');

  if p_deck_id in ('le-rempart-vivant', 'les-saboteurs-du-pont', 'l-assaut-des-marees') then
    return jsonb_build_object('ok', false, 'error', 'Ce deck est offert par la première mission : il ne s''achète pas.');
  end if;

  if p_deck_id in ('la-forteresse', 'epavistes', 'a-bout-de-raison') then
    return jsonb_build_object('ok', false, 'error', 'Ce préconstruit a quitté le rayon.');
  end if;

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
