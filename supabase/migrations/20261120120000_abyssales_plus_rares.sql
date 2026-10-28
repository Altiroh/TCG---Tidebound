-- ======================================================================
-- ABYSSALES PLUS RARES QUE LES LÉGENDAIRES (28/10/2026)
-- ======================================================================
--
-- ENTIÈREMENT REJOUABLE. À appliquer à la main, AVANT de pousser le code
-- (`game/boosters/constants.ts` : garantie relevée de 20 à 80 boosters).
--
-- Décision du propriétaire : « les Abyssales doivent être plus rares ».
-- Le slot Profondeur (dernière case de chaque booster) passait 10 %
-- d'Abyssale ; il en passe 1 %. Peu commune et Rare gardent leur rapport
-- (55 / 35 → 121 / 77 sur 200). Avec la garantie, relevée en même temps
-- dans le code (montée après 50 boosters sans Abyssale, garantie au 80e),
-- une Abyssale sort tous les ~43 boosters en moyenne, contre ~8 avant ;
-- une Légendaire, tous les ~33 (case 7, inchangée).
--
-- Seuls les slots qui déclaraient l'ancien poids sont touchés : un slot
-- réglé autrement depuis n'est pas écrasé.
update public.booster_slots
set weighted_rarities = '{"uncommon": 121, "rare": 77, "abyssal": 2}'::jsonb
where weighted_rarities = '{"uncommon": 55, "rare": 35, "abyssal": 10}'::jsonb;
