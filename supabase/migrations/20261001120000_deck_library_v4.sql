-- ======================================================================
-- BIBLIOTHÈQUE DE DECKS v4 — retrait des références orphelines
-- ======================================================================
--
-- ENTIÈREMENT REJOUABLE. Si une première version de ce fichier a déjà été
-- appliquée (elle ne traitait que `player_deck_unlocks`), il suffit de le
-- relancer : chaque instruction ne touche que ce qui est encore orphelin.
--
-- Notion « Bibliothèque de decks — v4 · Compétitif depuis zéro »
-- (19/09/2026) a remplacé les treize listes précédentes par dix listes
-- reconstruites, avec de NOUVEAUX identifiants (`game/cards/decks/
-- borrowed.ts` et `precon.ts`). Aucune de ces colonnes n'a de clé
-- étrangère — le catalogue de decks vit en TypeScript — donc les lignes
-- qui pointaient vers un ancien identifiant survivent sans rien désigner.
--
-- Un uuid de deck PERSONNEL n'est jamais concerné : il ne passe pas par le
-- catalogue. D'où le filtre par expression régulière, la même que
-- `features/decks/matchDeck.ts`. Compter les tirets ne suffisait pas —
-- « la-cour-du-grand-etang » en a quatre, tout comme un uuid, et se serait
-- fait épargner alors qu'il fait précisément partie des listes retirées.

-- Les dix identifiants encore vivants, écrits UNE fois pour les trois
-- nettoyages. Table temporaire : elle ne vit que le temps de la session.
create temporary table if not exists _deck_library_v4 (deck_id text primary key);
truncate _deck_library_v4;
insert into _deck_library_v4 (deck_id) values
  -- Decks d'emprunt (game/cards/decks/borrowed.ts)
  ('bec-dans-la-brume'),
  ('cap-de-fer'),
  ('le-banc-deborde'),
  ('grace-sous-pression'),
  ('a-portee'),
  -- Préconstruits (game/cards/decks/precon.ts)
  ('dernier-rappel'),
  ('sous-la-ligne'),
  ('tout-recuperer'),
  ('les-petits-attendent'),
  ('grenouilles-au-canon');

-- Pour voir ce qui sera touché AVANT d'appliquer, exécuter seulement le
-- bloc ci-dessus puis :
--   select 'unlock' as source, deck_id, count(*) from public.player_deck_unlocks
--    where not exists (select 1 from _deck_library_v4 d where d.deck_id = player_deck_unlocks.deck_id)
--    group by deck_id
--   union all
--   select 'file', deck_id, count(*) from public.matchmaking_queue
--    where deck_id !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
--      and not exists (select 1 from _deck_library_v4 d where d.deck_id = matchmaking_queue.deck_id)
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
-- Un Jeton dépensé sur un préconstruit retiré n'est PAS remboursé ici : à
-- décider séparément, un `update player_progression set precon_tokens =
-- precon_tokens + 1` ciblé étant trivial une fois le décompte connu.

delete from public.player_deck_unlocks u
where not exists (select 1 from _deck_library_v4 d where d.deck_id = u.deck_id);

-- ======================================================================
-- 2. LA FILE DE MATCHMAKING
-- ======================================================================
--
-- `claim_matchmaking_opponent()` retire l'adversaire de la file AVANT que
-- la résolution de son deck échoue (`features/matchmaking/actions.ts`) :
-- un joueur inscrit avec une liste retirée perdrait sa place sans partie
-- et sans message. On retire la ligne plutôt que de la corriger — un deck
-- choisi n'est pas devinable, et laisser quelqu'un en file avec une liste
-- qui n'existe plus revient à lui promettre une partie impossible.

delete from public.matchmaking_queue q
where q.deck_id !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  and not exists (select 1 from _deck_library_v4 d where d.deck_id = q.deck_id);

-- ======================================================================
-- 3. LES PARTIES EN ATTENTE
-- ======================================================================
--
-- Une partie privée encore en `waiting` ne peut plus être rejointe :
-- `joinOnlineMatch` résout le deck de l'HÔTE, échoue, et répond « Le deck
-- de ton adversaire n'est plus disponible ». La partie resterait en
-- attente pour toujours, sans que son hôte puisse rien y faire.
--
-- Abandonnées, pas supprimées : l'hôte doit retrouver une trace de ce
-- qu'il avait ouvert, et `abandoned` est l'état prévu pour une partie qui
-- ne commencera pas.

update public.matches m
set status = 'abandoned'
where m.status = 'waiting'
  and (
    (
      m.player1_deck_id is not null
      and m.player1_deck_id !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      and not exists (select 1 from _deck_library_v4 d where d.deck_id = m.player1_deck_id)
    )
    or (
      m.player2_deck_id is not null
      and m.player2_deck_id !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      and not exists (select 1 from _deck_library_v4 d where d.deck_id = m.player2_deck_id)
    )
  );

-- Les parties ACTIVES ne sont PAS touchées : leur `GameState` est déjà
-- sérialisé, elles n'ont plus besoin de résoudre leur deck. Une partie
-- `finished` encore moins.

drop table if exists _deck_library_v4;

-- Les decks système eux-mêmes sont reposés par `npm run seed:cards`, qui
-- écrit `system_decks` et `system_deck_cards` depuis `CATALOG_DECKS` —
-- emprunts ET préconstruits désormais, là où le seed ne connaissait que
-- les trois decks de base. Les anciennes lignes, elles, ne gênent pas :
-- rien ne les lit plus.
