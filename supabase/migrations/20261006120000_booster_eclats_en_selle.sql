-- ======================================================================
-- B6 — Éclats en Selle (Lot 15)
-- ======================================================================
-- Sixième booster achetable : une extension à trois familles — Équipage
-- de Verre, Cavalerie, Sentinelles Chromatiques. Rien de neuf dans le
-- SCHÉMA : une définition de plus et ses huit slots, au format verrouillé
-- par le cadrage (« Boosters & économie de collection »).
--
-- Prix : 150 Tides, `BOOSTER_SPECIALIZED_PRICE` — le prix des boosters
-- spécialisés, et celui que la page Notion du lot envisage (« à confirmer
-- lors de la passe économique finale »).
--
-- Le POOL n'est pas écrit ici : `booster_pool_cards` est alimenté par
-- `npm run seed:cards` depuis `game/boosters/pools.ts`, seule source
-- versionnée. Lancer le seed APRÈS cette migration, sinon le booster est
-- achetable avec un pool vide — il consommerait les Tides du joueur sans
-- rien lui rendre (cf. la vue `booster_pool_health`).

insert into public.booster_definitions (id, name, card_count, price_currency, is_purchasable, is_enabled) values
  ('eclats-en-selle', 'Éclats en Selle', 8, 150, true, true)
on conflict (id) do update set
  name = excluded.name,
  card_count = excluded.card_count,
  price_currency = excluded.price_currency,
  is_purchasable = excluded.is_purchasable,
  is_enabled = excluded.is_enabled;

-- Même format que les autres extensions : 8 cartes, slots 1-4 Commune,
-- 5-6 Peu commune, 7 « Rare ou mieux » pondéré, 8 slot Profondeur avec son
-- pity Abyssal. Le lot n'a pas de Légendaire : le tirage se replie sur le
-- palier peuplé le plus proche, comme pour tout palier vide.
delete from public.booster_slots where booster_definition_id = 'eclats-en-selle';

insert into public.booster_slots (booster_definition_id, slot_index, guaranteed_rarity, weighted_rarities) values
  ('eclats-en-selle', 1, 'common', null),
  ('eclats-en-selle', 2, 'common', null),
  ('eclats-en-selle', 3, 'common', null),
  ('eclats-en-selle', 4, 'common', null),
  ('eclats-en-selle', 5, 'uncommon', null),
  ('eclats-en-selle', 6, 'uncommon', null),
  ('eclats-en-selle', 7, null, '{"rare": 85, "epic": 12, "legendary": 3}'::jsonb),
  ('eclats-en-selle', 8, null, '{"uncommon": 55, "rare": 35, "abyssal": 10}'::jsonb);
