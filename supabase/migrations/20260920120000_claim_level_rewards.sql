-- ======================================================================
-- RÉCOMPENSES DE NIVEAU À RÉCLAMER
-- ======================================================================
-- Jusqu'ici, un palier franchi était crédité automatiquement en fin de
-- partie (`grant_match_progression`). Le joueur ne voyait rien arriver :
-- ses Tides montaient, un booster apparaissait dans sa réserve, sans moment
-- à lui. Désormais un palier franchi ATTEND d'être réclamé depuis le profil,
-- et l'interface le signale partout.
--
-- `grant_match_progression` ne change pas : l'application lui passe
-- simplement une liste de paliers vide et ne compte plus leurs Tides.
--
-- Garanties :
--   - on ne réclame qu'un palier ATTEINT (niveau en base, pas celui que dit
--     le client) ;
--   - un palier ne se réclame qu'une fois (clé primaire de
--     `player_level_rewards`, déjà en place) ;
--   - le CONTENU du palier vient du serveur applicatif (table TypeScript
--     `LEVEL_REWARDS`), jamais du navigateur : la fonction n'est appelable
--     qu'avec la clé de service.

create or replace function public.claim_level_reward(p_user_id uuid, p_level integer, p_items jsonb)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  v_level integer;
  v_item jsonb;
  v_tides integer := 0;
  v_tokens integer := 0;
begin
  perform public.assert_server_caller('claim_level_reward');

  if p_level is null or p_level < 1 then
    return jsonb_build_object('ok', false, 'error', 'Palier inconnu.');
  end if;

  select pp.level into v_level from public.player_progression pp where pp.user_id = p_user_id for update;
  if coalesce(v_level, 1) < p_level then
    return jsonb_build_object('ok', false, 'error', 'Ce palier n''est pas encore atteint.');
  end if;

  insert into public.player_level_rewards (user_id, level, granted)
  values (p_user_id, p_level, coalesce(p_items, '[]'::jsonb))
  on conflict (user_id, level) do nothing;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'Palier déjà réclamé.', 'already_claimed', true);
  end if;

  for v_item in select * from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) loop
    case v_item ->> 'kind'
      when 'tides' then
        v_tides := v_tides + greatest(0, coalesce((v_item ->> 'amount')::integer, 0));
      when 'booster' then
        insert into public.player_boosters (user_id, booster_definition_id, quantity)
        values (p_user_id, v_item ->> 'boosterId', greatest(1, coalesce((v_item ->> 'count')::integer, 1)))
        on conflict (user_id, booster_definition_id) do update set
          quantity = player_boosters.quantity + greatest(1, coalesce((v_item ->> 'count')::integer, 1)),
          updated_at = now();
      when 'preconToken' then
        v_tokens := v_tokens + greatest(0, coalesce((v_item ->> 'count')::integer, 1));
      when 'cosmetic' then
        insert into public.player_cosmetics (user_id, cosmetic_kind, cosmetic_id, label)
        values (p_user_id, v_item ->> 'cosmetic', v_item ->> 'id', coalesce(v_item ->> 'label', ''))
        on conflict (user_id, cosmetic_kind, cosmetic_id) do nothing;
      else
        -- 'cardChoice' : ouvert par l'application juste après (`open_card_choice`),
        -- qui a besoin d'un tirage de cartes.
        null;
    end case;
  end loop;

  if v_tokens > 0 then
    update public.player_progression
      set precon_tokens = player_progression.precon_tokens + v_tokens, updated_at = now()
      where user_id = p_user_id;
  end if;

  if v_tides > 0 then
    insert into public.player_currency (user_id, balance)
    values (p_user_id, v_tides)
    on conflict (user_id) do update set
      balance = player_currency.balance + v_tides,
      updated_at = now();

    insert into public.currency_transactions (user_id, amount, reason)
    values (p_user_id, v_tides, 'level_reward');
  end if;

  return jsonb_build_object('ok', true, 'level', p_level, 'tides', v_tides, 'precon_tokens', v_tokens);
end;
$$;

revoke all on function public.claim_level_reward(uuid, integer, jsonb) from public, anon, authenticated;
grant execute on function public.claim_level_reward(uuid, integer, jsonb) to service_role;
