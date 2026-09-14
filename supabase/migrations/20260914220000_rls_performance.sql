-- Performances des politiques RLS et index manquants.
--
-- 1. `auth.uid()` écrit tel quel dans une politique est réévalué pour CHAQUE
--    ligne examinée. Encapsulé dans un sous-select, `(select auth.uid())`,
--    Postgres le calcule une fois par requête (initplan) — recommandation
--    du Performance Advisor de Supabase (« auth_rls_initplan »). Le résultat
--    est strictement le même : seul le plan d'exécution change.
--
--    `alter policy` conserve le nom, la commande et les rôles de chaque
--    politique : seules les expressions sont réécrites. Les politiques de
--    `matches` supprimées par `20260913100000_private_match_state.sql` ne
--    sont pas reprises.
--
-- 2. Index sur `user_id` pour les tables lues par propriétaire sans index
--    dédié (liste des decks, historique d'ouverture de boosters).

-- Tout ou rien : si une politique porte un autre nom en base, rien n'est modifié.
begin;

-- ── profiles / matches ─────────────────────────────────────────
alter policy "a user can update their own profile" on public.profiles
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

alter policy "players can read their own matches" on public.matches
  using (player1_id = (select auth.uid()) or player2_id = (select auth.uid()));

-- ── decks ──────────────────────────────────────────────────────
alter policy "a user can manage their own decks" on public.player_decks
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

alter policy "a user can manage the cards of their own decks" on public.player_deck_cards
  using (exists (select 1 from public.player_decks d where d.id = deck_id and d.user_id = (select auth.uid())))
  with check (exists (select 1 from public.player_decks d where d.id = deck_id and d.user_id = (select auth.uid())));

-- ── collection, boosters, monnaie ──────────────────────────────
alter policy "a user can read their own collection" on public.player_cards
  using (user_id = (select auth.uid()));

alter policy "a user can read their own unopened boosters" on public.player_boosters
  using (user_id = (select auth.uid()));

alter policy "a user can read their own booster opening history" on public.booster_openings
  using (user_id = (select auth.uid()));

alter policy "a user can read the cards from their own booster openings" on public.booster_opening_cards
  using (exists (select 1 from public.booster_openings o where o.id = booster_opening_id and o.user_id = (select auth.uid())));

alter policy "a user can read their own pity counter" on public.player_pity
  using (user_id = (select auth.uid()));

alter policy "a user can read their own currency balance" on public.player_currency
  using (user_id = (select auth.uid()));

alter policy "a user can read their own currency transactions" on public.currency_transactions
  using (user_id = (select auth.uid()));

-- ── quêtes, onboarding, matchmaking, progression ───────────────
alter policy "a user can read their own quest progress" on public.player_quest_progress
  using (user_id = (select auth.uid()));

alter policy "a user can read their own onboarding state" on public.player_onboarding
  using (user_id = (select auth.uid()));

alter policy "a user can manage their own matchmaking queue entry" on public.matchmaking_queue
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

alter policy "a user can read their own progression" on public.player_progression
  using (user_id = (select auth.uid()));

alter policy "a user can read their own match rewards" on public.match_rewards
  using (user_id = (select auth.uid()));

alter policy "a user can read their own match quest progress" on public.match_quest_progress
  using (user_id = (select auth.uid()));

-- ── Index ──────────────────────────────────────────────────────
create index if not exists player_decks_user_id_idx on public.player_decks (user_id);
create index if not exists booster_openings_user_id_idx on public.booster_openings (user_id);

commit;
