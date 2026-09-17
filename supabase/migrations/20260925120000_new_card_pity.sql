-- Garantie de NOUVEAUTÉ à l'ouverture d'un booster (décision du 17/09/2026).
--
-- La préférence pour les cartes manquantes ne joue qu'à l'intérieur de la
-- rareté tirée (`game/boosters/draw.ts`, protection Abyssale). Quand tout ce
-- qui reste à trouver est de haute rareté, un joueur peut enchaîner des
-- dizaines de boosters sans rien découvrir : mesuré en test, 40 boosters
-- ouverts avec 38 cartes sur 50 possédées n'ont rendu que 2 nouveautés.
--
-- Ce compteur, par joueur ET par type de booster comme celui de l'Abyssale,
-- permet au tirage de garantir une carte encore absente de la collection
-- (`PITY.newCardGuaranteeAfterPacks`).
alter table public.player_pity
  add column if not exists packs_since_new_card integer not null default 0;

comment on column public.player_pity.packs_since_new_card is
  'Boosters de ce type ouverts d''affilée sans la moindre carte nouvelle. Remis à 0 dès qu''une nouveauté tombe ; au-delà du seuil, le tirage en garantit une.';
