-- ======================================================================
-- LE PROFIL D'UN DECK DU JOUEUR : déduit par défaut, corrigible à la main
-- ======================================================================
-- Un deck monté par le joueur affiche désormais la même fiche qu'une liste
-- du jeu : type de jeu, difficulté, mécaniques. Les trois se DÉDUISENT de
-- la composition (`game/cards/decks/deckProfile.ts`) et n'ont, à ce titre,
-- rien à stocker — c'est ce qui permet aux decks déjà montés d'en profiter
-- sans que personne ne saisisse quoi que ce soit.
--
-- Mais une déduction se trompe. Une courbe basse ressemble à de
-- l'agression même quand le joueur a monté un combo, et lui seul le sait.
-- D'où ces trois colonnes : NULL = « laisse le jeu deviner », renseigné =
-- « c'est moi qui le dis, ne recalcule plus ».
--
-- LE TYPE EST UNE ÉNUMÉRATION, pas du texte libre : deux joueurs qui
-- écrivent « aggro » et « Agressif » ne se retrouveraient jamais dans le
-- même filtre. Les valeurs sont exactement les identifiants de
-- `game/cards/decks/deckStyles.ts` — on en AJOUTE (`alter type … add
-- value`), on n'en renomme jamais : des lignes les portent.

do $$
begin
  if not exists (select 1 from pg_type where typname = 'deck_style') then
    create type public.deck_style as enum (
      'agressif',
      'tempo',
      'midrange',
      'controle',
      'defensif',
      'combo'
    );
  end if;
end
$$;

alter table public.player_decks
  add column if not exists style public.deck_style,
  -- Même échelle que les listes du jeu (`DeckDifficulty`, 1 à 5).
  add column if not exists difficulty smallint,
  -- Deux à quatre entrées courtes, comme les `mechanics` du catalogue. Le
  -- tableau vide est une réponse : « ce deck n'a pas de mécanique à
  -- annoncer » ne se dit pas avec NULL, qui veut dire « devine ».
  add column if not exists mechanics text[];

alter table public.player_decks
  drop constraint if exists player_decks_difficulty_range;

alter table public.player_decks
  add constraint player_decks_difficulty_range
  check (difficulty is null or (difficulty between 1 and 5));

comment on column public.player_decks.style is
  'Type de jeu CHOISI par le joueur (énumération deck_style). NULL = déduit de la composition par deckProfile().';
comment on column public.player_decks.difficulty is
  'Difficulté CHOISIE par le joueur, de 1 à 5. NULL = déduite de la composition.';
comment on column public.player_decks.mechanics is
  'Mécaniques ÉCRITES par le joueur. NULL = déduites de la composition ; tableau vide = aucune à annoncer.';
