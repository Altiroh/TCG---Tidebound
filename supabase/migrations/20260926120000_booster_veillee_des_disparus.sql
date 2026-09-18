-- ======================================================================
-- B4 — La Veillée des Disparus (Lot 13, Un Dead)
-- ======================================================================
-- Quatrième booster achetable. Rien de neuf dans le SCHÉMA : seulement une
-- définition de plus et ses huit slots, au format verrouillé par le cadrage
-- (« Boosters & économie de collection »).
--
-- Prix : 150 Tides, comme les deux autres boosters spécialisés. Ce n'est pas
-- un nombre inventé ici — c'est `BOOSTER_SPECIALIZED_PRICE`
-- (`game/economy/constants.ts`), soit le booster d'entrée à 100 plus le
-- supplément de 50 posé le 16/09/2026 pour un contenu plus spécialisé.
--
-- Le POOL n'est pas écrit ici : `booster_pool_cards` est alimenté par
-- `npm run seed:cards` depuis `game/boosters/pools.ts`, seule source
-- versionnée. Lancer le seed APRÈS cette migration, sinon le booster est
-- achetable avec un pool vide — il consommerait les Tides du joueur sans
-- rien lui rendre (cf. la vue `booster_pool_health`, qui rend le trou
-- visible avant que quelqu'un ne le paie).

insert into public.booster_definitions (id, name, card_count, price_currency, is_purchasable, is_enabled) values
  ('la-veillee-des-disparus', 'La Veillée des Disparus', 8, 150, true, true)
on conflict (id) do update set
  name = excluded.name,
  card_count = excluded.card_count,
  price_currency = excluded.price_currency,
  is_purchasable = excluded.is_purchasable,
  is_enabled = excluded.is_enabled;

-- Même format que les trois autres boosters achetables : 8 cartes, slots
-- 1-4 Commune, 5-6 Peu commune, 7 « Rare ou mieux » (pondéré depuis le
-- Lot 11, sans quoi Épique et Légendaire ne tomberaient nulle part), 8 slot
-- Profondeur avec son pity Abyssal.
delete from public.booster_slots where booster_definition_id = 'la-veillee-des-disparus';

insert into public.booster_slots (booster_definition_id, slot_index, guaranteed_rarity, weighted_rarities) values
  ('la-veillee-des-disparus', 1, 'common', null),
  ('la-veillee-des-disparus', 2, 'common', null),
  ('la-veillee-des-disparus', 3, 'common', null),
  ('la-veillee-des-disparus', 4, 'common', null),
  ('la-veillee-des-disparus', 5, 'uncommon', null),
  ('la-veillee-des-disparus', 6, 'uncommon', null),
  ('la-veillee-des-disparus', 7, null, '{"rare": 85, "epic": 12, "legendary": 3}'::jsonb),
  ('la-veillee-des-disparus', 8, null, '{"uncommon": 55, "rare": 35, "abyssal": 10}'::jsonb);
