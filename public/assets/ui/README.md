# Interface partagée — le catalogue

Les pièces d'interface que PLUSIEURS écrans emploient, ou qu'un écran neuf
devrait reprendre avant d'en faire peindre une nouvelle (audit du
26/09/2026).

**Règle de rangement.** Une pièce générique (bouton, flèche, plaque, bandeau,
champ, panneau, accessoire de table, fond) vit ici, par famille. Ce qui
n'appartient qu'à une composition (un fond d'écran précis, un bouton au
texte peint comme « Changer de navire », une fiche à fenêtre d'illustration)
reste dans le dossier de son écran. Un asset d'écran qui sert ailleurs
remonte ici, et ses références suivent dans le même commit.

Tous les fichiers sont rognés au plus près de leur opaque : `100% 100%`
étire la pièce dans sa boîte, `contain` la garde entière.

## Boutons — `boutons/`

| Fichier | Taille | Pièce | Employée par |
| --- | --- | --- | --- |
| `plaque-bois.webp` | 720 × 170 | Plaque de bois ferrée, laiton aux bouts | Collectables (Équiper, Acheter) |
| `plaque-sombre.webp` | 640 × 213 | Plaque sombre à liseré de laiton | Écran de fin (Retour) |
| `plaque-bleue.webp` | 640 × 213 | Même plaque, bleu nuit à liseré cyan : l'action principale | Écran de fin (Nouvelle partie) |
| `rond-plus.webp`, `rond-moins.webp` | 256 × 254 | Hublots de laiton + / − | Éditeur de deck (quantité) |

Plaques de bouton : le texte se pose DESSUS, la plaque en `::before` pour
pouvoir la ternir (état éteint) sans ternir le texte — cf. `.action` dans
`features/cosmetics/Collectables.module.css`.

## Flèches — `fleches/`

| Fichier | Taille | Pièce | Employée par |
| --- | --- | --- | --- |
| `fleche.webp` | 300 × 471 | Flèche de laiton sur bois, pointe à GAUCHE ; `scaleX(-1)` pour la suivante | Table des Decks, Collectables |

## Plaques et bandeaux — `plaques/`, `bandeaux/`

| Fichier | Taille | Pièce | Employée par |
| --- | --- | --- | --- |
| `plaques/plaque-rivets.webp` | 994 × 243 | Plaque sombre à embouts de laiton | Éditeur, table des Decks |
| `plaques/plaque-nom.webp` | 720 × 148 | Étiquette de parchemin cerclée : un nom | Collectables |
| `plaques/onglet.webp` | 900 × 162 | Bande de parchemin déchirée : onglet, tri, compteur | Éditeur, table des Decks |
| `bandeaux/bandeau-parchemin.webp` | 1800 × 269 | Long bandeau de parchemin déchiré (s'étire en largeur) | Collectables |
| `bandeaux/banderole.webp` | 900 × 249 | Banderole à pans roulés : un titre | Table des Decks |

## Champs — `champs/`

| Fichier | Taille | Pièce | Employée par |
| --- | --- | --- | --- |
| `recherche.webp` | 900 × 162 | Barre sombre, loupe peinte à gauche | Éditeur, table des Decks |
| `recherche-rivets.webp` | 1600 × 298 | Barre de bois rivetée ; découpe en 9 horizontale (le milieu s'étire) | Éditeur, Collection (`BookSearch`) |
| `loupe.webp` | 256 × 238 | Loupe de laiton, à poser dans le creux de la barre | Éditeur, Collection |

## Panneaux — `panneaux/`

| Fichier | Taille | Pièce | Employée par |
| --- | --- | --- | --- |
| `panneau-sombre.webp` | 570 × 211 | Panneau bleu nuit à fin liseré | Profil, Éditeur |
| `panneau-parchemin.webp` | 525 × 254 | Parchemin encadré, rose des vents en filigrane | Profil |
| `fiche-epinglee.webp` | 589 × 900 | Fiche de parchemin épinglée (l'épingle : 6,6 % du haut) | Collectables |

## Icônes — `icons/`

| Fichier | Taille | Pièce | Employée par |
| --- | --- | --- | --- |
| `tides.webp` | 256 × 256 | Pièce de Tides | `GameIcons.tsx` (`TideCoin`) |
| `precon-token.webp` | 256 × 256 | Jeton de Préconstruit | `GameIcons.tsx` (`PreconToken`) |
| `losange.webp` | 331 × 327 | Losange sombre à filets d'or : une ressource, un raccourci | Profil, raccourcis de récompense |

## Accessoires de table — `accessoires/`

Objets posés SUR la table, en pleine opacité, jamais cliquables.

| Fichier | Taille | Pièce | Employée par |
| --- | --- | --- | --- |
| `bougie.webp` | 420 × 514 | Bougie allumée | Collection, Éditeur, table des Decks |
| `tasse-cafe.webp` | 1207 × 1143 | Tasse de café (le café est une ellipse mesurée, cf. `MenuCarte.module.css`) | Accueil, Collection, Éditeur |
| `longue-vue.webp` | 1072 × 207 | Longue-vue, pièces, gemmes et carte roulée | Collection, Éditeur |

## Fonds — `fonds/`

| Fichier | Taille | Pièce | Employée par |
| --- | --- | --- | --- |
| `carte-marine.webp` | 1600 × 900 | La table de bois et sa carte marine punaisée | Accueil, Éditeur (tiroir), Collectables |
| `carte-marine-flou.webp` | 96 × 54 | Son aperçu flou, affiché le temps du chargement | Accueil |

## Déjà rangés ici avant l'audit

- `decor/` — ornements ATTÉNUÉS posés derrière un panneau (tentacules
  abyssales), avec leurs règles d'opacité : voir `decor/README.md`.
- `card-board/` — la jauge de Raison et le soulignement des cartes.
- `transitions/` — l'ombre portée des changements d'écran.
- `blue-`, `red-`, `yellow-dammage.webp` — plaques de dégâts du plateau.

## Génériques, mais encore propres à un écran

Pièces qui feraient de bonnes candidates au prochain réemploi — à remonter
ici le jour où un second écran les prend :

- `collectables/decor-gauche.webp`, `collectables/decor-droite.webp` —
  décors de bord d'écran (boussole et gemmes ; lanterne et cartes).
- `menu/carte/left-asset.webp`, `menu/carte/right-asset.webp` — les
  décors de bord de l'accueil.
- `decks/liste/fiche.webp` (+ `fiche-corde.webp`) — fiche de parchemin à
  fenêtre d'illustration.
- `decks/liste/icone-*.webp` — étoile (favoris), piles, sablier : le jeu
  d'icônes des onglets des Decks ; l'étoile sert aussi aux raccourcis.
- `rewards/panel.webp`, `rewards/palier.webp`, `market/side-panel.webp`,
  `market/cart-frame.webp` — panneaux du hub et du Market.
