-- ======================================================================
-- B8 — Perturbation dimensionnelle (Lot 17 — Dungeon et Ladalle / Opalins)
-- ======================================================================
-- Huitième booster achetable : les 63 cartes du Lot 17. Nom repris des
-- planches du sachet (06/10/2026) ; l'identifiant de lancement est resté.
--
-- Prix : 150 Tides, comme les autres extensions. À revoir à la passe
-- économique.
--
-- Le POOL n'est pas écrit ici : `booster_pool_cards` est alimenté par
-- `npm run seed:cards` depuis `game/boosters/pools.ts`. Lancer le seed
-- APRÈS cette migration, sinon le booster est achetable avec un pool vide.

insert into public.booster_definitions (id, name, card_count, price_currency, is_purchasable, is_enabled) values
  ('dungeon-et-ladalle', 'Perturbation dimensionnelle', 8, 150, true, true)
on conflict (id) do update set
  name = excluded.name,
  card_count = excluded.card_count,
  price_currency = excluded.price_currency,
  is_purchasable = excluded.is_purchasable,
  is_enabled = excluded.is_enabled;

-- Format des extensions : 8 cartes, slots 1-4 Commune, 5-6 Peu commune,
-- 7 « Rare ou mieux » pondéré, 8 slot Profondeur avec son pity Abyssal. Son
-- Abyssale : Eidolon Opalin LVX (`eidolon-opalin-lvx-abyssal`).
delete from public.booster_slots where booster_definition_id = 'dungeon-et-ladalle';

insert into public.booster_slots (booster_definition_id, slot_index, guaranteed_rarity, weighted_rarities) values
  ('dungeon-et-ladalle', 1, 'common', null),
  ('dungeon-et-ladalle', 2, 'common', null),
  ('dungeon-et-ladalle', 3, 'common', null),
  ('dungeon-et-ladalle', 4, 'common', null),
  ('dungeon-et-ladalle', 5, 'uncommon', null),
  ('dungeon-et-ladalle', 6, 'uncommon', null),
  ('dungeon-et-ladalle', 7, null, '{"rare": 85, "epic": 12, "legendary": 3}'::jsonb),
  ('dungeon-et-ladalle', 8, null, '{"uncommon": 55, "rare": 35, "abyssal": 10}'::jsonb);
