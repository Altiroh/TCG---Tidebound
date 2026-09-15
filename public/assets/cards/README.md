# Cartes

**Nouvelle approche (remplace l'idée d'une image finie par carte, abandonnée
— 80 illustrations cohérentes une par une n'est pas réaliste) :** un cadre
par famille/bloc de stats (pas par type), plus une icône de type superposée
carte par carte. Le nom, le coût, le texte de règles, les statistiques et
l'illustration (si elle existe) sont superposés par l'app à l'affichage —
jamais gravés dans le cadre. C'est `features/match/CardTile.tsx` qui fait
cette composition.

## `frames/` — un cadre par famille × bloc de stats

```
frames/
  standard-no-stats.webp
  standard-resistance.webp
  standard-power-resistance.webp
  abyssal-no-stats.webp
  abyssal-resistance.webp
  abyssal-power-resistance.webp
```

Le cadre ne dépend pas de `CardType` mais de :
- **Famille** — `abyssal` si `subtype: "abyssal"` sur la carte, sinon
  `standard`.
- **Variante de stats** — `power-resistance` (attaque + résistance),
  `resistance` (résistance seule), ou `no-stats` (aucune des deux).

Le chemin se construit directement depuis ces deux valeurs
(`frames/${famille}-${variante}.webp`) : le nom du fichier est exactement
ce que le code calcule, il n'y a rien à transposer.

Le type de carte, lui, n'est plus gravé dans le cadre : voir `icons/` plus
bas. Le cadre doit laisser des zones neutres pour : coût (haut-gauche),
icône de type (haut-droite), illustration (~55 % de la hauteur), nom, bloc
de règles, Puissance/Résistance (bas). Tant qu'un cadre n'existe pas pour
une combinaison famille/variante, l'app retombe sur un rendu HTML/CSS
générique (déjà en place).

## `illustrations/` — optionnel, par carte

```
illustrations/<cardId>.png
```

Ajoutées carte par carte, à votre rythme — voir `game/cards/sets/core.ts`
pour la liste des `cardId`. Tant qu'une illustration n'existe pas pour une
carte, l'app laisse la zone illustration neutre/vide plutôt que d'inventer
un visuel.

### Jetons

Les cartes **jeton** (Péons) ont leur propre dossier, `public/assets/token/`
— voir son README. Leur cadre, lui, vit ici : `frames/token.webp`,
commun à tous les jetons quelle que soit leur famille.

### Calque de débord (`subtype: "abyssal"` uniquement)

```
illustrations/<cardId>-debord.webp
```

Optionnel, en plus de `illustrations/<cardId>.webp`. Silhouette à fond
transparent posée par-dessus le cadre (couche : fond → cadre → débord →
nom/coût/texte/stats), pensée pour déborder de la découpe d'illustration
vers le haut et les côtés — voir `bat-marin-abyssal-debord.webp` comme
référence. Jamais utilisé pour une carte non-Abyssale.

## `icons/` — icônes mécaniques + icônes de type

Voir `icons/README.md` pour les icônes mécaniques (Ancrage, Raison,
Puissance, Résistance, Garde, Sabordage, etc.).

L'icône de type de carte suit `type-<type>.webp` (`<type>` = `CardType` de
`game/cards/types.ts` tel quel : `marin`, `creature`, `equipement`,
`structure`, `objet`, `anomalie`) et se superpose en haut-droite du cadre,
à la place de l'ancien badge texte. Tant qu'elle
n'existe pas pour un type, l'app retombe sur le badge texte coloré.

## Charte graphique applicable aux cadres

- Format vertical **5:7**, quatre coins **arrondis** (rayon identique sur
  tous les cadres).
- Contour extérieur noir / bleu nuit très sombre, **sans liseré blanc**.
- Export PNG avec **transparence réelle** hors de la silhouette — alpha
  propre, bords nets, aucun pixel résiduel dans les coins.
- Palette : bleu nuit, bleu pétrole, turquoise désaturé, gris ardoise,
  blanc écume ; tons chauds réservés aux points de contraste.
- Un même type de carte = un même pictogramme de type sur tous les cadres.

## Interdits stricts

Pas de contour blanc, pas de logo/numéro d'édition inventé, pas de
symboles occultes ni de surcharge de runes, pas de changement de layout
d'un cadre à l'autre du même type.
