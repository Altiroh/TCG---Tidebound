-- Titres de PALIER (27/10/2026) : la route des niveaux promettait des titres
-- (« Marin d'eau douce » au niveau 15, « Timonier » au niveau 20 à la place
-- d'un avatar qui n'existait pas) qu'aucun exploit ne débloquait.
--
-- Le catalogue vit en TypeScript (`game/titles/catalog.ts`) : un titre de
-- palier se débloque au niveau atteint. Comme `set_player_title` pour un
-- exploit, cette fonction REVÉRIFIE la condition en base avant d'écrire :
-- le serveur passe le niveau exigé par le catalogue, jamais le navigateur.
--
-- Rien n'est à rattraper : le déblocage se lit sur le niveau, donc tout
-- joueur qui a déjà ce niveau a déjà le titre. Idempotent.

create or replace function public.set_player_title_by_level(
  p_user_id uuid,
  p_title_id text,
  p_required_level integer
)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  v_level integer;
begin
  perform public.assert_server_caller('set_player_title_by_level');

  if p_title_id is null or p_required_level is null or p_required_level < 1 then
    return jsonb_build_object('ok', false, 'error', 'unknown_title');
  end if;

  select level into v_level from public.player_progression where user_id = p_user_id;
  if coalesce(v_level, 1) < p_required_level then
    return jsonb_build_object('ok', false, 'error', 'not_unlocked');
  end if;

  insert into public.player_titles (user_id, title_id, equipped_at)
  values (p_user_id, p_title_id, now())
  on conflict (user_id) do update set title_id = excluded.title_id, equipped_at = excluded.equipped_at;

  return jsonb_build_object('ok', true, 'title_id', p_title_id);
end;
$$;

revoke all on function public.set_player_title_by_level(uuid, text, integer) from public, anon, authenticated;
grant execute on function public.set_player_title_by_level(uuid, text, integer) to service_role;
