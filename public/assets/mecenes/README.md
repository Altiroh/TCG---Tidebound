# Mécènes

Les quatre mécènes (`game/progression/hub.ts`, `SPONSORS`), livrés le
25/09/2026 et renommés d'après leur identifiant :

| Identifiant | Mécène | Couleur | Illustration | Insigne |
|---|---|---|---|---|
| `beladone` | Béladone — une femme du peuple | marron | `beladone.webp` | `beladone-insigne.webp` (bateau de papier) |
| `ambassade-cra-poiscail` | L'Ambassade Cra-Poiscail | bleu | `ambassade-cra-poiscail.webp` | `ambassade-cra-poiscail-insigne.webp` |
| `compagnie-du-mousquet` | La Compagnie du Mousquet — un chat homme-bête | jaune | `compagnie-du-mousquet.webp` | `compagnie-du-mousquet-insigne.webp` |
| `representant-du-peuple` | Le Représentant du Peuple — une Sentinelle chromatique blanche | violet | `representant-du-peuple.webp` | `representant-du-peuple-insigne.webp` (pierre) |

Illustrations en pied, détourées (≈ 650 × 900) ; insignes détourés, 400 px
au plus. Un mécène encore anonyme (« Quelqu'un vous observe… ») ne montre
ni l'un ni l'autre.

## Coffret des colis (25/09/2026)

- `coffret/coffret-ferme.webp` : le coffret fermé (source `mecene-coffret.png`).
- `coffret/coffret-caisse.webp` et `coffret/coffret-couvercle.webp` : la vue éclatée `mecene--open.png`, séparée en deux calques au même cadrage (700 × 700) — le couvercle saute à l'ouverture (`GiftOpening`).

## Scène des Mécènes (28/09/2026)

Calques de la fenêtre `SponsorsSheet` (maquette du 28/09/2026), livrés en PNG
à la racine de `public/` et convertis par `scripts/optimizeImages.mjs` :

| Fichier | Source | Rôle |
|---|---|---|
| `scene/fond.webp` | `background.png` | le mur de la cabine, fond du panneau |
| `scene/tele.webp` | `tv.png` | la télé sur son étagère ; l'écran est transparent (18,9–78,8 % × 13,9–66,9 %) |
| `scene/tele-ecran.webp` | `tv-content.png` | l'image du public, sous le cadre de la télé (grésillement en CSS) |
| `scene/lanterne.webp` | `lantern.png` | la lanterne allumée |
| `scene/lanterne-eteinte.webp` | `lantern-out.png` | la même, soufflée (même cadrage) |
| `scene/cadre-photo.webp` | `cadre-mecene.png` | le cadre photo épinglé ; fenêtre transparente penchée de −6° |
| `scene/etoile-de-mer.webp` | `etoile 1.png` | décor posé sur le mur |

Le bandeau EN DIRECT, la fumée, la lueur de la lanterne et le halo des colis
sont en CSS (`SponsorsSheet.module.css`), sans image.
