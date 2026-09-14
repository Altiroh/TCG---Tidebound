# Décors d'interface

Habillages purement décoratifs, posés **derrière** une fenêtre ou un
panneau. Ils ne portent jamais d'information, ne reçoivent jamais de clic
(`pointer-events: none`) et ne doivent jamais concurrencer le contenu.

## Règle d'usage : jamais en pleine opacité

Ces visuels sont produits à pleine intensité. Tels quels sur un fond sombre
ils écrasent tout ce qu'ils entourent. Ils s'emploient donc **très
atténués** — de l'ordre de 10 à 20 % d'opacité — et masqués au centre pour
laisser la zone de lecture nette.

Deux pièges rencontrés, à ne pas refaire :

- `mix-blend-mode: screen` sur un fond sombre est **additif** : il ramène le
  décor à quasi pleine intensité malgré une faible opacité. Ne pas
  l'utiliser ici.
- une animation d'apparition qui finit à `opacity: 1` (avec `both`) **écrase**
  l'opacité déclarée sur l'élément. Faire porter le fondu par le parent, ou
  animer vers l'opacité cible.

## Inventaire

| Fichier | Usage actuel |
| --- | --- |
| `tentacles-abyssal-frame.webp` | Cadre de tentacules aux quatre coins — fond de la fiche de carte **Abyssale** (`features/collection/card-detail/`), à 15 % d'opacité, centre creusé au masque |
| `tentacles-abyssal-band.webp` | Bande horizontale de tentacules — pas encore employée ; prévue pour un bandeau (haut ou bas d'écran), même discrétion |

Les deux visuels sont explicitement **abyssaux** : ils n'ont rien à faire
derrière une carte Standard, dont l'accent est maritime et non violet.
