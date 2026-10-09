-- ═══════════════════════════════════════════════════════════════════════
-- PRÉFÉRENCES DU JOUEUR, SUR LE COMPTE (10/10/2026)
--
-- Son, volumes, raccourcis du bandeau, niveau du bot retenu, dernier deck,
-- filtres et tris des écrans… vivaient dans le `localStorage` : ils ne
-- suivaient pas le joueur d'un navigateur à l'autre (demande du 10/10/2026).
--
-- Une ligne par joueur, un objet JSON clé → valeur. Les clés sont celles
-- du client (`lib/preferences.ts`), le contenu de chaque valeur est relu et
-- validé par l'écran qui s'en sert : la base garantit seulement la forme
-- (clés lisibles, taille bornée), pas le sens.
--
-- Lecture et écriture passent par le SERVEUR (`features/settings/
-- preferencesActions.ts`, clé service_role), le joueur venant toujours de
-- sa session. Aucune policy pour le navigateur : même parti que les autres
-- tables du joueur depuis l'audit de sécurité (20261016120000).
--
-- Entièrement idempotent : rejouable sans risque.
-- ═══════════════════════════════════════════════════════════════════════

create table if not exists public.player_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  preferences jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  constraint player_preferences_object check (jsonb_typeof(preferences) = 'object'),
  -- 32 Ko : très au-delà de ce que pèsent des réglages (moins d'1 Ko
  -- aujourd'hui), assez court pour qu'on ne s'en serve pas comme d'un disque.
  constraint player_preferences_taille check (octet_length(preferences::text) <= 32768)
);

alter table public.player_preferences enable row level security;

revoke all on table public.player_preferences from anon, authenticated;


/*
 * Fusionne des préférences dans celles du joueur.
 *
 * `p_values` ne porte que les clés qui changent : les autres restent en
 * place, ce qui évite qu'un onglet écrase ce qu'un autre vient d'écrire.
 * Une valeur `null` RETIRE la clé (retour à la valeur par défaut).
 */
create or replace function public.set_player_preferences(p_user_id uuid, p_values jsonb)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  v_key text;
  v_count integer := 0;
  v_removed text[] := '{}';
begin
  perform public.assert_server_caller('set_player_preferences');

  if p_values is null or jsonb_typeof(p_values) <> 'object' then
    return jsonb_build_object('ok', false, 'error', 'Préférences illisibles.');
  end if;

  for v_key in select jsonb_object_keys(p_values) loop
    v_count := v_count + 1;
    if v_key !~ '^[a-z0-9][a-z0-9:._-]{0,79}$' then
      return jsonb_build_object('ok', false, 'error', 'Clé de préférence refusée.');
    end if;
    if jsonb_typeof(p_values -> v_key) = 'null' then
      v_removed := v_removed || v_key;
    end if;
  end loop;

  if v_count > 50 then
    return jsonb_build_object('ok', false, 'error', 'Trop de préférences à la fois.');
  end if;

  insert into public.player_preferences as pp (user_id, preferences, updated_at)
    values (p_user_id, p_values - v_removed, now())
  on conflict (user_id) do update
    set preferences = (pp.preferences || p_values) - v_removed,
        updated_at = now();

  return jsonb_build_object('ok', true);
exception
  when check_violation then
    return jsonb_build_object('ok', false, 'error', 'Préférences trop volumineuses.');
end;
$$;

revoke all on function public.set_player_preferences(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.set_player_preferences(uuid, jsonb) to service_role;
