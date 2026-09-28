-- Jeu en ligne : une file de matchmaking qui ne garde que des joueurs PRÉSENTS.
--
-- Deux défauts de la file, corrigés ici.
--
--   1. JOUEURS FANTÔMES. Un joueur qui fermait brutalement son onglet (crash,
--      réseau coupé, téléphone verrouillé) restait en file : le suivant était
--      apparié avec lui et tombait sur une partie que personne ne jouait. La
--      page de recherche signale désormais sa présence à chaque sondage
--      (`last_seen_at`) ; une entrée muette depuis plus de 30 secondes n'est
--      plus appariable, et elle est purgée au passage.
--
--   2. APPARIEMENT CROISÉ. Deux joueurs arrivés au même instant pouvaient
--      chacun « réclamer » l'autre et créer DEUX parties. L'appelant verrouille
--      maintenant d'abord sa propre entrée : deux appels croisés se voient
--      mutuellement verrouillés, aucun n'apparie, et le sondage suivant de
--      l'un d'eux conclut. L'entrée de l'appelant quitte la file avec celle de
--      son adversaire, dans la même transaction.
--
-- Entièrement idempotente : rejouable sans risque.

alter table public.matchmaking_queue
  add column if not exists last_seen_at timestamptz not null default now();

create index if not exists matchmaking_queue_waiting_idx on public.matchmaking_queue (queued_at);

create or replace function public.claim_matchmaking_opponent(p_user_id uuid)
returns table (opponent_user_id uuid, opponent_deck_id text)
language plpgsql
security definer set search_path = public
as $$
declare
  v_opponent record;
begin
  perform public.assert_server_caller('claim_matchmaking_opponent');

  -- Les absents sortent de la file : leur page ne signale plus rien.
  delete from public.matchmaking_queue q
    where q.last_seen_at < now() - interval '30 seconds'
      and q.user_id <> p_user_id;

  -- Sa propre entrée d'abord, verrouillée. Absente (jamais entré, ou déjà
  -- apparié par un autre) : rien à faire. Déjà verrouillée par un appel
  -- concurrent : on laisse ce dernier conclure.
  perform 1 from public.matchmaking_queue q
    where q.user_id = p_user_id
    for update skip locked;
  if not found then
    return;
  end if;

  -- Boucle d'une ligne plutôt que `select … into` : l'éditeur SQL de
  -- Supabase prend un `select … into` pour une création de table et coupe
  -- le corps de la fonction (vécu le 28/09/2026).
  for v_opponent in
    select q.user_id, q.deck_id
    from public.matchmaking_queue q
    where q.user_id <> p_user_id
      and q.last_seen_at >= now() - interval '30 seconds'
    order by q.queued_at asc
    for update skip locked
    limit 1
  loop
    delete from public.matchmaking_queue where user_id in (v_opponent.user_id, p_user_id);
    return query select v_opponent.user_id, v_opponent.deck_id;
    return;
  end loop;
end;
$$;

revoke all on function public.claim_matchmaking_opponent(uuid) from public, anon, authenticated;
grant execute on function public.claim_matchmaking_opponent(uuid) to service_role;
