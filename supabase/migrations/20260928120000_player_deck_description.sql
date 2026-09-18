-- ======================================================================
-- UNE DESCRIPTION POUR LES DECKS DU JOUEUR
-- ======================================================================
-- La fiche de deck, à l'écran Jouer, montre désormais pour un deck monté
-- par le joueur ce qu'elle montrait déjà pour les listes du jeu : son rôle,
-- sa taille, sa difficulté et ses mécaniques. Trois de ces quatre se
-- DÉDUISENT de la composition (`game/cards/decks/deckProfile.ts`) et n'ont
-- donc rien à stocker.
--
-- Le quatrième, non. Une phrase qui dit ce que le deck cherche à faire ne
-- se calcule pas : jusqu'ici la fiche affichait « Deck personnel », écrit
-- en dur dans `listPlayerDeckLists`. D'où cette colonne, et rien de plus.
--
-- Facultative à dessein. Un deck sans description retombe sur la phrase
-- générique : on n'a pas durci la création au point d'empêcher de
-- sauvegarder une liste qu'on vient de monter et qu'on n'a pas encore
-- nommée dans sa tête.

alter table public.player_decks
  add column if not exists description text;

comment on column public.player_decks.description is
  'Résumé libre écrit par le joueur, affiché sur la fiche de deck. NULL = repli générique côté application.';
