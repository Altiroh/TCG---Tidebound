# Bibliothèque visuelle

Arborescence des assets graphiques de Tidebound, telle que verrouillée sur
Notion ("Bibliothèque visuelle — cohérence verrouillée", section "Assets à
prévoir"). Aucun visuel définitif n'est encore produit — cette structure
documente où chaque catégorie doit atterrir une fois créée, avec la charte
applicable, pour que la génération d'assets puisse commencer sans avoir à
redécider de l'organisation.

Direction artistique verrouillée (résumé — voir Notion pour le détail
complet) : maritime sombre, picturale, lisible, inspirée de Dredge sans
reproduire ses assets ni son branding. Palette dominante bleu nuit / bleu
pétrole / turquoise désaturé / gris ardoise / blanc écume ; tons chauds
(orange, rouge, jaune) réservés aux points de contraste (explosions,
lanternes, incendies, couchers de soleil). Fantastique marin et crédible :
pas de fantasy générique, pas de steampunk, pas de symboles occultes
gratuits.

## Structure

| Dossier | Contenu |
| --- | --- |
| `board/` | Board principal + variantes visuelles par Eaux + états visuels Calme/Houle/Tempête/Abysses |
| `cards/<type>/` | Image **finie** de chaque carte, rangée par `CardType` — cadre + illustration + texte + stats déjà composités (une par `cardId`, voir `game/cards/sets/core.ts`) |
| `cards/icons/` | Icônes mécaniques : Ancrage, Raison, Puissance, Résistance, Garde, Sabordage, etc. |
| `ships/` | Cadre Navire + médaillons (Ancrage, Raison) + illustrations des Navires |
| `ships/frames/` | Cadres de Navire **cosmétiques** (`game/cosmetics/shipFrames.ts`) — même gabarit que `ship-frame-empty.webp`, un fichier par skin |
| `ui/icons/` | Icônes d'interface récurrentes : `tides.webp` (la monnaie), `precon-token.webp` (le Jeton de Préconstruit). Servies par `features/shell/GameIcons.tsx`, jamais en `<img>` recopié |
| `animations/water-change/` | Animation de changement d'Eaux |
| `animations/tide-change/` | Animation de changement de Marée |
| `fx/structure-visibility/` | Visualisation des Structures invisibles / réémergentes |
| `fx/triggered-effects/` | Représentation des effets déclenchés, activations d'Objets, fenêtres de résolution |
| `fx/ocean-judgment/` | Effets du Jugement de l'Océan |
| `board/tide-orientation/` | Les deux faces du sens de la Marée (montante / descendante) |
| `status/` | Icônes d'état posées sur une carte en jeu : Garde, Malade, Silence, Immobilisé, Engourdi, compteur de tours |
| `match-end/` | Bandeaux de fin de partie (victoire / défaite) |
| `menu/` | Écran d'accueil / menu principal — fond, logo, icônes de navigation (pas de spéc Notion dédiée, voir `menu/README.md`) |
| `play/bot-difficulty/` | Emblèmes des trois difficultés du bot, sur l'écran « Jouer » — un fichier par valeur de `BotDifficulty` |
| `ui/transitions/` | Transitions d'écran : `ombre-portee.webp`, l'ombre qui balaie l'écran au changement de page (`features/shell/PageTransition.tsx`) |
| `ui/decor/` | Décors d'interface hors plateau — habillages posés derrière une fenêtre ou un panneau, jamais au premier plan (voir `ui/decor/README.md`) |

Chaque sous-dossier a son propre `README.md` avec le détail de la charte
qui s'y applique.

## Nommage : kebab-case, sans préfixe redondant

Un seul style pour tout le dossier : **minuscules, mots séparés par des
tirets**, pas d'underscore, pas de majuscules. Le dossier porte déjà le
contexte — un fichier de `collection/` n'a pas à s'appeler
`collection_background_3` mais `background-3`.

Quatre conventions coexistaient (`FRAME_STANDARD_NO_STATS.webp`,
`cadre_token.webp`, `effect_garde.webp`, `menu_box_base.webp`), et dix
fichiers traînaient à la racine faute de dossier où les ranger. Quand un
chemin est construit par gabarit (`frames/${famille}-${variante}.webp`),
le nom du fichier suit directement la valeur du code : plus de
`.toUpperCase()` ni de suffixe `_STANDARD` à maintenir des deux côtés.

## Format : WebP obligatoire

Toutes les images de ce dossier sont servies en **WebP**, redimensionnées à
la taille réellement affichée. Les PNG sortis des générateurs pèsent 2 à
3 Mo pièce ; `public/` atteignait 422 Mo, embarqués dans **chaque**
déploiement Vercel — de quoi dépasser le quota de stockage à lui seul.

Après avoir déposé de nouvelles images (PNG ou JPG), lancer :

```
npm run optimize:images                 # convertit, garde les sources
node scripts/optimizeImages.mjs --delete-sources
```

Le script est idempotent et applique une taille maximale par famille
(illustrations 768 px, cadres 1200 px, reste 1280–1600 px). Ne jamais
commiter les PNG/JPG d'origine : l'historique Git les conserve déjà si
besoin.

## Écran de fin de partie

```
match-end/victory.webp         # bandeau VICTOIRE
match-end/defeat.webp          # bandeau DÉFAITE
ships/ship-frame-victory.webp  # cadre du Navire vainqueur
ships/ship-frame-loose.webp    # cadre du Navire vaincu
```

Les deux cadres partagent le même gabarit (fenêtre en arche mesurée dans
`features/match/MatchEndScreen.tsx`) : ils se substituent l'un à l'autre
sans retouche de code. Si l'un venait à manquer, l'écran le remplace par un
titre en toutes lettres plutôt que par une image cassée.
