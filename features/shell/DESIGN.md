# Tidebound — design system UI (hors plateau)

Une seule direction artistique pour tous les écrans hors plateau : Collection,
Decks, éditeur, Boosters, Market, Profil (trophées / collectibles), Quêtes,
Jouer, authentification — et tout ce qui se pose dessus (fenêtres, tiroirs,
menus, info-bulles, alertes).

**Univers** : maritime, nocturne, abyssal, lunaire. **Ton** : bleu nuit et navy
profond, un cyan lumineux maîtrisé, un glow rare, une interface plus lisible et
plus premium que sombre.

**À éviter** : le noir pur, le style dashboard/admin, le néon cyberpunk, la
surcharge ornementale, le pirate décoratif kitsch, un style par écran.

## Où vit quoi

| Couche | Fichier | Rôle |
| --- | --- | --- |
| Tokens | `app/tokens.css` | Les valeurs (`--tb-*`) : couleurs, effets, rayons, espacements, typographie, mouvement, plans. **Seul endroit où une couleur est décidée.** |
| Coquille | `features/shell/ScreenShell.module.css`, `GameScreen.module.css` (haut) | Décor, bandeau, navigation, compte, recherche. Les alias courts `--cb-*`, `--panel`, `--line`, `--ink`… pointent sur les tokens. |
| Composants partagés | `features/shell/GameScreen.module.css` (§1–§8) | Panneaux, texte, boutons, tabs/chips/segmented/pagination, champs, bannières, états vide/chargement/squelettes, menus, tuiles, badges, rareté, progression. Consommés via `game.xxx`. |
| Overlays | `features/shell/Dialog.*`, `ScreenToast.*`, `components/ui/GlassAlert.*`, `components/game-ui/GameUi.module.css` (sélecteur, info-bulle), `features/progression/Profile.module.css` (tiroir de profil) | Fenêtres, alertes, menus déroulants, info-bulles, tiroirs. |
| Écrans | `features/<écran>/*.module.css` | Uniquement ce qui est propre à l'écran (grilles, dispositions, objets métier). **Aucune couleur codée en dur** : tokens ou alias. |

Le plateau de partie (`features/match/*`, `components/game-ui/tokens.ts`) garde
sa propre matière (`--surface-*`, `--accent` cuivre) ; il n'est pas couvert ici.

## Charte d'usage des couleurs

| Couleur | Tokens | Sert à | Ne sert jamais à |
| --- | --- | --- | --- |
| **Bleu nuit** | `--tb-bg*`, `--tb-surface*`, `--tb-border*` | La structure : fond, panneaux, bordures, champs. | Signaler un état. |
| **Cyan / glow** | `--tb-accent*`, `--tb-glow-*` | L'interaction : action primaire, survol, sélection, focus, onglet actif, progression en cours. | Décorer. Un glow sans interaction est une faute. |
| **Or** | `--tb-gold*` | Le premium et l'économie : Tides, prix, récompense à réclamer, Jeton, achat. | Les bordures, les titres, les filets de structure. |
| **Violet** | `--tb-abyssal*` | La variante Abyssale et la rareté spéciale. | Tout le reste. |
| **Rouge** | `--tb-danger*` | Le danger : suppression, erreur, deck invalide. Toujours désaturé et discret. | Un bouton rouge plein « moderne ». |
| **Vert** | `--tb-success*` | L'acquis : jouable, réclamé, obtenu. | — |

Règles :

- **Le fond est une ambiance.** Le décor reste derrière un voile bleu nuit
  (jamais noir) ; les panneaux sont translucides et servent la lisibilité.
- **Le glow dit la hiérarchie.** Trois intensités (`--tb-glow-sm` focus,
  `--tb-glow-md` survol du primaire / onglet actif, `--tb-glow-strong`
  sélection forte). Une seule action primaire par vue.
- **Une seule couleur d'accent à la fois** sur un objet : une tuile est cyan
  (sélectionnée) ou or (récompense), jamais les deux.
- **Le texte est froid** : `--tb-text` / `--tb-text-muted` / `--tb-text-soft`,
  jamais du gris neutre ni de l'ivoire.

## Typographie

| Rôle | Classe | Police | Taille |
| --- | --- | --- | --- |
| Titre de page | `game.title` | Cinzel (`--tb-font-display`) | `--tb-fs-page-title` |
| Titre de section | `game.sectionTitle` | Barlow, capitales espacées | `--tb-fs-section-title` |
| Titre de carte / tuile | `game.cardTitle` | Cinzel | `--tb-fs-card-title` |
| Corps | `game.body` | Barlow (`--tb-font-ui`) | `--tb-fs-body` |
| Texte secondaire | `game.muted` | Barlow, `--tb-text-muted` | `--tb-fs-body` |
| Légende | `game.caption` | Barlow | `--tb-fs-caption` |
| Étiquette | `game.label`, `game.fieldLabel` | Barlow, capitales | `--tb-fs-label` |
| Texte de bouton | (dans `game.primary`…) | Barlow 600 | `--tb-fs-button` |
| Surtitre | `game.eyebrow` | Barlow, capitales, cyan | `--tb-fs-label` |

Cinzel reste réservée à ce qui porte l'identité (titres, noms, valeurs
fortes) ; Crimson Pro à la lecture continue des cartes.

