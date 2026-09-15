# Icônes d'état

Petits médaillons posés **sur une carte en jeu** pour signaler un état ou un
mot-clé actif : Garde, Malade (mal d'invocation), Silence, Immobilisé,
Engourdi, plus le compteur de tours restants d'une Structure.

Posées par `features/match/StatusBadge.tsx`, superposées au cadre par
`features/match/CardTile.tsx`.

| Fichier | État |
| --- | --- |
| `garde.webp` | Garde — redirige vers cette unité les attaques visant le Navire |
| `malade.webp` | Mal d'invocation — ne peut pas encore attaquer |
| `silence.webp` | Silence — capacités neutralisées |
| `immobilise.webp` | Immobilisé — ne peut pas attaquer |
| `engourdi.webp` | Engourdi |
| `tour.webp` | Médaillon du compteur de tours restants (Structures à durée) |

`tour.webp` porte un médaillon CLAIR : le texte superposé y est sombre, là
où il est clair sur les autres. C'est `StatusBadge` qui en décide, pas
l'asset.

Ces six fichiers traînaient à la racine de `public/assets/`, préfixés
`effect_` — le préfixe ne servait qu'à les distinguer de leurs voisins en
vrac, le dossier le remplace.
