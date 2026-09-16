# Board

Board principal + variantes visuelles selon les Eaux et les états de Marée.

- Racine : illustration du board principal (neutre, sans Eaux/Marée spécifique).
- `water-variants/` : une variante par Eaux (voir `game/environment/waterData.ts`
  pour la liste des `WaterDefinition` — id, nom).
- `tide-states/` : un état visuel par état de Marée — Calme, Houle, Tempête,
  Abysses (`game/environment/types.ts` `TideStateName`). Format panoramique
  (1672×941), posé en fond de scène par `table/BackgroundLayer.tsx`.
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
