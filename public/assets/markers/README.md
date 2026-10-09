# Marqueurs

Jetons de **carton** qu'une règle pose sur une carte en jeu : un marqueur
Mort, un marqueur Niveau (Eidolon Opalin)… L'équivalent numérique du bout
de carton qu'on poserait sur la carte, sur une vraie table.

**Règle d'affichage (décision du 09/10/2026)** : un marqueur se pose
**directement sur l'illustration** de la carte, comme le jeton physique —
pas en petit médaillon sur le cadre. Ce n'est pas un état : les états
(Garde, Éveil, Silence…) restent des médaillons du cadre (`../status/`).
Plusieurs marqueurs du même genre s'empilent sur l'illustration (le nombre
se lit sur la pile).

**Qui les pose** : le moteur, automatiquement, et seulement quand le TEXTE
d'une carte le dit (« Ramenez-la du Cimetière avec un marqueur Mort »).
Aucun effet ne pose de marqueur en silence : si une carte en pose un, son
texte l'écrit. Pool et règle détaillée du marqueur Mort : Notion, « Lot 18 —
Un Dead / Mort-vivant — EN PRÉPARATION ».

| Fichier | Marqueur | Statut |
| --- | --- | --- |
| `mort.webp` | **Mort** — deck Un Dead / Mort-vivant | Réservé : aucune règle ne le pose encore, il attend sa mécanique |

Format : 256 px de côté, détouré (fond transparent), WebP. Nommé d'après
le marqueur, en kebab-case.

Les marqueurs **Niveau** (`CardInstance.levelMarkers`, Eidolon Opalin)
existent dans le moteur mais n'ont pas encore de visuel : ils suivront la
même règle quand il arrivera.
