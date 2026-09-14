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
| `animations/water-change/` | Animation de changement d'Eaux |
| `animations/tide-change/` | Animation de changement de Marée |
| `fx/structure-visibility/` | Visualisation des Structures invisibles / réémergentes |
| `fx/triggered-effects/` | Représentation des effets déclenchés, activations d'Objets, fenêtres de résolution |
| `fx/ocean-judgment/` | Effets du Jugement de l'Océan |
| `menu/` | Écran d'accueil / menu principal — fond, logo, icônes de navigation (pas de spéc Notion dédiée, voir `menu/README.md`) |

Chaque sous-dossier a son propre `README.md` avec le détail de la charte
qui s'y applique.

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
victory-text.webp              # bandeau VICTOIRE (fourni)
defeat-text.webp               # bandeau DÉFAITE  (attendu)
ships/ship-frame-victory.webp  # cadre du Navire vainqueur (fourni)
ships/ship-frame-defeat.webp   # cadre du Navire vaincu    (attendu)
```

Les deux cadres partagent le même gabarit (`1161 × 1354`, fenêtre en arche
mesurée dans `features/match/MatchEndScreen.tsx`) : un cadre de défaite aux
mêmes proportions se substitue sans retouche de code. Tant qu'un de ces
fichiers manque, l'écran le remplace par un titre en toutes lettres plutôt
que par une image cassée.
