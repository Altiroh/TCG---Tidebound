# Board

Board principal + variantes visuelles selon les Eaux et les états de Marée.

- Racine : illustration du board principal (neutre, sans Eaux/Marée spécifique).
- `water-variants/` : une variante par Eaux (voir `game/environment/waterData.ts`
  pour la liste des `WaterDefinition` — id, nom).
- `tide-states/` : un état visuel par état de Marée — Calme, Houle, Tempête,
  Abysses (`game/environment/types.ts` `TideStateName`).

Principe UI à respecter (verrouillé) : le joueur doit pouvoir lire en
permanence son Ancrage/Raison, ceux de l'adversaire, l'Eau actuelle et sa
durée, la Marée actuelle et sa durée, les Slots occupés, les effets en
attente, et les permanents/Objets capables de déclencher ou activer un
effet.
