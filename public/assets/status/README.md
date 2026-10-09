# Icônes d'état

Petits médaillons posés **sur une carte en jeu** pour signaler un état ou un
mot-clé actif : Garde, Pied marin, Éveil, Malade (mal d'invocation), Silence,
Immobilisé, Engourdi, plus le compteur de tours restants d'une Structure.

Posées par `features/match/StatusBadge.tsx`, superposées au cadre par
`features/match/CardTile.tsx`.

| Fichier | État |
| --- | --- |
| `garde.webp` | Garde — redirige vers cette unité les attaques visant le Navire |
| `malade.webp` | Mal d'invocation — ne peut pas encore attaquer |
| `silence.webp` | Silence — capacités neutralisées |
| `immobilise.webp` | Immobilisé — ni attaque ni capacité ; sert aussi à toute carte inactive (Marée qui la met hors d'état, effet qui l'entrave) |
| `engourdi.webp` | Engourdi |
| `pied-marin.webp` | Pied marin — peut attaquer dès son arrivée |
| `eveil.webp` | Éveil (Lot 16) — la carte a un effet « Éveil — » ; le nombre d'Éveils du tour s'y inscrit |
| `tour.webp` | Médaillon du compteur de tours restants (Structures à durée) |
| `mort.webp` | Marqueur **Mort** (09/10/2026, deck Un Dead / Mort-vivant) — jeton de carton posé sur une carte. **Réservé** : aucune règle ne le pose encore ; il attend sa mécanique |

`tour.webp` porte un médaillon CLAIR : le texte superposé y est sombre, là
où il est clair sur les autres. C'est `StatusBadge` qui en décide, pas
l'asset.

Les six premiers fichiers traînaient à la racine de `public/assets/`, préfixés
`effect_` — le préfixe ne servait qu'à les distinguer de leurs voisins en
vrac, le dossier le remplace.
