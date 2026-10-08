-- ======================================================================
-- AUDIENCE — une victoire ne fait jamais perdre de public (08/10/2026)
-- ======================================================================
-- Suite de 20261015120000_audience_bot_difficulty.sql. L'audience tendait
-- vers 25 × spectacle même sur une victoire : au-dessus de cette cible, gagner
-- faisait BAISSER l'audience (retour de jeu : trois victoires, 1100 → 980).
-- Désormais, une partie gagnée rapporte au moins 1 % de l'audience × le poids
-- de l'adversaire, et jamais moins d'un spectateur
-- (game/audience/analyzeMatch.ts, `AUDIENCE_MIN_WIN_SHARE`) :
--
--   delta = (spectacle × 25 − audience) × 0,15 × poids   (≥ −6 % de l'audience)
--   victoire : delta ≥ max(audience × 0,01 × poids, 1)    (si poids > 0)
--
-- Le serveur applicatif transmet `p_won` ; sans lui (ancien appel), la règle
-- d'avant vaut.
--
-- Rejouable : `drop ... if exists`, `create or replace`.

-- La signature à 8 paramètres disparaît : deux surcharges aux paramètres par
-- défaut rendraient l'appel ambigu.
drop function if exists public.record_match_audience(uuid, uuid, integer, text[], boolean, integer, integer, numeric);

create or replace function public.record_match_audience(
  p_user_id uuid,
  p_match_id uuid,
  p_spectacle integer,
  p_highlights text[] default '{}',
  p_vs_bot boolean default false,
  p_prize_xp integer default 0,
  p_prize_tides integer default 0,
  p_weight numeric default null,
  p_won boolean default false
)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  v_spectacle integer := greatest(0, least(100, coalesce(p_spectacle, 0)));
  v_weight numeric := greatest(0, least(1, coalesce(p_weight, case when coalesce(p_vs_bot, false) then 0.5 else 1 end)));
  v_before integer;
  v_best integer;
  v_after integer;
  v_delta numeric;
begin
  perform public.assert_server_caller('record_match_audience');

  insert into public.player_audience_matches (match_id, user_id, spectacle, vs_bot, prize_xp, prize_tides, opponent_weight)
  values (
    p_match_id, p_user_id, v_spectacle, coalesce(p_vs_bot, false),
    greatest(0, coalesce(p_prize_xp, 0)), greatest(0, coalesce(p_prize_tides, 0)), v_weight
  )
  on conflict do nothing;
  if not found then
    -- Déjà jugée : rien à recompter, on rend l'audience telle qu'elle est.
    select pa.audience, pa.best_audience into v_after, v_best
      from public.player_audience pa where pa.user_id = p_user_id;
    return jsonb_build_object('ok', true, 'recorded', false, 'audience', coalesce(v_after, 0), 'best', coalesce(v_best, 0));
  end if;

  insert into public.player_audience (user_id) values (p_user_id)
  on conflict (user_id) do nothing;

  select pa.audience, pa.best_audience into v_before, v_best
    from public.player_audience pa where pa.user_id = p_user_id
    for update;

  v_delta := greatest((v_spectacle * 25 - v_before) * 0.15 * v_weight, -v_before * 0.06);
  -- Une victoire jugée rapporte toujours un peu.
  if coalesce(p_won, false) and v_weight > 0 then
    v_delta := greatest(v_delta, v_before * 0.01 * v_weight, 1);
  end if;
  v_after := greatest(0, round(v_before + v_delta)::integer);

  update public.player_audience
    set audience = v_after,
        best_audience = greatest(best_audience, v_after),
        last_spectacle = v_spectacle,
        last_highlights = coalesce(p_highlights, '{}'),
        matches_judged = matches_judged + 1,
        updated_at = now()
    where user_id = p_user_id;

  update public.player_audience_matches
    set audience_before = v_before, audience_after = v_after
    where match_id = p_match_id and user_id = p_user_id;

  return jsonb_build_object(
    'ok', true,
    'recorded', true,
    'before', v_before,
    'audience', v_after,
    'best', greatest(v_best, v_after)
  );
end;
$$;

revoke all on function public.record_match_audience(uuid, uuid, integer, text[], boolean, integer, integer, numeric, boolean) from public, anon, authenticated;
grant execute on function public.record_match_audience(uuid, uuid, integer, text[], boolean, integer, integer, numeric, boolean) to service_role;
