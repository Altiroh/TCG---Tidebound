# Plateau de jeu

Le rendu du plateau, partagé par les trois écrans qui en affichent un :

| Écran | Composant | Source de l'état |
| --- | --- | --- |
| Partie locale (hot-seat, bot) | `features/match/MatchBoard.tsx` | moteur, dans le navigateur |
| Partie arbitrée (PvP, bot serveur) | `features/online/OnlineBoard.tsx` | serveur |
| Laboratoire de layout | `features/board-preview/` | données factices |

`TableBoard` ne connaît **aucune règle d'action** : il décide quels gestes
sont possibles et remonte des intentions (poser, attaquer, saborder…). C'est
le conteneur qui les soumet à `dispatch`.

## Sens des dépendances

Le laboratoire (`features/board-preview/`) importe **d'ici**, jamais
l'inverse. Ça n'a pas toujours été le cas : le plateau des vraies parties a
d'abord été construit en réutilisant les composants du bac à sable, et
importait donc 21 de ses modules — bricoler le laboratoire cassait les
parties. Les composants de rendu ont été ramenés ici, le laboratoire ne
garde que ce qui lui est propre (jeu de données factice, réglages de debug,
zoom de carte).

`tableModel.ts` porte le modèle de vue (`TableCardModel`, `TableTideModel`,
`BOARD_CAPACITY`) : il vivait dans le fichier de données factices, ce qui
faisait dépendre les vraies parties d'un fichier de bouchons.
