# Fin de partie

Les deux bandeaux de titre de l'écran de fin (`features/match/MatchEndScreen.tsx`).

| Fichier | Usage |
| --- | --- |
| `victory.webp` | Bandeau VICTOIRE |
| `defeat.webp` | Bandeau DÉFAITE |

Ils sont employés comme **masque** CSS (`mask: url(...)`) autant que comme
image : leur alpha porte la forme des lettres, la couleur vient de la
feuille de style.

Les cadres de Navire correspondants vivent dans `../ships/`
(`ship-frame-victory.webp`, `ship-frame-loose.webp`).
