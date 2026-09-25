-- ======================================================================
-- AUDIENCE — le public qui suit les parties du joueur
-- ======================================================================
-- Moteur : `game/audience/` (analyse du journal de chaque partie, en fin de
-- partie, côté serveur — le joueur n'a rien à faire). Ouverte à tous dès
-- le premier jour ; c'est elle qui ouvre ensuite l'œil des mécènes.
--
-- L'audience SUIT les dernières parties : chaque partie en retire une part
-- et y ajoute son spectacle. Même formule que `nextAudience`
-- (game/audience/analyzeMatch.ts) : round(audience × 0,8) + spectacle × 5.

create table if not exists public.player_audience (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  audience integer not null default 0 check (audience >= 0),
  best_audience integer not null default 0 check (best_audience >= 0),
  -- Spectacle (0 à 100) et temps forts de la dernière partie jugée.
  last_spectacle integer check (last_spectacle between 0 and 100),
  last_highlights text[] not null default '{}',
  matches_judged integer not null default 0 check (matches_judged >= 0),
  updated_at timestamptz not null default now()
);

alter table public.player_audience enable row level security;
drop policy if exists "a user can read their own audience" on public.player_audience;
create policy "a user can read their own audience"
  on public.player_audience for select to authenticated using (user_id = (select auth.uid()));

-- Une partie n'est jugée qu'une fois par joueur, même si deux chemins observent sa fin.
create table if not exists public.player_audience_matches (
  match_id uuid not null references public.matches (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  spectacle integer not null check (spectacle between 0 and 100),
  judged_at timestamptz not null default now(),
  primary key (match_id, user_id)
);

alter table public.player_audience_matches enable row level security;
drop policy if exists "a user can read their own judged matches" on public.player_audience_matches;
create policy "a user can read their own judged matches"
  on public.player_audience_matches for select to authenticated using (user_id = (select auth.uid()));

create or replace function public.record_match_audience(
  p_user_id uuid,
  p_match_id uuid,
  p_spectacle integer,
  p_highlights text[] default '{}'
)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  v_spectacle integer := greatest(0, least(100, coalesce(p_spectacle, 0)));
  v_audience integer;
begin
  perform public.assert_server_caller('record_match_audience');

  insert into public.player_audience_matches (match_id, user_id, spectacle)
  values (p_match_id, p_user_id, v_spectacle)
  on conflict do nothing;
  if not found then
    select pa.audience into v_audience from public.player_audience pa where pa.user_id = p_user_id;
    return jsonb_build_object('ok', true, 'recorded', false, 'audience', coalesce(v_audience, 0));
  end if;

  insert into public.player_audience (user_id) values (p_user_id)
  on conflict (user_id) do nothing;

  update public.player_audience
    set audience = greatest(0, round(audience * 0.8)::integer + v_spectacle * 5),
        best_audience = greatest(best_audience, greatest(0, round(audience * 0.8)::integer + v_spectacle * 5)),
        last_spectacle = v_spectacle,
        last_highlights = coalesce(p_highlights, '{}'),
        matches_judged = matches_judged + 1,
        updated_at = now()
    where user_id = p_user_id
    returning audience into v_audience;

  return jsonb_build_object('ok', true, 'recorded', true, 'audience', v_audience);
end;
$$;

revoke all on function public.record_match_audience(uuid, uuid, integer, text[]) from public, anon, authenticated;
grant execute on function public.record_match_audience(uuid, uuid, integer, text[]) to service_role;
