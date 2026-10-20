-- ═══════════════════════════════════════════════════════════════════════
-- SOCIAL : VITRINE ET ÉCHANGES DE CARTES (20/10/2026)
--
-- À appliquer APRÈS 20261108120000 (éditions de carte) et 20261018120000
-- (amis).
--
--  1. `player_showcase` : la VITRINE d'un joueur, six emplacements où il met
--     en avant des cartes qu'il possède, dans l'édition de son choix (une
--     Styled Full-Art Star Foil se montre). Vue par ses amis, sur sa fiche,
--     et par son adversaire sur l'écran de présentation d'une partie en
--     ligne. Écrite et lue par le SERVEUR seulement : la possession y est
--     revérifiée, et une carte qui n'est plus possédée n'est plus montrée.
--  2. `card_trades` : une proposition d'échange entre deux AMIS — des
--     exemplaires Classiques donnés contre des exemplaires Classiques
--     demandés. Une édition rare ne s'échange pas (elle reste au joueur qui
--     l'a tirée).
--  3. `accept_card_trade` : l'acceptation, ATOMIQUE. Revérifie l'amitié, la
--     fraîcheur de l'offre (72 h), le plafond quotidien (5 échanges conclus
--     par joueur et par 24 h — contre le transfert massif vers un compte
--     secondaire) et la possession des deux côtés au moment même de
--     l'acceptation ; puis déplace les exemplaires. Rien ne bouge si une
--     seule ligne ne tient plus.
--
-- Aucune policy navigateur : tout passe par la clé service_role
-- (`features/friends/tradeService.ts`, `showcaseService.ts`).
-- Entièrement idempotente : rejouable sans risque.
-- ═══════════════════════════════════════════════════════════════════════


-- ======================================================================
-- 1. VITRINE
-- ======================================================================

create table if not exists public.player_showcase (
  user_id uuid not null references public.profiles (id) on delete cascade,
  slot smallint not null,
  card_id text not null references public.cards (id) on delete cascade,
  artwork text not null default 'classique',
  finish text not null default 'classique',
  updated_at timestamptz not null default now(),
  primary key (user_id, slot),
  constraint player_showcase_slot check (slot between 0 and 5),
  constraint player_showcase_artwork check (artwork in ('classique', 'styled', 'styled-fa')),
  constraint player_showcase_finish check (finish in ('classique', 'monochrome', 'foil', 'negative', 'prismatic', 'star-foil'))
);

alter table public.player_showcase enable row level security;
revoke all on table public.player_showcase from anon, authenticated;


-- ======================================================================
-- 2. ÉCHANGES
-- ======================================================================

create table if not exists public.card_trades (
  id uuid primary key default gen_random_uuid(),
  from_user uuid not null references public.profiles (id) on delete cascade,
  to_user uuid not null references public.profiles (id) on delete cascade,
  -- `[{ "card_id": "...", "quantity": 2 }, …]` — Classiques seulement.
  offered jsonb not null,
  requested jsonb not null,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  constraint card_trades_status check (status in ('pending', 'accepted', 'declined', 'cancelled')),
  constraint card_trades_distinct_users check (from_user <> to_user),
  constraint card_trades_offered_array check (jsonb_typeof(offered) = 'array' and jsonb_array_length(offered) between 1 and 5),
  constraint card_trades_requested_array check (jsonb_typeof(requested) = 'array' and jsonb_array_length(requested) between 1 and 5)
);

create index if not exists card_trades_to_user_idx on public.card_trades (to_user, status);
create index if not exists card_trades_from_user_idx on public.card_trades (from_user, status);

alter table public.card_trades enable row level security;
revoke all on table public.card_trades from anon, authenticated;


-- ======================================================================
-- 3. ACCEPTATION
-- ======================================================================

/*
 * Exemplaires CLASSIQUES disponibles d'une carte : le compte de la carte
 * moins ses éditions rares (un exemplaire d'édition est aussi compté dans
 * `player_cards`). Même règle que `recycle_edition`.
 */
create or replace function public.classic_copies_available(p_user_id uuid, p_card_id text)
returns integer
language sql
stable
security definer set search_path = public
as $$
  select greatest(
    coalesce((select pc.quantity from public.player_cards pc where pc.user_id = p_user_id and pc.card_id = p_card_id), 0)
    - coalesce((select sum(e.quantity) from public.player_card_editions e where e.user_id = p_user_id and e.card_id = p_card_id), 0),
    0
  )::integer;
$$;

revoke all on function public.classic_copies_available(uuid, text) from public, anon, authenticated;
grant execute on function public.classic_copies_available(uuid, text) to service_role;


