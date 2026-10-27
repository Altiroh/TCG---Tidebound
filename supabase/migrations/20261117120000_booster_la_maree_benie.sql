-- ======================================================================
-- B9 — La Marée Bénie (Lot 20 — Les Bienfaits du Fond, Lot 21 — L'Équipage Félin)
-- ======================================================================
-- Neuvième booster achetable : les 66 cartes des Lots 20 et 21, plus leurs
-- deux variantes Abyssales (Le Grand-Bienfaiteur, Amiral Griffenoire).
--
-- Prix : 150 Tides, comme les autres extensions.
--
-- Le POOL n'est pas écrit ici : `booster_pool_cards` est alimenté par
-- `npm run seed:cards` depuis `game/boosters/pools.ts`. Lancer le seed
-- APRÈS cette migration, sinon le booster est achetable avec un pool vide.

insert into public.booster_definitions (id, name, card_count, price_currency, is_purchasable, is_enabled) values
  ('la-maree-benie', 'La Marée Bénie', 8, 150, true, true)
on conflict (id) do update set
  name = excluded.name,
  card_count = excluded.card_count,
  price_currency = excluded.price_currency,
  is_purchasable = excluded.is_purchasable,
  is_enabled = excluded.is_enabled;

-- Format des extensions : 8 cartes, slots 1-4 Commune, 5-6 Peu commune,
-- 7 « Rare ou mieux » pondéré, 8 slot Profondeur avec son pity Abyssal.
delete from public.booster_slots where booster_definition_id = 'la-maree-benie';

insert into public.booster_slots (booster_definition_id, slot_index, guaranteed_rarity, weighted_rarities) values
  ('la-maree-benie', 1, 'common', null),
  ('la-maree-benie', 2, 'common', null),
  ('la-maree-benie', 3, 'common', null),
  ('la-maree-benie', 4, 'common', null),
  ('la-maree-benie', 5, 'uncommon', null),
  ('la-maree-benie', 6, 'uncommon', null),
  ('la-maree-benie', 7, null, '{"rare": 85, "epic": 12, "legendary": 3}'::jsonb),
  ('la-maree-benie', 8, null, '{"uncommon": 55, "rare": 35, "abyssal": 10}'::jsonb);
