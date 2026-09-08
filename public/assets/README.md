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
