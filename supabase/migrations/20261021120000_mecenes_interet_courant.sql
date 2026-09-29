-- ======================================================================
-- MÉCÈNES — l'intérêt suit l'audience COURANTE
-- ======================================================================
-- Décision du 29/09/2026 : « si je tombe en dessous du palier d'un mécène,
-- je dois perdre son intérêt ». Jusqu'ici, les points d'intérêt
-- (`player_sponsor_interest`) ne faisaient que s'accumuler : un palier
-- atteint (Intrigué, Intéressé, Fasciné) restait acquis, même quand
-- l'audience retombait loin sous le seuil du mécène.
--
-- Désormais, après chaque partie jugée, le serveur (`recordMatchAudience`,
-- features/progression/hubService.ts) EFFACE l'intérêt des mécènes dont le
-- seuil dépasse l'audience qui vient d'être enregistrée
-- (`sponsorsLostAt`, game/progression/hub.ts — les seuils vivent dans le
-- code, pas en base). S'il revient au-dessus, l'intérêt repart de zéro.
--
-- Les colis déjà OUVERTS restent acquis : leurs réclamations
-- (`player_progression_claims`, kind `sponsor_gift`) ne sont pas touchées,
-- si bien qu'un palier déjà récompensé ne renvoie pas de second colis. Un
-- colis arrivé mais pas encore ouvert, lui, part avec l'intérêt.
--
-- Tant que cette migration n'est pas passée, l'appel échoue proprement
-- (PGRST202) et la lecture du hub applique quand même la règle
-- (`sponsorHeldPoints`) : rien d'affiché ne la contredit.
--
-- Rejouable : `create or replace`.

create or replace function public.forget_sponsor_interest(
  p_user_id uuid,
  p_sponsor_ids text[]
)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  v_forgotten integer;
begin
  perform public.assert_server_caller('forget_sponsor_interest');

  delete from public.player_sponsor_interest
  where user_id = p_user_id
    and sponsor_id = any(coalesce(p_sponsor_ids, '{}'::text[]));
  get diagnostics v_forgotten = row_count;

  return jsonb_build_object('ok', true, 'forgotten', v_forgotten);
end;
$$;

revoke all on function public.forget_sponsor_interest(uuid, text[]) from public, anon, authenticated;
grant execute on function public.forget_sponsor_interest(uuid, text[]) to service_role;
