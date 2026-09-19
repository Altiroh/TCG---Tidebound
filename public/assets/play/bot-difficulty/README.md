# Difficulté du bot

Les trois emblèmes des cartes-radio de « Jouer → Choisis ton deck »
(`features/match/NewMatchScreen.tsx`). Le nom du fichier suit la valeur de
`BotDifficulty` (`game/bot/types.ts`) : le chemin se construit par gabarit,
rien à maintenir des deux côtés.

Emblèmes détourés sur alpha, halo cyan, affichés à ~44 px — pas des
illustrations : ils se lisent à la taille d'une icône, à côté du mot.

| Fichier | Difficulté |
| --- | --- |
| `facile.webp` | Facile |
| `moyen.webp` | Moyen |
| `difficile.webp` | Difficile |

`facile.webp` et `moyen.webp` sont pour l'instant la MÊME image (le trident) :
les deux sources déposées étaient identiques. L'emblème propre à « Moyen »
reste à produire — il se dépose ici sous ce nom, sans rien changer au code.
