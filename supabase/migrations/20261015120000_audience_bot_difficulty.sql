-- ======================================================================
-- AUDIENCE — le niveau du bot compte
-- ======================================================================
-- Suite de 20261013120000_audience_robuste.sql, qui pesait TOUTE partie
-- contre le bot à 0,5. Un bot facile se bat plus aisément qu'un difficile :
-- la partie pèse désormais selon l'ADVERSAIRE (game/audience/analyzeMatch.ts,
-- `AUDIENCE_OPPONENT_WEIGHT`) :
--
--   joueur 1 · bot difficile 0,7 · bot moyen 0,5 · bot facile 0,25
--
--   delta = (spectacle × 25 − audience) × 0,15 × poids   (≥ −6 % de l'audience)
--
-- Le serveur applicatif transmet le poids (`p_weight`) ; sans lui, l'ancienne
-- règle vaut (0,5 contre le bot, 1 sinon). Chaque partie jugée le garde
-- (`opponent_weight`).
--
-- Rejouable : `if not exists`, `drop ... if exists`.

alter table public.player_audience_matches
  add column if not exists opponent_weight numeric(3, 2) check (opponent_weight between 0 and 1);

-- La signature à 7 paramètres disparaît : deux surcharges aux paramètres par
-- défaut rendraient l'appel ambigu.
drop function if exists public.record_match_audience(uuid, uuid, integer, text[], boolean, integer, integer);

create or replace function public.record_match_audience(
  p_user_id uuid,
  p_match_id uuid,
  p_spectacle integer,
  p_highlights text[] default '{}',
  p_vs_bot boolean default false,
  p_prize_xp integer default 0,
  p_prize_tides integer default 0,
  p_weight numeric default null
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

revoke all on function public.record_match_audience(uuid, uuid, integer, text[], boolean, integer, integer, numeric) from public, anon, authenticated;
grant execute on function public.record_match_audience(uuid, uuid, integer, text[], boolean, integer, integer, numeric) to service_role;
