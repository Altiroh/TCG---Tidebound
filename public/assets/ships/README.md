# Navires

Cadre Navire + médaillons + illustrations, un jeu par Navire verrouillé
(voir `game/environment/shipData.ts` — Le Courlis, L'Errant, Le
Brise-Lames, La Religieuse, Le Goliath).

## Assets validés (statut : validé sur Notion)

- **Cadre Navire — cadre vide** (`ship-frame-empty.webp`) : cadre principal
  vertical, bois vieilli + laiton, cordages, médaillon-compas supérieur,
  zone centrale vide, plaque inférieure vierge. Utilisé sur le plateau de
  partie par `features/match/ShipInstrumentCluster.tsx` (illustration du
  Navire dans la fenêtre en arche, médaillons Ancrage/Raison sur la
  plaque).
- **Cadre Navire — médaillon Ancrage** (`gauge-anchor.webp`) : cercle seul,
  bordure laiton vieillie, intérieur rouge texturé, sans texte ni icône.
- **Cadre Navire — médaillon Raison** (`gauge-reason.webp`) : cercle seul,
  bordure laiton vieillie, intérieur bleu texturé, sans texte ni icône.
- **Cadre Navire — cadre victoire** (`ship-frame-victory.webp`, 1161×1354) :
  variante ornée (couronne, ailes, trésor) du cadre vide, utilisée par
  `features/match/VictoryScreen.tsx` pour présenter le Navire vainqueur en
  fin de partie. Fenêtre en arche (illustration) mesurée à ~17–81 % de
  largeur / ~21–70 % de hauteur ; plaque de nom ~25–75 % / ~72–82 % ; la
  pointe sombre sous la plaque est réservée à un futur badge d'XP.

Ces éléments sont la base modulaire du cadre Navire — valeurs, icônes et
textes se superposent séparément dans l'interface (pas incrustés dans
l'asset).

## Cadres cosmétiques (`frames/`)

Un fichier par skin de cadre, au **même gabarit** que `ship-frame-empty.webp`
(fenêtre verticale + plaque de nom vierge) : ils se substituent au cadre
d'origine sans retouche de code. Le catalogue est
`game/cosmetics/shipFrames.ts` ; le nom du fichier suit l'identifiant du
skin, moins le préfixe `ship-skin-`.

`dispo-bientot.webp` n'est pas un skin : c'est le voile posé sur un
emplacement **caché** de l'écran Collectables (pendant de
`cards/card-back/dispo-bientot.webp`), tant que sa condition n'est pas
remplie.

## Illustrations (`illu/`)

Une image carrée par Navire, référencée par `ShipDefinition.illustration`
(`game/environment/shipData.ts`) : `le-courlis.webp`, `errant.webp`,
`brise-lames.webp`, `la-religieuse.webp`, `goliath.webp`. Utilisées à la fois
sur le plateau de partie (`ShipInstrumentCluster`) et sur l'écran de victoire
(`VictoryScreen`).

## Panneau de capacité (`capacite/`)

Le petit hublot posé sur le cadre, à la place de la rose des vents, pour les
Navires qui portent une capacité activable câblée
(`ShipDefinition.activatableAbility`). Trois pièces, assemblées par
`features/match/table/TableShip.tsx` :

- `cadre.webp` — le hublot de laiton, COMMUN à tous les Navires. Posé
  par-dessus le reste : ses bossages débordent du rond intérieur, mesuré à
  **70 %** du laiton (`.shipAbilityPort`).
- `planches.webp` — le bardage qui ferme le hublot, COMMUN lui aussi. Une
  seule image, affichée deux fois : cadrée sur sa moitié haute pour la
  planche du haut, sur sa moitié basse pour celle du bas. Le bois se
  raccorde donc au milieu, et les deux moitiés s'écartent à l'armement.
- `<navire>.webp` — ce qu'on découvre dessous, PROPRE à la capacité
  (`ShipActivatableAbility.illustration`). Une image carrée ; elle est
  **zoomée** sur son sujet (`--ship-ability-art-zoom` / `-focus`), parce que
  le hublot fait une trentaine de pixels à l'écran et qu'une scène entière
  n'y serait qu'une tache grise.

Placement et taille : `--ship-ability-top` / `-left` / `-size` dans
`features/match/table/Table.module.css`. Le laboratoire `/game/board-preview`
affiche le panneau et bascule ses deux états au clic.
