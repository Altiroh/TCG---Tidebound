-- ======================================================================
-- AUDIENCE — variation robuste, audience avant/après, paliers
-- ======================================================================
-- Suite de 20261010120000_audience.sql. Trois changements :
--
-- 1. VARIATION EN DOUCEUR. L'ancienne formule (audience × 0,8 + spectacle
--    × 5) retirait 20 % à chaque partie : une seule partie terne faisait
--    tomber un mécène. La nouvelle rapproche l'audience de ce que la partie
--    mérite (spectacle × 25) d'une PART de l'écart seulement, pèse moitié
--    moins contre le bot, et ne retire jamais plus de 6 % en une partie :
--
--      delta = (spectacle × 25 − audience) × 0,15   (× 0,5 contre le bot)
--      delta ≥ −6 % de l'audience
--
--    Mêmes constantes que `nextAudience` (game/audience/analyzeMatch.ts).
--    L'équilibre ne change pas (25 × spectacle tenu) : les seuils des
--    mécènes gardent leur sens.
--
-- 2. AVANT / APRÈS ENREGISTRÉS. L'écran de fin déduisait l'audience d'avant
--    en inversant la formule — faux dès qu'une autre partie était jugée
--    entre-temps. Chaque partie jugée garde désormais les deux valeurs.
--
-- 3. PALIERS D'AUDIENCE. Nouveau type de réclamation `audience_milestone`
--    (clé = seuil de record atteint), octroyé par `claim_progression_reward`
--    comme le coffre et les Maîtrises. Seuils : game/audience/milestones.ts.
--
-- 4. PRIME DU PUBLIC. Chaque partie paie son spectacle (game/audience/
--    prize.ts). La prime est OCTROYÉE avec la partie (XP et Tides de
--    `grant_match_progression`, une seule fois) ; cette fonction ne fait que
--    la NOTER (`prize_xp`, `prize_tides`) pour l'écran de fin.
--
-- Rejouable : `if not exists`, `drop ... if exists`.

alter table public.player_audience_matches
  add column if not exists audience_before integer check (audience_before >= 0),
  add column if not exists audience_after integer check (audience_after >= 0),
  add column if not exists vs_bot boolean not null default false,
  -- Prime du public (game/audience/prize.ts) : déjà OCTROYÉE avec la partie
  -- par `grant_match_progression` ; notée ici pour que l'écran de fin la montre.
  add column if not exists prize_xp integer not null default 0 check (prize_xp >= 0),
  add column if not exists prize_tides integer not null default 0 check (prize_tides >= 0);

-- L'ancienne signature (sans p_vs_bot) disparaît : deux surcharges aux
-- paramètres par défaut rendraient l'appel ambigu.
drop function if exists public.record_match_audience(uuid, uuid, integer, text[]);

create or replace function public.record_match_audience(
  p_user_id uuid,
  p_match_id uuid,
  p_spectacle integer,
  p_highlights text[] default '{}',
  p_vs_bot boolean default false,
  p_prize_xp integer default 0,
  p_prize_tides integer default 0
)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  v_spectacle integer := greatest(0, least(100, coalesce(p_spectacle, 0)));
  v_before integer;
  v_best integer;
  v_after integer;
  v_rate numeric := 0.15 * (case when coalesce(p_vs_bot, false) then 0.5 else 1 end);
  v_delta numeric;
begin
  perform public.assert_server_caller('record_match_audience');

  insert into public.player_audience_matches (match_id, user_id, spectacle, vs_bot, prize_xp, prize_tides)
  values (p_match_id, p_user_id, v_spectacle, coalesce(p_vs_bot, false), greatest(0, coalesce(p_prize_xp, 0)), greatest(0, coalesce(p_prize_tides, 0)))
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

  v_delta := greatest((v_spectacle * 25 - v_before) * v_rate, -v_before * 0.06);
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

revoke all on function public.record_match_audience(uuid, uuid, integer, text[], boolean, integer, integer) from public, anon, authenticated;
grant execute on function public.record_match_audience(uuid, uuid, integer, text[], boolean, integer, integer) to service_role;

-- Paliers d'audience : un type de réclamation de plus.
alter table public.player_progression_claims drop constraint if exists player_progression_claims_kind_check;
alter table public.player_progression_claims
  add constraint player_progression_claims_kind_check
  check (kind in ('weekly_chest', 'mastery', 'sponsor_gift', 'audience_milestone'));
