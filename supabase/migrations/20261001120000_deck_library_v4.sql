-- ======================================================================
-- BIBLIOTHÈQUE DE DECKS v4 — retrait des déblocages orphelins
-- ======================================================================
--
-- Notion « Bibliothèque de decks — v4 · Compétitif depuis zéro »
-- (19/09/2026) a remplacé les treize listes précédentes par dix listes
-- reconstruites, avec de NOUVEAUX identifiants (`game/cards/decks/
-- borrowed.ts` et `precon.ts`). `player_deck_unlocks.deck_id` n'a pas de
-- clé étrangère — le catalogue de decks vit en TypeScript — donc les
-- lignes qui pointaient vers un ancien identifiant survivent sans rien
-- désigner.
--
-- Deux conséquences pour un compte concerné, et la seconde est bloquante :
--
--   1. `readPlayableCatalogDecks` filtre les decks introuvables : le deck
--      disparaît simplement de sa liste ;
--   2. `claim_borrowed_deck` refuse tout nouveau choix tant qu'une ligne
--      `source = 'borrowed'` existe (index unique partiel). Le joueur se
--      retrouve donc SANS deck d'emprunt et SANS pouvoir en choisir un.
--
-- Cette migration supprime uniquement les lignes devenues orphelines. Un
-- Jeton dépensé sur un préconstruit retiré n'est PAS remboursé ici : à
-- décider séparément, un `update player_progression set precon_tokens =
-- precon_tokens + 1` ciblé étant trivial une fois le décompte connu.
--
-- Pour voir ce qui sera supprimé avant de l'appliquer :
--   select deck_id, source, count(*)
--     from public.player_deck_unlocks
--    where deck_id not in (
--      'bec-dans-la-brume', 'cap-de-fer', 'le-banc-deborde',
--      'grace-sous-pression', 'a-portee',
--      'dernier-rappel', 'sous-la-ligne', 'tout-recuperer',
--      'les-petits-attendent', 'grenouilles-au-canon'
--    )
--    group by deck_id, source;

delete from public.player_deck_unlocks
where deck_id not in (
  -- Decks d'emprunt (game/cards/decks/borrowed.ts)
  'bec-dans-la-brume',
  'cap-de-fer',
  'le-banc-deborde',
  'grace-sous-pression',
  'a-portee',
  -- Préconstruits (game/cards/decks/precon.ts)
  'dernier-rappel',
  'sous-la-ligne',
  'tout-recuperer',
  'les-petits-attendent',
  'grenouilles-au-canon'
);

-- Les decks système eux-mêmes sont reposés par `npm run seed:cards`, qui
-- écrit `system_decks` et `system_deck_cards` depuis `CATALOG_DECKS` —
-- emprunts ET préconstruits désormais, là où le seed ne connaissait que
-- les trois decks de base. Les anciennes lignes, elles, ne gênent pas :
-- rien ne les lit plus.
