-- ======================================================================
-- BIBLIOTHÈQUE DE DECKS v5 — refonte des decks d'emprunt
-- ======================================================================
--
-- ENTIÈREMENT REJOUABLE, et de la même forme que
-- `20261001120000_deck_library_v4.sql` : seuls les identifiants vivants
-- changent. Les relire ici plutôt que d'éditer la v4 — celle-ci est déjà
-- appliquée, et une migration appliquée ne se réécrit pas.
--
-- Notion « Decks d'emprunt — refonte depuis zéro · 12 archétypes »
-- (22/09/2026) remplace les CINQ decks d'emprunt de la v4 par DOUZE
-- listes reconstruites, avec de nouveaux identifiants
-- (`game/cards/decks/borrowed.ts`). Les six préconstruits ne bougent pas.
--
-- Aucune de ces colonnes n'a de clé étrangère — le catalogue de decks vit
-- en TypeScript — donc les lignes qui pointaient vers un identifiant de la
-- v4 survivent sans rien désigner. Un uuid de deck PERSONNEL n'est jamais
-- concerné : il ne passe pas par le catalogue, d'où le filtre par
-- expression régulière, la même que `features/decks/matchDeck.ts`.

create temporary table if not exists _deck_library_v5 (deck_id text primary key);
truncate _deck_library_v5;
insert into _deck_library_v5 (deck_id) values
  -- Decks d'emprunt (game/cards/decks/borrowed.ts)
  ('le-grand-banc'),
  ('chevaliers-du-grand-etang'),
  ('la-veillee'),
  ('le-theatre-englouti-deck'),
  ('mineurs-de-fond'),
  ('la-forteresse'),
  ('descente-aux-abysses'),
  ('epavistes'),
  ('a-bout-de-raison'),
  ('arsenal-de-pont'),
  ('chasse-au-gros'),
  ('apres-la-tempete'),
  -- Préconstruits (game/cards/decks/precon.ts) — inchangés depuis la v4
  ('dernier-rappel'),
  ('sous-la-ligne'),
  ('tout-recuperer'),
  ('les-petits-attendent'),
  ('grenouilles-au-canon'),
  ('la-ligne-tenue');

-- Pour voir ce qui sera touché AVANT d'appliquer, exécuter seulement le
-- bloc ci-dessus puis :
--   select 'unlock' as source, deck_id, count(*) from public.player_deck_unlocks
--    where not exists (select 1 from _deck_library_v5 d where d.deck_id = player_deck_unlocks.deck_id)
--    group by deck_id
--   union all
--   select 'file', deck_id, count(*) from public.matchmaking_queue
--    where deck_id !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
--      and not exists (select 1 from _deck_library_v5 d where d.deck_id = matchmaking_queue.deck_id)
--    group by deck_id;

-- ======================================================================
-- 1. LES DÉBLOCAGES
-- ======================================================================
--
-- Deux conséquences pour un compte concerné, et la seconde est bloquante :
--
--   1. `readPlayableCatalogDecks` filtre les decks introuvables : le deck
--      disparaît simplement de sa liste ;
--   2. `claim_borrowed_deck` refuse tout nouveau choix tant qu'une ligne
--      `source = 'borrowed'` existe (index unique partiel). Le joueur se
--      retrouve donc SANS deck d'emprunt et SANS pouvoir en choisir un.
--
-- Les cinq emprunts de la v4 sont TOUS retirés : ce `delete` rend son
-- choix à quiconque en avait réclamé un. Un Jeton dépensé sur un
-- préconstruit n'est pas concerné — aucun préconstruit ne disparaît.

delete from public.player_deck_unlocks u
where not exists (select 1 from _deck_library_v5 d where d.deck_id = u.deck_id);

-- ======================================================================
-- 2. LA FILE DE MATCHMAKING
-- ======================================================================
--
-- `claim_matchmaking_opponent()` retire l'adversaire de la file AVANT que
-- la résolution de son deck échoue (`features/matchmaking/actions.ts`) :
-- un joueur inscrit avec une liste retirée perdrait sa place sans partie
-- et sans message.

delete from public.matchmaking_queue q
where q.deck_id !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  and not exists (select 1 from _deck_library_v5 d where d.deck_id = q.deck_id);

-- ======================================================================
-- 3. LES PARTIES EN ATTENTE
-- ======================================================================
--
-- Une partie privée encore en `waiting` ne peut plus être rejointe :
-- `joinOnlineMatch` résout le deck de l'HÔTE, échoue, et répond « Le deck
-- de ton adversaire n'est plus disponible ». Abandonnées, pas supprimées.

update public.matches m
set status = 'abandoned'
where m.status = 'waiting'
  and (
    (
      m.player1_deck_id is not null
      and m.player1_deck_id !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      and not exists (select 1 from _deck_library_v5 d where d.deck_id = m.player1_deck_id)
    )
    or (
      m.player2_deck_id is not null
      and m.player2_deck_id !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      and not exists (select 1 from _deck_library_v5 d where d.deck_id = m.player2_deck_id)
    )
  );

-- Les parties ACTIVES ne sont PAS touchées : leur `GameState` est déjà
-- sérialisé, elles n'ont plus besoin de résoudre leur deck.

drop table if exists _deck_library_v5;

-- Les decks système eux-mêmes sont reposés par `npm run seed:cards`, qui
-- écrit `system_decks` et `system_deck_cards` depuis `CATALOG_DECKS`.
-- À exécuter APRÈS cette migration.
