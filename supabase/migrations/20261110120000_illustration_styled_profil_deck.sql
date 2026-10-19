-- ═══════════════════════════════════════════════════════════════════════
-- ILLUSTRATION STYLED du profil et des decks (19/10/2026)
--
-- Le profil et la plaque d'un deck montraient toujours l'illustration
-- CLASSIQUE de leur carte. Un joueur qui a obtenu la Styled d'une carte —
-- ou sa Full-Art, qui la débloque aussi — peut désormais la choisir.
--
--  1. `profiles.avatar_artwork` : l'illustration de l'avatar.
--  2. `player_decks.art_artwork` : l'illustration de la plaque du deck.
--
-- Deux valeurs seulement : 'classique' et 'styled'. La Full-Art n'y figure
-- pas — son texte est peint dans l'image, illisible en vignette.
--
-- Écriture par le SERVEUR (service_role), qui vérifie la possession dans
-- `player_card_editions`. Le code tolère l'absence de cette migration : il
-- retombe alors sur la Classique.
-- Entièrement idempotente : rejouable sans risque.
-- ═══════════════════════════════════════════════════════════════════════

alter table public.profiles
  add column if not exists avatar_artwork text not null default 'classique';

alter table public.player_decks
  add column if not exists art_artwork text not null default 'classique';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_avatar_artwork_check') then
    alter table public.profiles
      add constraint profiles_avatar_artwork_check check (avatar_artwork in ('classique', 'styled'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'player_decks_art_artwork_check') then
    alter table public.player_decks
      add constraint player_decks_art_artwork_check check (art_artwork in ('classique', 'styled'));
  end if;
end $$;
