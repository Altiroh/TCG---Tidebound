# Animation — changement de Marée

Déclenchée quand `state.environment.tideState` change (`TIDE_ADVANCED` avec
`stateChanged: true` dans `game/events/types.ts`, résolu par
`game/environment/resolveEnvironment.ts`). Une transition par paire d'états
consécutifs du cycle Calme → Houle → Tempête → Abysses → Calme.
