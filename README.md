# Tidebound

TCG multijoueur en ligne, jouable dans le navigateur, installable en PWA.

> **Tu ne combats pas seulement ton adversaire. Vous affrontez tous les
> deux la même mer, mais chacun essaie de faire en sorte qu'elle tue
> l'autre en premier.**

Cette phrase (voir `design/premier-cadrage-systeme-de-jeu.md` dans le
projet) est la boussole de design de Tidebound : la Marée et les Eaux ne
sont pas un décor, ce sont un troisième acteur que personne ne contrôle
totalement.

## Priorité du projet

Le moteur de jeu (`/game`) est prioritaire sur tout le reste. Il est
volontairement indépendant de React/Next.js : c'est du TypeScript pur,
testable isolément, qui pourrait tourner aussi bien côté serveur que dans
un test unitaire sans jamais toucher au DOM.

Les cartes ne contiennent aucune logique spécifique : elles sont décrites
en données (`game/cards/sets/core.ts`) et combinent des **effets
génériques** (dégâts, soin, pioche, buff, invocation, manipulation de la
Marée/des Eaux, ...) déclenchés par des **triggers** (à la pose, à la
mort, en début de tour, à l'entrée dans un état de Marée, ...). Ajouter
une carte ne devrait quasiment jamais nécessiter de nouveau code moteur.

Les mécaniques ci-dessous suivent le cadrage **verrouillé** (voir les
docs `design/*.md` du projet, notamment "Mécaniques verrouillées" qui
finalise le cadrage). Là où le cadrage laisse volontairement des points
ouverts, ce bootstrap implémente la **structure** et documente
explicitement les valeurs numériques encore provisoires plutôt que de les
inventer.

## Stack

- Next.js 14 (App Router) / React 18 / TypeScript strict
- Tailwind CSS
- Supabase (auth, Postgres, temps réel) — client configuré dans `lib/supabase`, schéma à venir
- Vitest pour les tests du moteur

## Démarrage

```bash
npm install
cp .env.example .env.local   # renseigner les clés Supabase
npm run dev                  # http://localhost:3000
npm run typecheck
npm test                     # tests unitaires du moteur (Vitest)
```

## Structure

```
/app                 Pages et routes Next.js (App Router)
/components/ui       Composants UI génériques, sans logique métier
/features            Fonctionnalités métier (collection, decks, parties, profils) — à construire
/game                Moteur de jeu, indépendant de React
  /cards              Définitions de cartes (données) + decks préconstruits + coût effectif
  /effects            Résolution des effets génériques
  /triggers           Bus de déclenchement des capacités
  /environment        Marée, Eaux, Navires (voir section dédiée ci-dessous)
  /rules              Constantes, validations serveur-autoritaires, Jugement de l'Océan, validation de deck
  /actions            Actions joueur (jouer une carte, attaquer, saborder, briser un Objet, terminer le tour)
  /state              Modèle de l'état de partie + création + traitement des morts
  /events             Journal d'événements (pour replay/debug/stats plus tard)
  engine.ts           Point d'entrée unique : dispatch(state, action) -> nouvel état
/lib/supabase         Clients Supabase (navigateur, serveur, service role)
/types                Types partagés hors moteur
/tests/game           Tests unitaires du moteur
```

## Le moteur de jeu, en bref

- **Le client n'est jamais la source de vérité.** Toute action passe par
  `dispatch(state, action)` dans `game/engine.ts`, qui valide (existence
  de la partie, tour du joueur, zone de la carte, coût, cible, légalité)
  avant d'appliquer quoi que ce soit.
- **Déterminisme.** Le moteur n'appelle jamais `Math.random()` en interne :
  la graine du générateur pseudo-aléatoire (`game/rng.ts`) fait partie de
  l'état de partie et avance de façon pure, pour permettre un jour des
  replays fidèles.
- **État = source unique de vérité.** Une partie est entièrement
  représentable par son `GameState` (joueurs, mains, plateau, Ancrage,
  Raison, Navire, environnement, tour, journal d'événements).
- **Journal d'événements.** Chaque action légale émet des `GameEvent`
  (`DRAW_CARD`, `PLAY_CARD`, `ATTACK`, `DAMAGE`, `SUMMON`, `DESTROY`,
  `SABORDED`, `TIDE_ADVANCED`, `WATER_CHANGED`, `OCEAN_JUDGMENT`, ...)
  accumulés dans `state.eventLog`.

## Ancrage et Raison

- **Ancrage** (`PlayerState.anchor`) remplace les points de vie. À 0 (ou
  moins), le joueur perd. Sa valeur de départ vient du **Navire** choisi.
- **Raison** (`PlayerState.reason` / `reasonMax`) est **LA** ressource du
  jeu — il n'existe pas de mana séparé. Elle paie le coût de toutes les
  cartes, régénère de +1 par tour (plafonnée à `reasonMax`, propre au
  Navire), et sa valeur de départ est le maximum du Navire (les deux
  joueurs commencent à pleine Raison). **Tant que la Raison est à 0**, le
  joueur perd 1 point d'Ancrage au début de chacun de ses tours, jusqu'à
  ce qu'elle remonte au-dessus de 0.
- Échelle de coût verrouillée : 1 à 5 = standard, 6 = exceptionnel,
  7 = extrême.

## Types de cartes

Taxonomie verrouillée (`game/cards/types.ts`, verrouillage du 2026-09-08) :
**Marin** et **Créature** sont des permanents-unités (occupent un Slot,
attaquent, défendent) ; **Équipement** est permanent par défaut mais peut
être `permanent: false` pour un usage unique ; **Structure**, **Objet** et
**Anomalie** sont des permanents non-unités.

**Action et Réaction n'existent PAS comme types de carte** — changement de
cadrage survenu en cours de projet : les effets ponctuels sont désormais
portés par des **Objets**, des permanents autonomes toujours visibles qui
occupent un Slot et se **brisent** (`game/actions/breakObject.ts`,
`CardDefinition.onBreakEffects`) pour résoudre leur effet. Briser ≠
Saborder : aucun des deux ne déclenche l'autre.

Tous les permanents (unités comme non-unités) occupent un Slot — le
plateau est limité par `Navire.slotCount`, pas seulement pour les unités.

## Structures : durée et visibilité

- **Durée** (`CardDefinition.durationTurns` / `CardInstance.turnsRemaining`) :
  une Structure ou un Objet peut avoir une durée de vie limitée, décomptée
  une fois par tour joué (tous joueurs confondus) par
  `game/environment/resolveEnvironment.ts`. À 0, la carte quitte le board
  par **expiration** — ni mort (`onDeath`) ni Sabordage (`onSaborde`) ;
  déclenche `onExpire` si la carte a une capacité qui y réagit.
- **Visibilité** (`CardDefinition.visibleDuringTide`) : une Structure peut
  n'être visible pour l'adversaire que pendant certains états de Marée.
  Le propriétaire la voit toujours ; elle occupe son Slot et continue
  d'exister même invisible. La transition d'invisible à visible déclenche
  `onBecomeVisible` (portée : la carte elle-même uniquement pour
  l'instant — un déclenchement plus large, ex: "n'importe laquelle de vos
  Structures", n'est pas encore modélisé).

## Structure de tour

Ordre verrouillé, appliqué par `game/actions/endTurn.ts` au moment où un
nouveau joueur devient actif :

1. Vérification des Eaux (tirage de nouvelles Eaux si leur durée est
   épuisée — jamais une carte de deck, toujours tiré par le moteur).
2. Vérification de la Marée : décompte de la durée restante, progression
   éventuelle vers l'état suivant (`Calme → Houle → Tempête → Abysses →
   Calme`), puis application des dégâts d'Ancrage/Raison **à chaque tour**
   passé en Tempête ou en Abysses (pas seulement à l'entrée).
3. Effets différés — non modélisés pour le MVP, étape ignorée.
4. Si la Raison est à 0 : perte d'1 Ancrage.
5. Régénération de +1 Raison (plafonnée à `reasonMax`).
6. Pioche d'une carte (deck vide → Jugement de l'Océan, voir plus bas).
7. Phase principale : dégel des unités, réinitialisation des attaques,
   nettoyage des modificateurs temporaires, et réinitialisation de
   l'action principale du tour.

Un joueur ne dispose que d'**une seule action principale par tour** :
jouer une carte, Saborder un permanent, ou passer
(`PlayerState.hasUsedMainActionThisTurn`).

## La Marée, les Eaux et le Navire (`game/environment`)

- **Marée** (`game/environment/tide.ts`) : modèle **durée + intensité**.
  Chaque état (`Calme`, `Houle`, `Tempête`, `Abysses`) dure un nombre de
  tours donné (`RULES.TIDE_STATE_DURATION`) et porte une Intensité qui
  multiplie ses dégâts. Des cartes peuvent réduire/prolonger la durée
  restante, modifier l'Intensité, poser un modificateur "maintenez cet
  état" (`tideMaintain`) ou "doublez les prochains dégâts"
  (`tideAmplifyNext`).
- **Navire principal** (`game/environment/shipData.ts`) : carte fixe,
  choisie au deck-building (`DeckList.shipId`), jamais piochée. Détermine
  l'Ancrage de départ, la Raison max, le nombre d'emplacements (4 léger,
  5 standard, ou 6 lourd — vraie caractéristique d'équilibrage), et des
  résistances/faiblesses face à la Marée (Ancrage et Raison).
- **Eaux actuelles** (`game/environment/waterData.ts`) : la région
  traversée, commune aux deux joueurs, tirée automatiquement par le
  moteur (`WATER_POOL`) et jamais choisie par un joueur. Modifie le coût
  de certaines cartes (par `tag`), les dégâts environnementaux, et les
  statistiques de cartes taguées.
- **Affinité de Marée** (`CardDefinition.tideAffinity`) : une carte peut
  avoir des statistiques différentes, être inactive, ou être détruite
  selon l'état de Marée courant — calculé à la volée par
  `computeEffectiveStats` (`game/cards/stats.ts`), jamais stocké.

Exemples de cartes illustrant ces systèmes : `murene-aveugle` (stats
variables selon la Marée), `masse-noire` (inactive pendant Calme),
`regulateur-de-courant` / `horloge-de-maree` (Sabordage : réduit la durée
de Marée restante), `radeau-de-fortune` (`onExpire` : récupère de
l'Ancrage), `epave-engloutie` / `ponton-aux-cloches` (`onBecomeVisible`),
`crabe-de-fer` (porte le mot-clé Garde), `thermos-du-dernier-quart` /
`levier-de-lest` (Objets : `onBreakEffects`).

## Combat, Sabordage et Garde

- **Pas de riposte automatique** (règle verrouillée) : dans un combat
  unité contre unité, seule la cible défenseur subit des dégâts.
  L'attaquant n'est jamais touché en retour, sauf effet explicite de type
  "Riposte" (pas encore modélisé comme mot-clé générique).
- **Garde** (`keywords: ["garde"]`) : mot-clé universel. Tant qu'un
  adversaire contrôle un permanent portant Garde, une attaque visant
  directement son Navire est refusée — elle doit cibler un porteur de
  Garde. La priorité entre plusieurs porteurs simultanés reste "à
  préciser" par le cadrage ; tout porteur est accepté pour l'instant.
- **Sabordage** (`game/actions/saborder.ts`) : détruit volontairement un
  de ses propres permanents. Consomme l'action principale du tour comme
  jouer une carte, et déclenche `onSaborde` **et** `onDeath` (une
  destruction volontaire reste une mort).

## Jugement de l'Océan

Piocher dans un deck vide ne provoque plus de défaite instantanée
(`game/rules/oceanJudgment.ts`). Le moteur pose `pendingOceanJudgment`
sur l'état, et `dispatch()` résout ensuite une comparaison de
**Résilience** (Ancrage + Raison) entre les deux joueurs, avec
départage : plus d'Ancrage, puis plus de permanents en jeu, puis match
nul en cas d'égalité totale.

## Ordre de résolution des déclenchements simultanés

Règle verrouillée : quand plusieurs effets automatiques se déclenchent en
même temps (ex: `onTideStateEntered`, `onCardPlayed`), ceux du **joueur
actif se résolvent en premier**, puis ceux de l'adversaire — implémenté
dans `game/triggers/triggerBus.ts`.

### Points restant à construire (documentés, non implémentés)

Le cadrage identifie explicitement des systèmes volontairement complexes
et reportés :

- **Capacités activables** (Navires : "une fois par partie..." ; certaines
  cartes : "vous pouvez perdre X Raison pour...") : aucun système
  d'activation hors pose/Sabordage/bris n'existe. Documentées en texte
  avec la mention "non appliqué".
- **Interception réactive** ("la première fois par tour que vous
  perdriez X, réduisez de N") : très fréquente dans le catalogue de 80
  cartes, non modélisée — le moteur ne sait pas encore intercepter/réduire
  un effet en cours de résolution.
- **Information cachée** (regarder une carte de la pioche/Eaux/main
  adverse) : non modélisée, l'état de jeu est actuellement à information
  parfaite côté serveur.
- **Choix de joueur en cours de résolution** ("vous pouvez...", "choisissez
  soit...") : non modélisé ; seul le ciblage `chosenUnit` au moment de
  jouer/briser une carte existe.
- **Attachement d'Équipement persistant** : jouer un Équipement applique
  un bonus permanent via `chosenUnit`, mais l'Équipement lui-même n'est
  pas suivi comme rattaché à sa cible (pas de retrait du bonus si la cible
  part, pas de résolution de "si l'Équipement est détruit...").
- **Priorité entre porteurs de Garde multiples** : non tranchée par le
  cadrage, tout porteur est accepté pour l'instant.
- **Pondération du tirage des Eaux** : tirage uniforme dans `WATER_POOL`
  pour l'instant ; l'algorithme réel reste "à préciser".

**Fidélité du catalogue de 80 cartes** (`game/cards/sets/core.ts`) : toutes
les cartes portent leur texte réel et complet, mais une bonne partie de
ces textes dépend des mécaniques ci-dessus (interception réactive,
info cachée, choix). Quand une carte n'a pas d'`onPlayEffects`/
`abilities`/`onBreakEffects` malgré un texte à effet, c'est volontaire —
un commentaire `// non appliqué : ...` explique précisément pourquoi,
juste au-dessus de sa définition.

## État du MVP

Catalogue complet : **80 cartes** verrouillées (`game/cards/sets/core.ts`,
7 lots de conception), **3 Navires** verrouillés (Le Courlis, L'Errant, Le
Brise-Lames — `game/environment/shipData.ts`), **3 decks de base système**
assortis (un par Navire, `game/cards/decks/preconstructed.ts`, 40 cartes
chacun). Deck personnel valide : 40 à 50 cartes, limite d'exemplaires
définie carte par carte (`CardDefinition.maxCopies`, jamais dérivée de la
rareté) et vérifiée côté serveur par `game/rules/deckValidation.ts`.

Raison comme ressource unique, Ancrage comme condition de victoire
principale, Slots universels (tout permanent en occupe un), tours
alternés avec structure verrouillée, combat sans riposte automatique,
Sabordage, Bris d'Objet, Garde, Jugement de l'Océan, effets génériques,
triggers (dont `onBecomeVisible`/`onExpire`), Marée + Eaux + Navires.

**Écarts actuels documentés** :
- Système de raretés/boosters/économie de collection (`TCG_DATABASE.md`)
  spécifié côté design mais pas implémenté — pas de schéma BDD, pas de
  logique d'ouverture de booster.
- Voir "Points restant à construire" plus haut pour les mécaniques de
  cartes non modélisées (interception réactive, information cachée,
  choix de joueur, attachement d'Équipement persistant).

`RULES.MAX_HAND_SIZE` (7) est désormais appliqué : `game/actions/endTurn.ts`
défausse les cartes excédentaires du joueur qui termine son tour, avant de
passer la main. Faute d'un système de choix de joueur, la défausse est
déterministe (depuis le début de la main), sur le même principe que la
défausse déjà existante liée aux dégâts de Marée
(`game/environment/resolveEnvironment.ts`) — à remplacer par un vrai choix
dès que "Choix de joueur en cours de résolution" sera modélisé.

Pas encore fait : interface de jeu (plateau, main, drag&drop, affichage
de la Marée/des Eaux/de la Raison), Supabase (auth, schéma de base, RLS,
temps réel), parties privées + invitation par code, matchmaking,
collection/decks persistés, boosters/économie, historique de parties.

**PWA** : `public/sw.js` (app shell minimal, stale-while-revalidate sur
`/assets/*`, repli réseau→cache→`public/offline.html` pour la navigation)
est enregistré côté client par `components/ServiceWorkerRegister.tsx`. Reste
à faire : icônes d'app (`manifest.webmanifest` a un tableau `icons` vide —
aucun asset d'icône n'existe encore dans `public/assets/menu/logo`), donc
la PWA n'est pas encore réellement installable.

## Prochaines étapes suggérées

1. Décider si les mécaniques réactives/à information cachée les plus
   fréquentes du catalogue (interception "1re fois par tour", regarder
   une carte) valent la peine d'un nouveau sous-système générique, ou
   restent hors périmètre.
2. Appliquer `RULES.MAX_HAND_SIZE` (défausse en fin de tour).
3. Schéma Supabase minimal (profils, parties, invitations, cartes,
   raretés, boosters) + policies RLS — voir le schéma BDD recommandé dans
   `TCG_DATABASE.md`.
4. Route API / Server Action qui appelle `dispatch()` côté serveur et
   persiste le nouvel état + événements.
5. UI de plateau (lecture seule de l'état, puis actions) avec affichage
   de la piste de Marée, des Eaux actuelles et de la Raison.
6. Parties privées par code d'invitation.
7. Historique de parties à partir du journal d'événements.
