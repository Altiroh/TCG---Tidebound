-- ======================================================================
-- B8 — nom définitif : « Perturbation dimensionnelle » (06/10/2026)
-- ======================================================================
-- Le booster du Lot 17 était créé sous un nom provisoire (« Le Donjon et
-- l'Opale »). Ses planches de sachet portent son vrai nom. Sans effet si la
-- migration 20261026120000 est appliquée APRÈS sa correction : la mise à
-- jour est idempotente.

update public.booster_definitions
set name = 'Perturbation dimensionnelle'
where id = 'dungeon-et-ladalle';
