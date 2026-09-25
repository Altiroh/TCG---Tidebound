-- ======================================================================
-- Réparation : la série de connexion restait à 0
-- ======================================================================
-- Constaté le 25/09/2026 : les colonnes `streak` / `best_streak` existaient,
-- mais `claim_login_reward` était encore l'ANCIENNE fonction (7 arguments) :
-- chaque réclamation avançait l'escale sans jamais compter la série. On
-- rejoue ici la fonction de `20261008120000_login_rewards_weekly_streak.sql`
-- (idempotent), puis on remet à 1 la série des joueurs qui ont réclamé
-- aujourd'hui ou hier — leur vraie série passée n'est enregistrée nulle
-- part, elle repart de là.

alter table public.player_login_rewards
  add column if not exists streak integer not null default 0 check (streak >= 0),
  add column if not exists best_streak integer not null default 0 check (best_streak >= 0);

-- L'ancienne signature (7 arguments) disparaît : garder les deux rendrait
-- l'appel à 7 arguments nommés ambigu pour PostgREST.
drop function if exists public.claim_login_reward(uuid, integer, integer, integer, integer, text, text);

create or replace function public.claim_login_reward(
  p_user_id uuid,
  p_step integer,
  p_next_step integer,
  p_tides integer,
  p_xp integer,
  p_booster_id text default null,
  p_card_id text default null,
  p_streak_card_id text default null
)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  v_today date := (now() at time zone 'utc')::date;
  v_last date;
  v_step integer;
  v_streak integer;
  v_streak_card text := null;
begin
  perform public.assert_server_caller('claim_login_reward');

  insert into public.player_login_rewards (user_id) values (p_user_id)
  on conflict (user_id) do nothing;

  select plr.last_claimed_day, plr.step, plr.streak into v_last, v_step, v_streak
  from public.player_login_rewards plr where plr.user_id = p_user_id
  for update;

  if v_last = v_today then
    return jsonb_build_object('ok', false, 'error', 'Récompense de connexion déjà réclamée aujourd''hui.', 'step', v_step);
  end if;

  -- L'étape appliquée est celle de la BASE, pas celle envoyée par
  -- l'appelant : une page restée ouverte ne peut pas rejouer une ancienne
  -- étape plus généreuse.
  if v_step is distinct from p_step then
    return jsonb_build_object('ok', false, 'error', 'Étape de connexion périmée, rechargez la page.', 'step', v_step);
  end if;

  v_streak := case when v_last = v_today - 1 then coalesce(v_streak, 0) + 1 else 1 end;

  update public.player_login_rewards
    set step = p_next_step,
        last_claimed_day = v_today,
        total_claims = total_claims + 1,
        streak = v_streak,
        best_streak = greatest(best_streak, v_streak),
        updated_at = now()
    where user_id = p_user_id;

  if coalesce(p_tides, 0) > 0 then
    insert into public.player_currency (user_id, balance) values (p_user_id, p_tides)
    on conflict (user_id) do update set balance = player_currency.balance + p_tides, updated_at = now();
    insert into public.currency_transactions (user_id, amount, reason) values (p_user_id, p_tides, 'login_reward');
  end if;

  if coalesce(p_xp, 0) > 0 then
    insert into public.player_progression (user_id, xp_total) values (p_user_id, p_xp)
    on conflict (user_id) do update set xp_total = player_progression.xp_total + p_xp, updated_at = now();
  end if;

  if p_booster_id is not null then
    insert into public.player_boosters (user_id, booster_definition_id, quantity)
    values (p_user_id, p_booster_id, 1)
    on conflict (user_id, booster_definition_id) do update set
      quantity = player_boosters.quantity + 1, updated_at = now();
  end if;

  if p_card_id is not null then
    insert into public.player_cards (user_id, card_id, quantity) values (p_user_id, p_card_id, 1)
    on conflict (user_id, card_id) do update set
      quantity = player_cards.quantity + 1, updated_at = now();
  end if;

  -- Palier de série : même valeur que `LOGIN_STREAK_MILESTONE`.
  if p_streak_card_id is not null and v_streak % 30 = 0 then
    insert into public.player_cards (user_id, card_id, quantity) values (p_user_id, p_streak_card_id, 1)
    on conflict (user_id, card_id) do update set
      quantity = player_cards.quantity + 1, updated_at = now();
    v_streak_card := p_streak_card_id;
  end if;

  return jsonb_build_object(
    'ok', true,
    'step', p_next_step,
    'tides', coalesce(p_tides, 0),
    'xp', coalesce(p_xp, 0),
    'streak', v_streak,
    'streak_card_id', v_streak_card
  );
end;
$$;

revoke all on function public.claim_login_reward(uuid, integer, integer, integer, integer, text, text, text) from public, anon, authenticated;
grant execute on function public.claim_login_reward(uuid, integer, integer, integer, integer, text, text, text) to service_role;

-- Séries en cours à rattraper : réclamé aujourd'hui ou hier, série à 0.
update public.player_login_rewards
  set streak = 1,
      best_streak = greatest(best_streak, 1),
      updated_at = now()
  where streak = 0
    and last_claimed_day >= (now() at time zone 'utc')::date - 1;
