-- ======================================================================
-- B5 — Nécessaire du Marin (Lot 14)
-- ======================================================================
-- Cinquième booster achetable, et le premier qui ne soit pas une
-- extension : un booster de CONSOLIDATION. Rien de neuf dans le SCHÉMA —
-- une définition de plus et ses slots, au format verrouillé par le cadrage
-- (« Boosters & économie de collection »).
--
-- Prix : 100 Tides, soit `BOOSTER_STANDARD_PRICE` — le prix du booster
-- d'entrée, et non les 150 des boosters spécialisés. C'est cohérent avec
-- ce qu'il est : le pool que tout le monde doit pouvoir s'offrir, entre le
-- Standard (découverte) et les extensions (collection).
--
-- SIX cartes et non huit, contrairement aux quatre autres. Le format des
-- slots s'adapte sans que rien d'autre ne bouge : le tirage lit les lignes
-- de `booster_slots`, il ne présume nulle part d'un nombre.
--
-- Le POOL n'est pas écrit ici : `booster_pool_cards` est alimenté par
-- `npm run seed:cards` depuis `game/boosters/pools.ts`, seule source
-- versionnée. Lancer le seed APRÈS cette migration, sinon le booster est
-- achetable avec un pool vide — il consommerait les Tides du joueur sans
-- rien lui rendre (cf. la vue `booster_pool_health`).

insert into public.booster_definitions (id, name, card_count, price_currency, is_purchasable, is_enabled) values
  ('necessaire-du-marin', 'Nécessaire du Marin', 6, 100, true, true)
on conflict (id) do update set
  name = excluded.name,
  card_count = excluded.card_count,
  price_currency = excluded.price_currency,
  is_purchasable = excluded.is_purchasable,
  is_enabled = excluded.is_enabled;

-- Six slots, calibrés pour qu'une ouverture serve VRAIMENT au deckbuilding
-- plutôt que de rendre six cartes de la même famille :
--
--   1-2  Commune      — les outils qu'on veut en trois exemplaires
--   3-4  Peu commune  — le gros du lot (18 des 47 cartes)
--   5    « Rare ou mieux », pondéré comme le slot 7 des autres boosters,
--        sans quoi Épique et Légendaire ne tomberaient nulle part
--   6    Slot Profondeur, avec son pity Abyssal — mêmes poids partout
--
-- Le moteur ne sait PAS pondérer par famille fonctionnelle (piège, removal,
-- pioche…) : ses slots raisonnent en RARETÉ, pas en rôle. La diversité est
-- donc obtenue par la composition du pool — la rareté d'une carte y suit ce
-- qu'elle verrouille, et chaque famille est représentée à chaque palier —
-- et non par une mécanique de slots spécifique à ce booster.
delete from public.booster_slots where booster_definition_id = 'necessaire-du-marin';

insert into public.booster_slots (booster_definition_id, slot_index, guaranteed_rarity, weighted_rarities) values
  ('necessaire-du-marin', 1, 'common', null),
  ('necessaire-du-marin', 2, 'common', null),
  ('necessaire-du-marin', 3, 'uncommon', null),
  ('necessaire-du-marin', 4, 'uncommon', null),
  ('necessaire-du-marin', 5, null, '{"rare": 85, "epic": 12, "legendary": 3}'::jsonb),
  ('necessaire-du-marin', 6, null, '{"uncommon": 55, "rare": 35, "abyssal": 10}'::jsonb);
