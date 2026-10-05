-- ======================================================================
-- Type de carte LANDE (05/10/2026)
-- ======================================================================
-- Nouveau type : une carte qui se pose dans l'emplacement PARTAGÉ du
-- centre du plateau et change les règles de la partie pour les deux
-- joueurs, le temps de sa durée (`game/rules/lande.ts`). Trois premières
-- Landes, Légendaires : Pluie corrosive (Booster Défaut), Chaîne de
-- construction (Nécessaire du Marin), Vallée de verre (Éclats en Selle).
--
-- Rien d'autre ne change dans le schéma : leur rareté, leur limite de deck
-- et leur place dans les pools sont écrites par `npm run seed:cards`.
-- Appliquer cette migration AVANT le seed : sans la valeur 'lande' dans
-- l'enum, l'insertion des trois cartes échoue.

alter type public.card_type add value if not exists 'lande';
