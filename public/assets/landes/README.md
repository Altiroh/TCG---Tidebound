# Landes — pièces de scène

Une Lande en jeu habille **tout le plateau** (`features/match/landes/`). Sa
scène se compose, du fond vers l'avant, toujours **sous** les cartes :

1. une teinte d'atmosphère (code) ;
2. un effet animé (code) — pluie acide, pics de verre, chaînes ;
3. des **pièces illustrées** de ce dossier, que l'effet **place lui-même**
   le long des bords, à la taille de l'écran.

Pas de grande image par bord : elle se recadrerait mal d'un écran à
l'autre. Des pièces SÉPARÉES, que le code répartit, dimensionne (selon la
hauteur de l'écran) et anime — grandes aux coins, basses au centre, le
milieu du plateau toujours libre. Tant qu'une pièce manque, le code dessine
la sienne ; il s'efface dès que les fichiers arrivent.

## Sols du Pont du Capitaine

Sur le plateau en plongée (`board/pont/`), une Lande remplace le pont par son
propre SOL, même cadrage : `<id>/pont-sol.webp` (1672 × 941, centre calme,
décor fort au bord). Ses pièces, ses lueurs et ses effets animés sont
déclarés avec le décor (labo : `PONT_LANDE_FLOORS`). Le Donjon ajoute
`cabine.webp` (cliquable : fumée verte) et `panneau.webp` (« SAFE PLACE »).

## Format

- **PNG avec transparence**, déposé ici, puis
  `node scripts/optimizeImages.mjs --delete-sources` (WebP).
- Chaque pièce **seule**, détourée, sans sol, sans mer, sans ombre portée
  (le code en ajoute une).
- Lumière venant du haut.

## `vallee-de-verre/`

| Fichier | Contenu | Taille |
| --- | --- | --- |
| `pic-01.png` … `pic-08.png` | UN pic de verre par fichier, **base sur le bord bas de l'image, pointe en haut**. Varier : fins, larges, grappes de 2-3, un ou deux penchés. Verre clair bleuté, arêtes vives, un reflet. | ~400 × 900 (grands), ~250 × 500 (petits) |
| `eclat-01.png` … `eclat-04.png` | Petits tessons, projetés à chaque tour de table qui s'achève. | ~120 × 120 |
| `fissures.png` *(facultatif)* | Plein cadre, **fond noir** (mode « écran ») : fines fissures blanches partant des bords, centre vide. Allumé un instant à chaque tour de table. | 2560 × 1440 |

Le code fait sortir chaque pic de la mer, pointe la première, et fait
glisser un reflet sur l'ensemble. En haut, les pics sont retournés
(stalactites) : une même pièce sert aux deux bords.

## `chaine-de-construction/`

| Fichier | Contenu | Taille |
| --- | --- | --- |
| `chaine-segment-01.png` … `-03.png` | Un tronçon HORIZONTAL de lourde chaîne rouillée, **qui se raccorde sans couture** à lui-même et aux autres tronçons (bords gauche/droit coupés au milieu d'un maillon). | ~800 × 120 |
| `anneau.png` | Gros anneau ou crochet d'ancrage, vu de face. | ~256 × 256 |
| `cadenas.png` *(facultatif)* | Plein cadre, **fond noir** : gros cadenas rouillé au centre, halo orangé. Allumé un instant à chaque tour de table. | 2560 × 1440 |

Le code tend les tronçons bout à bout en chaînette (au-dessus et au-dessous
du plateau, et dans les coins hauts) et les fait respirer doucement ; ils se
tendent d'un coup aux temps forts.

## `pluie-corrosive/` (facultatif)

La pluie, les impacts et les fumées sont dessinés par le code. Deux calques
de bord peuvent l'enrichir :

| Fichier | Contenu | Taille |
| --- | --- | --- |
| `flaques-bas.png` | Flaques acides verdâtres qui fument, au pied du plateau. | 2560 × 600 |
| `fumees.png` | Plein cadre, **fond noir** : volutes vert-jaune légères. | 2560 × 1440 |

## `le-donjon-de-ladalle/`

Pièces isométriques **posées entières** autour du plateau (`LandeProps`,
déclarées dans `landeScenes.ts` → `props`) : pied au bas de l'image, fond
transparent. Chacune sort du sol à l'arrivée de la Lande, dans un
grondement, et garde son ombre au sol.

| Fichier | Zone voulue | Particularité |
| --- | --- | --- |
| `arche.png` | bande de mer, à gauche | lanterne : halo cliquable |
| `etal.png` | bureau, à gauche | lanterne : halo cliquable |
| `latrines.png` | bureau, à droite | fumée verte nauséabonde |
| `mur-fenetre.png` | ciel, à gauche | fenêtre éclairée : halo cliquable |
| `mur-echelle.png` | ciel, à gauche du centre | — |
| `mur-torche.png` | ciel, à droite | torche : halo cliquable |

La position est une INTENTION : `LandeProps` cherche autour la plus grande
place libre et ne recouvre JAMAIS l'interface (rangées, colonne de droite,
mains, piste et tuile de Marée, hublots, boutons — tout élément marqué
`data-ui-obstacle`). Sans place, la pièce n'est pas posée. Chaque pièce
regarde le jeu (miroir à gauche du plateau, léger pivot) et s'éclaire du
côté de la lanterne du décor la plus proche ; son ombre part à l'opposé.

Une nouvelle pièce : la déposer ici, l'ajouter à `props` avec sa zone, sa
position et, s'il y a lieu, ses points de lumière (fractions de l'image).

