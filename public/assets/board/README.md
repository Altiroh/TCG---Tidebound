# Board

Board principal + variantes visuelles selon les Eaux et les états de Marée.

- Racine : illustration du board principal (neutre, sans Eaux/Marée spécifique).
- `water-variants/` : une variante par Eaux (voir `game/environment/waterData.ts`
  pour la liste des `WaterDefinition` — id, nom).
- `table-classique/` : le fond de la partie (07/10/2026) — tapis de parchemin
  serti de planches bleu-vert et de cordages (`playground.webp`, 1672×941), et
  la bougie posée par-dessus (`bougie.webp`). Posés par
  `table/BackgroundLayer.tsx` ; un sol de Lande (`LandeScene.floor`) remplace
  le fond tant que la Lande est en jeu.
- `tapis/` : toiles à voile rouge et bleue sous les camps, sur le parchemin
  (labo `/game/board-preview`). Chaque toile en deux pièces montées sans
  déformation : `-bout` (le bout gauche, le droit est son reflet) et `-milieu`
  (un morceau et son reflet, répété).
- `pont/` : **Le Pont du Capitaine** (08/10/2026), le plateau en plongée :
  - `pont-fond.webp` — le pont vu de haut, bastingage et mer autour (1672×941) ;
  - `piste-maree.webp` + `selecteur-maree.webp` — la piste à quatre hublots
    (centres mesurés dans `PontTideTrack.tsx`) et le sélecteur doré ;
  - `emplacement-carte.webp` — un emplacement vide (planche à rose des vents) ;
  - `socle-navire.webp` — la plaque sous chaque navire ;
  - `phase-principale.webp`, `phase-combat.webp`, `fin-de-tour.webp` — les
    boutons en relief ;
  - `bol-des.webp` — le bol à dés.
  Les sols de Lande du pont sont dans `landes/<id>/pont-sol.webp`.
- `tide-states/` : l'ancien fond de scène, une mer par état de Marée
  (1672×941). Plus affiché depuis la table classique.
- `tide-porthole-frame.webp` + `tide-portholes/` : le **hublot de Marée** de
  la bande centrale (`table/TidePorthole.tsx`). Le cadre est détourré, carré,
  avec une fenêtre ronde **mesurée** dans l'image — centre 49,5 % / 49,8 %,
  diamètre 53 % ; les valeurs sont recopiées dans `.portholeWindow`
  (`Table.module.css`). Remplacer le cadre par un autre dessin impose de les
  remesurer. `tide-portholes/` porte les quatre mers au format **carré**,
  cadrées pour tenir dans le disque : ce n'est pas le même cadrage que
  `tide-states/`, les deux ne sont pas interchangeables.

Principe UI à respecter (verrouillé) : le joueur doit pouvoir lire en
permanence son Ancrage/Raison, ceux de l'adversaire, l'Eau actuelle et sa
durée, la Marée actuelle et sa durée, les Slots occupés, les effets en
attente, et les permanents/Objets capables de déclencher ou activer un
effet.
