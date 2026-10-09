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

| Fichier | Marqueur | Statut |
| --- | --- | --- |
| `mort.webp` | **Mort** — deck Un Dead / Mort-vivant | Réservé : aucune règle ne le pose encore, il attend sa mécanique |

Format : 256 px de côté, détouré (fond transparent), WebP. Nommé d'après
le marqueur, en kebab-case.

Les marqueurs **Niveau** (`CardInstance.levelMarkers`, Eidolon Opalin)
existent dans le moteur mais n'ont pas encore de visuel : ils suivront la
même règle quand il arrivera.
