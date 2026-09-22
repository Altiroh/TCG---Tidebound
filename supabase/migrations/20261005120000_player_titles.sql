-- ======================================================================
-- TITRES — le titre choisi par chaque joueur
-- ======================================================================
-- Un titre est une courte appellation affichée avec le nom du joueur
-- (« Loup de mer », « Capitaine »…). Il ne s'achète JAMAIS : chaque titre
-- du catalogue (`game/titles/catalog.ts`) est accroché à un exploit, et le
-- déblocage se lit dans `player_achievements` — aucune table « titres
-- possédés » à tenir, aucun circuit de récompense de plus.
--
-- Deux ajouts, et rien d'autre :
--
--   1. `player_titles` — UNE ligne par joueur qui porte un titre. Pas de
--      ligne = aucun titre. Table à part plutôt qu'une colonne de
--      `profiles` : la policy « a user can update their own profile »
--      laisserait le navigateur s'y écrire n'importe quel titre. Ici,
--      aucune policy d'écriture : seul le serveur écrit, par la fonction
--      ci-dessous.
--
--   2. `set_player_title` — équipe ou retire un titre. Le catalogue vit en
--      TypeScript (comme celui des exploits et des quêtes) : le serveur
--      passe l'exploit que le titre exige, et la fonction REFUSE si cet
--      exploit n'est pas en base. Équiper n'a jamais le droit de donner.
--
-- Entièrement idempotent : rejouable sans risque. Tant qu'elle n'est pas
-- appliquée, l'appli reste debout : la lecture du titre retombe sur
-- « aucun titre », et l'équipement répond « pas encore disponible ».


-- --- 1. Le titre porté --------------------------------------------------

create table if not exists public.player_titles (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  -- Identifiant de `game/titles/catalog.ts` — pas de FK : le catalogue vit
  -- en TypeScript. Un titre retiré du catalogue est simplement ignoré à la
  -- lecture.
  title_id text not null check (title_id ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  equipped_at timestamptz not null default now()
);

alter table public.player_titles enable row level security;

-- Un titre se montre, comme un pseudo : lisible par tout joueur connecté.
drop policy if exists "titles are readable by any authenticated user" on public.player_titles;
create policy "titles are readable by any authenticated user"
  on public.player_titles for select to authenticated using (true);


-- --- 2. Équiper / retirer ----------------------------------------------

create or replace function public.set_player_title(
  p_user_id uuid,
  p_title_id text,
  p_required_achievement text
)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
begin
  perform public.assert_server_caller('set_player_title');

  -- Retirer son titre : aucune condition.
  if p_title_id is null then
    delete from public.player_titles where user_id = p_user_id;
    return jsonb_build_object('ok', true, 'title_id', null);
  end if;

  if p_required_achievement is null then
    return jsonb_build_object('ok', false, 'error', 'unknown_title');
  end if;

  if not exists (
    select 1 from public.player_achievements
    where user_id = p_user_id and code = p_required_achievement
  ) then
    return jsonb_build_object('ok', false, 'error', 'not_unlocked');
  end if;

  insert into public.player_titles (user_id, title_id, equipped_at)
  values (p_user_id, p_title_id, now())
  on conflict (user_id) do update set title_id = excluded.title_id, equipped_at = excluded.equipped_at;

  return jsonb_build_object('ok', true, 'title_id', p_title_id);
end;
$$;

revoke all on function public.set_player_title(uuid, text, text) from public, anon, authenticated;
grant execute on function public.set_player_title(uuid, text, text) to service_role;
