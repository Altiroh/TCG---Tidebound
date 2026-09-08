# Cartes

Une image **finie** par carte, rangée par type dans `cards/<type>/` — le
type est le `CardType` du moteur (`game/cards/types.ts`), le `cardId`
vient de `game/cards/sets/core.ts` (`CORE_SET`, 80 cartes). Chaque fichier
est le rendu **complet** de la carte (cadre + illustration + nom + coût +
type + texte de règles + statistiques), pas une illustration isolée —
l'app affiche l'image telle quelle, elle ne recompose rien à l'affichage.

## Convention de nommage

```
tb_<type>_<cardId>_card_v<NN>.png
```

`<NN>` = numéro de version sur 2 chiffres (`v01`, `v02`, ...), incrémenté à
chaque nouvelle passe sur une carte déjà illustrée. Une carte peut donc
avoir plusieurs versions présentes en même temps le temps d'une révision ;
la plus récente fait foi.

```
cards/
  marin/tb_marin_<cardId>_card_v01.png
  creature/tb_creature_<cardId>_card_v01.png
  equipement/tb_equipement_<cardId>_card_v01.png
  structure/tb_structure_<cardId>_card_v01.png
  objet/tb_objet_<cardId>_card_v01.png
  anomalie/tb_anomalie_<cardId>_card_v01.png
```

Exemple — Cylindre flottant (`type: "structure"`) :
`public/assets/cards/structure/tb_structure_cylindre-flottant_card_v01.png`

## Charte canonique (carte étalon : Cylindre flottant)

- Format vertical **5:7**, quatre coins **arrondis** (rayon identique sur
  toutes les cartes).
- Contour extérieur noir / bleu nuit très sombre, **sans liseré blanc**.
- Export PNG avec **transparence réelle** hors de la silhouette de la carte
  — alpha propre, bords nets et anti-aliasés, aucun pixel noir/blanc/coloré
  résiduel dans les coins.
- Coût en haut à gauche (panneau bleu, icône **cerveau seul** blanc pour la
  Raison — jamais dans une tête humaine).
- Type en haut à droite : bandeau clair, pictogramme à gauche + nom en
  capitales. Un même type = un même pictogramme sur toutes les cartes
  (voir `cards/icons/`).
- Illustration principale ≈ **55 %** de la carte.
- Nom sur bandeau bleu nuit sous l'illustration, blanc, massif, seul —
  **aucune sous-phrase/citation**.
- Icône mécanique/thématique à droite du nom, dans un **losange** (repère
  cohérent d'une carte à l'autre : Houle, Ancrage, Raison, Pêche, Abysses,
  Courant, etc.).
- Bloc de règles : fond blanc légèrement bleuté (jamais blanc pur), texte
  bleu nuit/noir bleuté, mots-clés en **bleu vif + gras**. Ordre rédactionnel
  recommandé : durée/condition de présence → condition d'activation →
  déclencheur → mot-clé → résolution → destruction/brisure/expiration.
- Statistiques de combat en bas : Puissance en bas à gauche (si la carte
  peut attaquer), Résistance en bas à droite (pictogramme bouclier). Un
  permanent qui ne peut pas attaquer n'affiche que sa Résistance. Jamais de
  valeur inventée pour remplir le cadre.

## Illustration = effet de carte

> La scène doit rendre l'effet compréhensible avant la lecture du texte.

- Carte défensive → montre concrètement ce qu'elle bloque/protège.
- Carte de déplacement → montre le déplacement ou son résultat.
- Carte de destruction → montre la menace/conséquence, sans réduire
  l'illustration à un pictogramme abstrait.
- Carte de réflexion/redirection → montre l'attaque entrante, l'interception,
  puis la trajectoire renvoyée vers la cible adverse.
- Référence canonique — **Cylindre flottant** : projectile adverse →
  interception par le Cylindre → projectile renvoyé → impact sur le Navire
  adverse.

Un motif maritime principal maximum par objet lorsque possible ; objets
immédiatement identifiables, peu de signes décoratifs. Rendu
illustration-first.

## Interdits stricts

Pas de contour blanc, pas de phrase d'ambiance sous le nom, pas de
citation, pas de logo/numéro d'édition inventé, pas de symboles occultes
ni de surcharge de runes, pas de changement de layout d'une carte à
l'autre, pas d'icône différente pour une même ressource/type/statistique,
pas d'illustration qui contredit l'effet réel de la carte.

Une nouvelle carte n'est pas un nouveau design : c'est une nouvelle
instance du même système graphique.
