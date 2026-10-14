-- ═══════════════════════════════════════════════════════════════════════
-- COURRIER : LA MINIATURE EST UNE ILLUSTRATION DU JEU (14/10/2026)
--
-- La miniature d'un courrier se choisit parmi les illustrations des cartes
-- (retour du 14/10/2026) : la colonne garde une RÉFÉRENCE `card:<id>`, pas
-- une image. Les images encodées (data URL) restent acceptées pour les
-- courriers déjà écrits.
--
-- Idempotent : rejouable sans risque.
-- ═══════════════════════════════════════════════════════════════════════

alter table public.mails drop constraint if exists mails_thumbnail_check;
alter table public.mails add constraint mails_thumbnail_check check (
  thumbnail is null
  or thumbnail ~ '^card:[a-z0-9-]{1,80}$'
  or (thumbnail like 'data:image/%' and char_length(thumbnail) <= 300000)
);
