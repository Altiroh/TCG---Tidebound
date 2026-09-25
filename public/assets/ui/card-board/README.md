# Tuile de plateau (`CardTile variant="board"`)

Habillage des cartes POSÉES sur le plateau : l'illustration plein cadre,
et par-dessus (pas de type : la tuile ne le montre pas), centrés sur le format 5:7 d'une carte :

- `raison.webp` (474 × 809) — indicateur de Raison (bannière), en haut à
  gauche. Le coût est écrit par l'app sur la moitié haute de son panneau
  intérieur. Zone : 26 % × 31,7 % de la carte, à 3 % du bord gauche,
  collée en haut.
- `soulignement.webp` (1316 × 170) — filet à barre posé sous le nom,
  au-dessus de Puissance / Résistance. Zone : 80 % de la largeur, centré.

Découpés dans la planche fournie (`simply-illu.png`), retirée après
conversion — pas de PNG commité. Tant qu'un asset d'ici
manque, `CardTile` dessine un repli CSS à sa place. Les zones exactes :
constantes `BOARD_*_ZONE` de `features/match/CardTile.tsx`.
