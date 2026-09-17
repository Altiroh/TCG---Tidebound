-- ======================================================================
-- DECKS — corbeille : « Récemment supprimés » pendant 30 jours
-- ======================================================================
-- Supprimer un deck ne l'efface plus : il est DATÉ (`deleted_at`) et reste
-- lisible par son propriétaire, qui peut le restaurer ou l'effacer pour de
-- bon depuis l'écran Decks. Un deck daté est invisible partout ailleurs
-- (liste des decks jouables, éditeur, partie arbitrée) : c'est le code qui
-- filtre `deleted_at is null`, la base ne change pas de règle d'accès.
--
-- Après 30 jours (`DECK_TRASH_RETENTION_DAYS`, côté application), le deck
-- est effacé définitivement : `player_deck_cards` suit par la clé étrangère
-- (`on delete cascade`, migration 20260910120000).
--
-- L'effacement automatique est fait PAR L'APPLICATION, à chaque ouverture
-- de la liste des decks du joueur (`listPlayerDecks`) : la politique RLS
-- existante (« a user can manage their own decks ») suffit, aucun job de
-- fond n'est requis. `purge_expired_deleted_decks()` ci-dessous permet en
-- plus de passer le balai sur TOUS les comptes, à la main ou via pg_cron si
-- l'extension est activée un jour — ce n'est pas nécessaire au fonctionnement.
--
-- Entièrement idempotent : rejouable sans risque.

alter table public.player_decks
  add column if not exists deleted_at timestamptz;

comment on column public.player_decks.deleted_at is
  'Date de mise à la corbeille (« Récemment supprimés »). NULL = deck actif. Effacé définitivement 30 jours après, par l''application.';

-- La liste des decks actifs d'un joueur est la requête la plus fréquente :
-- l'index partiel la sert sans balayer la corbeille.
create index if not exists player_decks_user_active_idx
  on public.player_decks (user_id, created_at)
  where deleted_at is null;

-- Balai global (optionnel) : efface les decks à la corbeille depuis plus de
-- `p_retention_days` jours, pour tous les comptes. Rend le nombre de decks
-- effacés. À réserver à un rôle d'administration : `security definer`.
create or replace function public.purge_expired_deleted_decks(p_retention_days integer default 30)
returns integer
language plpgsql
security definer set search_path = public
as $$
declare
  v_count integer;
begin
  delete from public.player_decks
  where deleted_at is not null
    and deleted_at < now() - make_interval(days => greatest(1, coalesce(p_retention_days, 30)));
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.purge_expired_deleted_decks(integer) from public;
revoke all on function public.purge_expired_deleted_decks(integer) from anon, authenticated;