## Composants et états

Chaque composant couvre : **repos · survol · actif (pression) · sélectionné ·
focus clavier · désactivé**. Le focus est toujours un `outline` cyan de 2 px ;
le désactivé une opacité de 0,4–0,55 et `cursor: not-allowed`.

### Structure
`game.panel` · `game.panelRaised` · `game.panelInset` (sous-panneau) ·
`game.panelSolid` · `game.content` / `contentInner` / `contentWide` ·
`game.pageHead` · `game.sectionHead` · `game.rule`. Bandeau et colonnes
latérales : `ScreenShell.module.css` (`header`, `navTab`, `account`,
`searchPill`) et les tiroirs des écrans.

### Boutons (`§3`)
`primary` (cyan, glow au survol) · `secondary` (contour) · `tertiary` (fond
teinté) · `ghost` (rien au repos) · `link` · `iconButton` / `iconButtonGhost` ·
`danger` / `dangerGhost` · `premium` (or). Tailles : `buttonSm`, `buttonLg`.
`components/ui/Button` expose les mêmes rôles en React.

### Navigation (`§4`)
Onglets principaux : `ScreenShell` `navTab` / `navTabActive`. Onglets
secondaires : `tabs` + `tab` / `tabActive`. Puces de filtre ou de catégorie :
`chips` + `chip` / `chipActive` (+ `chipCount`). Contrôle segmenté :
`segmented` + `segment` / `segmentActive`. Pagination : `pagination` +
`pageButton` / `pageButtonActive` / `pageEllipsis`.

### Formulaires (`§5`)
`input` (+ `inputSm`) · recherche : `SearchLine` (`line` ou `pill`) · `select`
(natif habillé) ou `GameSelect` (menu riche) · `choice` + `choiceInput` +
`choiceBox` / `choiceRadio` (case, radio) · `toggle` (interrupteur ; en React :
`features/settings/ToggleSwitch`) · `controlRow` (ligne libellé + contrôle) ·
`field` / `fieldLabel` / `fieldHint`.

### Feedback (`§6`)
Info-bulle : `components/game-ui/Tooltip` (ou `game.tooltip`). Alerte
éphémère : `ScreenToast` (succès/erreur, sous le bandeau) et `GlassAlert`
(erreur/avertissement, plateau). Bannières : `error` · `notice` · `success` ·
`warning` · `banner` (notification pleine largeur). État vide : `empty` +
`emptyTitle` + `emptyMark`. Chargement : `loading` + `loadingDot` ×3.
Squelettes : `skeleton` / `skeletonText` / `skeletonBlock`.

### Overlays (`§7` + fichiers dédiés)
Fenêtre : `features/shell/Dialog` (`tone="danger"` pour une suppression,
`description` pour le sous-titre, `width` pour une prévisualisation).
Tiroir : `ProfileDrawer`. Menu contextuel : `menu` + `menuItem` /
`menuItemDanger` / `menuSeparator`. Popover : `popover`.

### Contenu (`§8`)
Tuile : `tile` / `tileActive` / `tileDisabled` (deck, mode, navire).
Tuile collectible : `collectible` / `collectibleActive` / `collectibleLocked` +
`collectibleArt` / `collectibleName` / `collectibleHint` (dos de carte,
exploit). Ligne de liste : `listRow` / `listRowActive`. Stat : `statBlock` +
`statValue` (`statValueGold`) + `statLabel`. Badge de compteur : `badge` /
`badgeGold`. Étiquettes : `tag`, `tagCyan`, `tagViolet`, `tagSuccess`,
`tagDanger`, `tagBrass`. Rareté : `rarityCommon` / `rarityUncommon` /
`rarityRare` / `rarityAbyssal`. Progression : `progressTrack` + `progressFill`
(`progressFillGold`, `progressFillSuccess`). Tuile de deck, sachet de booster,
offre du Market et ligne de quête restent des objets d'écran, composés sur ces
briques.

## Tonalité par écran

Même système, une nuance chacun :

- **Decks** — composition, clarté, sélection : tuiles `panelRaised`, plaque
  d'illustration (`ArtPlate`), cyan pour ce qui est choisi.
- **Collection** — lisibilité, catalogue : colonne de filtres à cases cochées,
  grille aérée, cartes non possédées en gris.
- **Boosters** — premium, spectaculaire : les sachets portent le visuel, le plan
  d'ouverture est le seul cadre, glow cyan sur le sachet posé.
- **Market** — commerce, offres : prix et total en or, CTA d'achat `premium`.
- **Collectables (Profil)** — trophées, musée : tuiles `collectible`, exploits
  obtenus en vert, verrouillés lisibles mais désaturés.
- **Quêtes** — progression, mission : traits de progression cyan, ligne à
  réclamer en or qui pulse doucement.

## Ajouter un écran

1. Monter sur `GameScreen` ; utiliser `game.content` + `game.contentInner`.
2. Composer avec les classes partagées avant d'en écrire une.
3. Dans le module de l'écran : aucune couleur codée en dur — `var(--tb-*)` ou
   les alias (`--panel`, `--line`, `--ink`, `--cb-cyan`).
4. Les états de chaque contrôle : repos / survol / actif / sélectionné /
   focus / désactivé.
