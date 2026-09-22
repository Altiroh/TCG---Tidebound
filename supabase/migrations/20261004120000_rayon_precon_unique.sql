-- ======================================================================
-- UN SEUL RAYON DE DECKS FOURNIS — les six anciens préconstruits partent
-- ======================================================================
--
-- ENTIÈREMENT REJOUABLE, et de la même forme que
-- `20261003120000_deck_library_v5.sql` : seule la liste des identifiants
-- vivants change.
--
-- À APPLIQUER APRÈS la v5. Si la v5 n'a pas encore été passée, celle-ci
-- fait son travail au passage — elle nettoie tout ce qui ne figure pas
-- dans la liste ci-dessous, et les cinq emprunts v4 n'y figurent pas non
-- plus.
--
-- CE QUI CHANGE, ET CE QUI NE CHANGE PAS. Le jeu distinguait des « decks
-- d'emprunt » et des « préconstruits » ; la distinction ne portait que sur
-- la PORTE d'entrée — le premier gratuit, les suivants à un Jeton — jamais
-- sur le deck. Les deux rayons fusionnent donc côté code, et le mot retenu
-- est « préconstruit ».
--
-- LE SCHÉMA NE BOUGE PAS. `player_deck_unlocks.source` garde ses deux
-- valeurs ('borrowed', 'precon_token') : c'est exactement ce qu'on veut
-- continuer à noter, par quelle porte la ligne est entrée. `claim_borrowed
-- _deck` et `unlock_precon_deck` gardent leurs noms et leur contrat, index
-- unique partiel compris — un seul choix gratuit par compte. Aucun compte
-- ne perd son Jeton, et personne n'a besoin d'être recrédité.
--
-- SEULES LES SIX LISTES RETIRÉES sont nettoyées ici. L'audit de
-- recouvrement les donnait toutes en doublon d'un des douze axes de la
-- refonte — Les Petits Attendent à 80 % de La Veillée, Dernier Rappel à
-- 80 % du Théâtre Englouti, Grenouilles au Canon à 65 % du Grand Banc,
-- Tout Récupérer à 53 % d'Épavistes, Sous la Ligne à 38 % de Descente aux
-- Abysses, La Ligne Tenue coincée entre Mineurs de Fond et La Forteresse —
-- et aucune ne jouait une seule carte du Lot 14.

create temporary table if not exists _rayon_precon (deck_id text primary key);
truncate _rayon_precon;
insert into _rayon_precon (deck_id) values
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
  ('apres-la-tempete');

-- Pour voir ce qui sera touché AVANT d'appliquer, exécuter seulement le
-- bloc ci-dessus puis :
--   select source, deck_id, count(*) from public.player_deck_unlocks
--    where not exists (select 1 from _rayon_precon d where d.deck_id = player_deck_unlocks.deck_id)
--    group by source, deck_id;

-- ======================================================================
-- 1. LES DÉBLOCAGES
-- ======================================================================
--
-- Un déblocage qui pointe sur une liste retirée ne désigne plus rien :
-- `readPlayableCatalogDecks` le filtre, le deck disparaît de la liste du
-- joueur — et, si c'était son choix GRATUIT, `claim_borrowed_deck` refuse
-- tout nouveau choix tant que la ligne `source = 'borrowed'` existe. Le
-- joueur se retrouverait sans deck ET sans pouvoir en reprendre un.
--
-- Un Jeton dépensé sur un préconstruit retiré n'est PAS remboursé ici : à
-- décider séparément, un `update player_progression set precon_tokens =
-- precon_tokens + 1` ciblé étant trivial une fois le décompte connu. La
-- requête de contrôle ci-dessus le donne, ventilé par `source`.

delete from public.player_deck_unlocks u
where not exists (select 1 from _rayon_precon d where d.deck_id = u.deck_id);

-- ======================================================================
-- 2. LA FILE DE MATCHMAKING
-- ======================================================================
--
-- `claim_matchmaking_opponent()` retire l'adversaire de la file AVANT que
-- la résolution de son deck échoue (`features/matchmaking/actions.ts`) :
-- un joueur inscrit avec une liste retirée perdrait sa place sans partie
-- et sans message. Le filtre par expression régulière épargne les uuid de
-- decks PERSONNELS, qui ne passent pas par le catalogue.

delete from public.matchmaking_queue q
where q.deck_id !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  and not exists (select 1 from _rayon_precon d where d.deck_id = q.deck_id);

-- ======================================================================
-- 3. LES PARTIES EN ATTENTE
-- ======================================================================
--
-- Une partie privée encore en `waiting` ne peut plus être rejointe :
-- `joinOnlineMatch` résout le deck de l'HÔTE, échoue, et répond « Le deck
-- de ton adversaire n'est plus disponible ». Abandonnées, pas supprimées —
-- l'hôte doit retrouver une trace de ce qu'il avait ouvert.

update public.matches m
set status = 'abandoned'
where m.status = 'waiting'
  and (
    (
      m.player1_deck_id is not null
      and m.player1_deck_id !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      and not exists (select 1 from _rayon_precon d where d.deck_id = m.player1_deck_id)
    )
    or (
      m.player2_deck_id is not null
      and m.player2_deck_id !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      and not exists (select 1 from _rayon_precon d where d.deck_id = m.player2_deck_id)
    )
  );

-- Les parties ACTIVES ne sont PAS touchées : leur `GameState` est déjà
-- sérialisé, elles n'ont plus besoin de résoudre leur deck.

drop table if exists _rayon_precon;

-- Les decks système eux-mêmes sont reposés par `npm run seed:cards`, qui
-- écrit `system_decks` et `system_deck_cards` depuis `CATALOG_DECKS`.
-- À exécuter APRÈS cette migration.
