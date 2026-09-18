-- ======================================================================
-- LE NIVEAU STOCKÉ CESSE D'ÊTRE EN RETARD
-- ======================================================================
-- `player_progression.level` n'est pas une source de vérité : c'est un
-- CACHE de la courbe d'XP, qui vit en TypeScript
-- (`game/progression/levels.ts`) et nulle part ailleurs — la dupliquer ici
-- ferait deux vérités qui divergeraient au premier réglage d'équilibrage.
--
-- Or seule la fin de partie le rafraîchissait : `grant_match_progression`
-- reçoit le niveau calculé par le serveur applicatif et le pose. Les autres
-- sources d'XP — quêtes, récompense de connexion, exploits, tutoriel —
-- ajoutent à `xp_total` sans y toucher, et le commentaire de
-- `claim_quest_reward` l'assume : « le passage de niveau éventuel est
-- rattrapé à la partie suivante ».
--
-- Ce rattrapage différé se voit. Relevé le 2026-09-18 sur le compte du
-- projet : 2300 XP, soit le niveau 10 d'après la courbe, pour une colonne
-- restée à 8. L'écran affichait bien le niveau 10 (calculé depuis l'XP),
-- mais les paliers à réclamer se fiaient à la colonne : le Jeton de
-- Préconstruit du palier 10 n'était proposé nulle part, et
-- `claim_level_reward` l'aurait de toute façon refusé (« Ce palier n'est
-- pas encore atteint »). C'est aussi ce qui donne l'impression que les
-- récompenses mettent du temps à arriver : elles attendent une partie.
--
-- D'où cette fonction, et rien de plus : le serveur applicatif, seul à
-- connaître la courbe, remet la colonne d'aplomb avant de lire ou de payer
-- un palier. JAMAIS à la baisse — un niveau atteint reste acquis, et un
-- appelant qui se tromperait ne peut donc rien retirer.

create or replace function public.sync_player_level(p_user_id uuid, p_level integer)
returns integer
language plpgsql
security definer set search_path = public
as $$
declare
  v_level integer;
begin
  perform public.assert_server_caller('sync_player_level');

  if p_user_id is null then
    return null;
  end if;

  update public.player_progression
    set level = greatest(player_progression.level, greatest(1, coalesce(p_level, 1))),
        updated_at = now()
    where user_id = p_user_id
    returning player_progression.level into v_level;

  -- Aucune ligne : le joueur n'a pas encore de progression (aucune partie,
  -- aucune quête). Rien à rattraper, et surtout rien à créer ici — la ligne
  -- naît avec sa première source d'XP.
  return coalesce(v_level, 1);
end;
$$;

revoke all on function public.sync_player_level(uuid, integer) from public, anon, authenticated;
grant execute on function public.sync_player_level(uuid, integer) to service_role;