create or replace function public.accept_card_trade(p_trade_id uuid, p_user_id uuid)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  v_trade record;
  v_line record;
  v_found boolean := false;
  v_done integer;
begin
  perform public.assert_server_caller('accept_card_trade');

  -- Boucle d'une ligne plutôt que `select … into` (cf. `claim_matchmaking_opponent`).
  for v_trade in
    select t.* from public.card_trades t where t.id = p_trade_id for update
  loop
    v_found := true;
  end loop;

  -- Seul le DESTINATAIRE accepte, et seulement une offre encore ouverte.
  -- Deux tests : plpgsql n'évalue pas `or` en court-circuit, et lire un
  -- champ de `v_trade` jamais affecté lève une erreur.
  if not v_found then
    return jsonb_build_object('ok', false, 'error', 'Cet échange n''existe plus.');
  end if;
  if v_trade.to_user <> p_user_id or v_trade.status <> 'pending' then
    return jsonb_build_object('ok', false, 'error', 'Cet échange n''existe plus.');
  end if;
  if v_trade.created_at < now() - interval '72 hours' then
    return jsonb_build_object('ok', false, 'error', 'Cette offre a expiré.');
  end if;

  if not exists (
    select 1 from public.friendships f
    where f.status = 'accepted'
      and f.user_a = least(v_trade.from_user, v_trade.to_user)
      and f.user_b = greatest(v_trade.from_user, v_trade.to_user)
  ) then
    return jsonb_build_object('ok', false, 'error', 'Vous n''êtes plus amis : l''échange est impossible.');
  end if;

  select count(*) into v_done
  from public.card_trades t
  where t.status = 'accepted'
    and t.resolved_at >= now() - interval '24 hours'
    and (t.from_user in (v_trade.from_user, v_trade.to_user) or t.to_user in (v_trade.from_user, v_trade.to_user));
  if v_done >= 5 then
    return jsonb_build_object('ok', false, 'error', 'Plafond atteint : 5 échanges par jour. Réessaie demain.');
  end if;

  -- Verrou sur toutes les cartes en jeu, dans un ordre fixe : deux échanges
  -- (ou une revente) simultanés ne cèdent jamais le même exemplaire.
  perform 1
  from public.player_cards pc
  where pc.user_id in (v_trade.from_user, v_trade.to_user)
    and pc.card_id in (
      select l->>'card_id' from jsonb_array_elements(v_trade.offered) l
      union
      select l->>'card_id' from jsonb_array_elements(v_trade.requested) l
    )
  order by pc.user_id, pc.card_id
  for update;

  -- Tout se vérifie AVANT le premier mouvement.
  for v_line in
    select v_trade.from_user as giver, l->>'card_id' as card_id, sum((l->>'quantity')::integer) as quantity
    from jsonb_array_elements(v_trade.offered) l group by l->>'card_id'
    union all
    select v_trade.to_user as giver, l->>'card_id' as card_id, sum((l->>'quantity')::integer) as quantity
    from jsonb_array_elements(v_trade.requested) l group by l->>'card_id'
  loop
    if v_line.quantity is null or v_line.quantity < 1 then
      return jsonb_build_object('ok', false, 'error', 'Échange illisible.');
    end if;
    if public.classic_copies_available(v_line.giver, v_line.card_id) < v_line.quantity then
      return jsonb_build_object(
        'ok', false,
        'error', case when v_line.giver = p_user_id
          then 'Tu ne possèdes plus assez d''exemplaires des cartes demandées.'
          else 'Ton ami ne possède plus les cartes proposées.' end
      );
    end if;
  end loop;

  for v_line in
    select v_trade.from_user as giver, v_trade.to_user as receiver, l->>'card_id' as card_id, sum((l->>'quantity')::integer) as quantity
    from jsonb_array_elements(v_trade.offered) l group by l->>'card_id'
    union all
    select v_trade.to_user as giver, v_trade.from_user as receiver, l->>'card_id' as card_id, sum((l->>'quantity')::integer) as quantity
    from jsonb_array_elements(v_trade.requested) l group by l->>'card_id'
  loop
    update public.player_cards
      set quantity = player_cards.quantity - v_line.quantity, updated_at = now()
      where user_id = v_line.giver and card_id = v_line.card_id;

    insert into public.player_cards as pc (user_id, card_id, quantity)
      values (v_line.receiver, v_line.card_id, v_line.quantity)
    on conflict (user_id, card_id) do update
      set quantity = pc.quantity + excluded.quantity, updated_at = now();
  end loop;

  update public.card_trades
    set status = 'accepted', resolved_at = now()
    where id = p_trade_id;

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.accept_card_trade(uuid, uuid) from public, anon, authenticated;
grant execute on function public.accept_card_trade(uuid, uuid) to service_role;
