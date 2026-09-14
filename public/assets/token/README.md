# Jetons (Péons)

Illustrations des cartes **jeton** — celles qui n'existent que créées par
un effet d'invocation, jamais en main, jamais dans un deck ni dans la
collection (`CardDefinition.token`, catalogue `game/cards/sets/tokens.ts`).

```
token/<cardId>.png          # jeton à visuel unique
token/<cardId>-<n>.png      # jeton à plusieurs visuels, n de 1 à illustrationVariants
```

Pour le Péon Cra-Poiscail (`illustrationVariants: 3`) :

```
token/peon-cra-poiscail-1.webp
token/peon-cra-poiscail-2.webp
token/peon-cra-poiscail-3.webp
```

Une seule identité de gameplay, trois visuels interchangeables : la
variante est tirée **à l'invocation**, avec le générateur aléatoire de la
partie, et retenue sur l'instance — le jeton garde donc la même tête
jusqu'à sa mort, et les deux joueurs voient le même.

Le cadre, lui, est commun à tous les jetons
(`../cards/frames/cadre_token.webp`) : volontairement générique pour servir
aux Péons d'autres familles plus tard. Il n'a d'emplacement ni pour un
coût, ni pour un bandeau de type, ni pour un bloc de règles — seulement
l'illustration, le nom et les deux médaillons de statistiques.

Tant qu'une illustration manque, l'app laisse la découpe vide plutôt que
d'inventer un visuel, exactement comme pour les cartes normales.
