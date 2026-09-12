# Navires

Cadre Navire + médaillons + illustrations, un jeu par Navire verrouillé
(voir `game/environment/shipData.ts` — Le Courlis, L'Errant, Le
Brise-Lames, La Religieuse).

## Assets validés (statut : validé sur Notion)

- **Cadre Navire — cadre vide** (`ship-frame-empty.png`) : cadre principal
  vertical, bois vieilli + laiton, cordages, médaillon-compas supérieur,
  zone centrale vide, plaque inférieure vierge. Utilisé sur le plateau de
  partie par `features/match/ShipInstrumentCluster.tsx` (illustration du
  Navire dans la fenêtre en arche, médaillons Ancrage/Raison sur la
  plaque).
- **Cadre Navire — médaillon Ancrage** (`gauge-anchor.png`) : cercle seul,
  bordure laiton vieillie, intérieur rouge texturé, sans texte ni icône.
- **Cadre Navire — médaillon Raison** (`gauge-reason.png`) : cercle seul,
  bordure laiton vieillie, intérieur bleu texturé, sans texte ni icône.
- **Cadre Navire — cadre victoire** (`ship-frame-victory.png`, 1161×1354) :
  variante ornée (couronne, ailes, trésor) du cadre vide, utilisée par
  `features/match/VictoryScreen.tsx` pour présenter le Navire vainqueur en
  fin de partie. Fenêtre en arche (illustration) mesurée à ~17–81 % de
  largeur / ~21–70 % de hauteur ; plaque de nom ~25–75 % / ~72–82 % ; la
  pointe sombre sous la plaque est réservée à un futur badge d'XP.

Ces éléments sont la base modulaire du cadre Navire — valeurs, icônes et
textes se superposent séparément dans l'interface (pas incrustés dans
l'asset).

## Illustrations (`illu/`)

Une image carrée par Navire, référencée par `ShipDefinition.illustration`
(`game/environment/shipData.ts`) : `le-courlis.png`, `errant.png`,
`brise-lames.png`, `la-religieuse.png`. Utilisées à la fois sur le plateau
de partie (`ShipInstrumentCluster`) et sur l'écran de victoire
(`VictoryScreen`).
