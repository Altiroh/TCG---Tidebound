-- ======================================================================
-- B7 — La mutation mondiale (Lot 16 — Les Altérés)
-- ======================================================================
-- Septième booster achetable : l'extension des Altérés et de leur Éveil
-- (Notion « Boosters & économie de collection » § Booster 4, nommé
-- « Altérations du Large » avant son nom définitif). Rien de neuf dans le
-- SCHÉMA : une définition de plus et ses huit slots, au format verrouillé.
--
-- Prix : 150 Tides, comme Éclats en Selle — Notion le laisse « à calibrer
-- avec l'économie générale ». À revoir à la passe économique.
--
-- Le POOL n'est pas écrit ici : `booster_pool_cards` est alimenté par
-- `npm run seed:cards` depuis `game/boosters/pools.ts`, seule source
-- versionnée. Lancer le seed APRÈS cette migration, sinon le booster est
-- achetable avec un pool vide — il consommerait les Tides du joueur sans
-- rien lui rendre (cf. la vue `booster_pool_health`).

insert into public.booster_definitions (id, name, card_count, price_currency, is_purchasable, is_enabled) values
  ('la-mutation-mondiale', 'La mutation mondiale', 8, 150, true, true)
on conflict (id) do update set
  name = excluded.name,
  card_count = excluded.card_count,
  price_currency = excluded.price_currency,
  is_purchasable = excluded.is_purchasable,
  is_enabled = excluded.is_enabled;

-- Même format que les autres extensions : 8 cartes, slots 1-4 Commune,
-- 5-6 Peu commune, 7 « Rare ou mieux » pondéré, 8 slot Profondeur avec son
-- pity Abyssal. Ses Abyssales : les variantes de La Chute de l'Ange et du
-- Diable en Personne (L'Anomalie Première plafonne à Légendaire, règle du
-- 16/09/2026).
delete from public.booster_slots where booster_definition_id = 'la-mutation-mondiale';

insert into public.booster_slots (booster_definition_id, slot_index, guaranteed_rarity, weighted_rarities) values
  ('la-mutation-mondiale', 1, 'common', null),
  ('la-mutation-mondiale', 2, 'common', null),
  ('la-mutation-mondiale', 3, 'common', null),
  ('la-mutation-mondiale', 4, 'common', null),
  ('la-mutation-mondiale', 5, 'uncommon', null),
  ('la-mutation-mondiale', 6, 'uncommon', null),
  ('la-mutation-mondiale', 7, null, '{"rare": 85, "epic": 12, "legendary": 3}'::jsonb),
  ('la-mutation-mondiale', 8, null, '{"uncommon": 55, "rare": 35, "abyssal": 10}'::jsonb);
