# Tidebound

TCG multijoueur en ligne, jouable dans le navigateur, installable en PWA.

> **Tu ne combats pas seulement ton adversaire. Vous affrontez tous les
> deux la même mer, mais chacun essaie de faire en sorte qu'elle tue
> l'autre en premier.**

Cette phrase (voir `design/premier-cadrage-systeme-de-jeu.md` dans le
projet) est la boussole de design de Tidebound : la Marée et les Eaux ne
sont pas un décor, ce sont un troisième acteur que personne ne contrôle
totalement.

## Aperçu du jeu

Tidebound est un TCG 1 contre 1, tour par tour, sans mana séparé : chaque
carte se paie en **Raison**, la même ressource qui protège le joueur de
la folie (à 0, son **Ancrage** — l'équivalent des points de vie — se
dégrade). Les deux joueurs choisissent un **Navire** au deck-building
(stats de départ, nombre de Slots, résistances/faiblesses), puis
alternent des tours structurés en Phase principale (jouer des cartes,
Saborder, Briser un Objet — sans limite de nombre, seule la Raison
disponible freine) et Phase de combat (attaquer, en combat **mutuel** :
l'attaquant encaisse aussi la Puissance de sa cible).

Au-dessus de ce socle classique, la **Marée** (`Calme → Houle → Tempête →
Abysses → Calme`, modèle durée + intensité) inflige des malus globaux
identiques aux deux joueurs et rend certaines cartes plus fortes,
inactives ou carrément détruites selon l'état courant — c'est le
"troisième acteur" évoqué plus haut : personne ne la choisit, tout le
monde doit composer avec.

Le catalogue (~98 cartes, 7 lots de conception + variantes Abyssales)
combine des **effets génériques** (dégâts, soin, buff, invocation,
manipulation de Marée, révélation de main, choix forcé, ...) déclenchés
par des **triggers** (pose, mort, début de tour, changement d'état de
Marée, ...) — jamais de logique bricolée carte par carte, voir
"Priorité du projet" ci-dessous. Les sections qui suivent détaillent
chaque système ; "Mécanismes avancés" et "État du MVP" plus bas font le
point sur ce qui est réellement câblé aujourd'hui contre ce qui reste
prévu.

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
  Navire), et sa valeur de départ est **50% du maximum du Navire**
  (arrondi à l'entier inférieur — un joueur ne commence jamais à pleine
  Raison, cadrage Notion "Moteur de partie", 2026-09-10). Pendant sa Phase
  principale, un joueur peut jouer **autant de cartes qu'il peut en
  payer** : il n'existe pas de limite artificielle du type "une carte par
  tour" — dépenser toute sa Raison est une prise de risque volontaire.
  **Si la Raison d'un joueur est à 0 à la FIN de son propre tour**, il
  perd 1 point d'Ancrage (vérifié à ce moment précis, pas au début du
  tour suivant : il peut encore tenter de la récupérer avant la fin de
  son tour pour l'éviter).
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

Appliqué par `game/actions/endTurn.ts`, en deux temps distincts (cadrage
Notion "Moteur de partie — déroulement, Raison & chaînes d'effets",
2026-09-10) :

**A. Fin de tour DU JOUEUR QUI TERMINE** — effets de fin de tour,
défausse forcée (main > 7), puis, si **SA** Raison est à 0 à ce moment
précis, perte d'1 Ancrage.

**B. Début de tour DU JOUEUR QUI DEVIENT ACTIF** :

1. Vérification des Eaux (tirage de nouvelles Eaux si leur durée est
   épuisée — jamais une carte de deck, toujours tiré par le moteur).
2. Vérification de la Marée : décompte de la durée restante, progression
   éventuelle vers l'état suivant (`Calme → Houle → Tempête → Abysses →
   Calme`), puis application des malus de l'état courant — voir "Malus
   globaux des Marées" ci-dessous.
3. Effets différés — non modélisés pour le MVP, étape ignorée.
4. Régénération de +1 Raison (plafonnée à `reasonMax`).
5. Pioche d'une carte (deck vide → Jugement de l'Océan, voir plus bas).
6. Phase principale : dégel des unités, réinitialisation des attaques,
   nettoyage des modificateurs temporaires.

Un joueur **n'est plus limité** à une seule action principale par tour
(changement de cadrage 2026-09-10) : jouer une carte, Saborder ou Briser
un Objet peuvent s'enchaîner librement pendant la Phase principale — seule
la Raison disponible (et l'espace sur le plateau) les limite.

### Malus globaux des Marées (verrouillé, 2026-09-10)

- **Calme** : aucun malus.
- **Houle** : une fois par tour tant qu'elle est active, une carte
  éligible aléatoire du board (des deux joueurs) a 10% de chances de
  devenir **MALADE** (`STATUS_MALADE`) — elle perd alors 1 PV/Résistance
  à chaque tour tant qu'elle reste MALADE. Le statut est retiré
  automatiquement dès que la Marée quitte la Houle.
- **Tempête** : au début de chaque tour, chaque Navire perd 1 Ancrage
  tant qu'elle est active (`RULES.TIDE_ANCHOR_DAMAGE.tempete`).
- **Abysses** : à l'**entrée** uniquement (pas à chaque tour), chaque
  Navire perd 2 Ancrage et sa Raison maximale est réduite de 2
  (`RULES.ABYSSES_ENTRY_ANCHOR_LOSS` / `ABYSSES_REASON_MAX_PENALTY`) ; si
  la Raison courante dépasse la nouvelle limite, elle y est immédiatement
  ramenée. La Raison maximale est restaurée dès la sortie des Abysses.

### Phases (`GameState.phase`, `game/actions/advancePhase.ts`)

Chaque tour démarre en **Phase principale** : jouer une carte, Saborder ou
Briser un Objet n'y sont possibles que là (`assertInPhase`), sans limite
de nombre. Le joueur actif passe ensuite explicitement en **Phase de
combat** via `advancePhase` — attaquer n'est possible que dans cette
phase, avec chaque unité éligible (voir `assertUnitCanAttack`). `endTurn`
reste accessible depuis l'une ou l'autre phase (un joueur sans unité à
attaquer peut terminer son tour directement depuis la Phase principale) ;
le tour suivant recommence systématiquement en Phase principale.

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
- **Auras/stats dynamiques** : `computeEffectiveStats` accepte un troisième
  paramètre optionnel (`AuraContext` : plateau + Raison du CONTRÔLEUR de
  l'unité évaluée) pour calculer, sans jamais les stocker sur `CardInstance`,
  les bonus qui dépendent du reste du plateau ou de la Raison — bonus sur
  soi conditionné à une Structure visible contrôlée (`bernard-lermite-dacier`)
  ou à un seuil de Raison (`matelot-insomniaque`), aura envoyée aux autres
  unités d'un type donné sous un seuil de Raison (`capitaine-sans-sommeil`),
  et bonus d'Équipement conditionné à la Marée (`lampe-de-pont-rouge`,
  `masque-de-plongee-fissure`). Un appelant qui omet ce paramètre obtient les
  stats de base (modificateurs + Marée) sans ces auras.

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
  de ses propres permanents. N'est pas une action limitée et ne termine
  jamais le tour (Notion "Moteur de partie" : "action de jeu, pas fin de
  tour") ; déclenche `onSaborde` **et** `onDeath` (une destruction
  volontaire reste une mort).

## Cimetière : traçabilité

Chaque carte qui rejoint `PlayerState.graveyard` porte désormais
`CardInstance.graveyardCause` (`"discarded" | "destroyed" | "scuttled" |
"expired"`), posée au moment de la sortie de jeu (défausse forcée ou par
effet, destruction au combat/par effet, Sabordage, expiration de durée).
Sert de base à une future vue de défausse consultable (Notion "Moteur de
partie", section "Défausse — consultation et traçabilité") ; aucune
interface ne l'exploite encore.

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

## Mécanismes avancés

Les familles de mécanismes ci-dessous ont longtemps été volontairement
laissées de côté (trop risquées à câbler vite, ou demandant un vrai
sous-système) avant d'être toutes construites depuis :

- **Boucliers réactifs "1ère fois par tour"** (`game/state/shields.ts` +
  `CardInstance.oncePerTurnFlags`) : 7 cartes (Vieux Loup de Mer, Brise-
  Vague de Fortune, Second au Visage Pâle, Baleine aux Cicatrices
  Blanches, Wood Vy, Cage de Flottaison, Le Filet qui Respire) —
  interception d'une perte de Raison/de dégâts la première fois par tour
  que la situation se produit, câblée dans `resolveEffect.ts`,
  `resolveEnvironment.ts` et `attack.ts`.
- **Auras/stats dynamiques** (`computeEffectiveStats`, voir plus haut) : 5
  cartes (Bernard-l'Ermite d'Acier, Matelot Insomniaque, Capitaine Sans
  Sommeil, Lampe de Pont Rouge, Masque de Plongée Fissuré).
- **Lecture de main** (`HAND_CARD_REVEALED`, `game/effects/resolveEffect.ts`) :
  3 cartes (Guetteur de Brume, La Bouée qui Regardait, Cloche Immergée) —
  révèle N cartes aléatoires de la main adverse, purement informatif côté
  moteur. Guetteur de Brume est câblé directement dans `resolveReaction`
  (`game/triggers/triggerBus.ts`) plutôt que sur un `TriggerType` : activer
  une réaction est, dans ce moteur, le seul moyen pour l'adversaire de
  "déclencher un effet" pendant le tour de l'autre.
- **Anomalies globales temporaires** (`game/state/anomalies.ts`, permanents
  `type: "anomalie"` à durée limitée) : 7 des 9 cartes de cette famille
  (Quelque Chose Sous la Coque, Le Chant Sous la Ligne, Les Voix dans le
  Sillage, Ils Sont Sous Nous ×2, La Mer Réclame Davantage ×2) — règles
  symétriques appliquées automatiquement, centralisées dans
  `processTrigger`/`resolveEffect`/`resolveEnvironment`.
- **Choix de joueur** (`GameState.pendingChoice` + `game/actions/resolveChoice.ts`) :
  Le Fond Vous Regarde (×2) force, au début de chaque tour, un choix
  binaire pour le joueur actif — perdre de la Raison, ou infliger des
  dégâts d'Ancrage à son propre Navire. Bloque toute autre action tant
  qu'il reste ouvert, exactement comme `pendingReaction` ; le bot
  (`game/bot/`) le résout automatiquement via `evaluateState`. Ne couvre
  que ce cas binaire fixe — un choix aux branches dynamiques (générer une
  liste d'options à la résolution) resterait à construire au cas par cas.
- **Capacité activable répétable** (`CardDefinition.activatableOncePerTurn`
  + `game/actions/activateAbility.ts`) : Sondeur des Mauvaises Eaux
  ("une fois par tour, vous pouvez perdre 1 Raison : réduisez la Marée
  d'1 tour"). Ne couvre que les capacités de CARTE "une fois par tour" —
  les capacités de NAVIRE "une fois par partie" (Le Courlis "Virage
  court", L'Errant "Changer de cap", Le Brise-Lames "Tenir la ligne")
  restent non modélisées (mécanique de comptage différente : par partie,
  pas par tour).
- **Recherche en défausse** (`moveGraveyardCardToHand`,
  `game/actions/breakObject.ts`) : Grappin de Récupération — choisir dans
  sa défausse une Structure/un Équipement sous un plafond de coût.
- **Saut de Marée multi-états** (`forceTideJumpToAbysses`,
  `game/environment/tide.ts`) : La Gueule Sous la Mer / Sept Brasses Plus
  Bas (Lot 08) — force une entrée DIRECTE dans l'Abysses en ignorant les
  états intermédiaires, avec un verrou "aucun gain de Raison jusqu'au
  début du prochain tour" (`STATUS_NO_REASON_GAIN`) pour la première.

**Ce qui reste réellement non modélisé** :

- **Priorité entre porteurs de Garde multiples** : non tranchée par le
  cadrage, tout porteur est accepté pour l'instant.
- **Pondération du tirage des Eaux** : tirage uniforme dans `WATER_POOL`
  pour l'instant ; l'algorithme réel reste "à préciser".
- **Attachement d'Équipement, bonus statiques** : un bonus DYNAMIQUE
  (recalculé à la volée via `computeEffectiveStats`, ex: Lampe de Pont
  Rouge) se retire automatiquement dès que l'Équipement quitte le
  plateau. Un bonus STATIQUE posé une fois pour toutes via un modificateur
  (`CardInstance.modifiers`, ex: Harpon de Pont "+1 Puissance" à la pose)
  reste sur l'unité après la destruction de l'Équipement qui l'a posé —
  jamais nettoyé. Chantier distinct, non traité.
- **Fuite d'information réseau** : `matches.state` expose toujours le
  `GameState` complet (main adverse incluse) aux deux participants via
  Realtime. Le système de lecture de main ci-dessus ajoute un événement
  informatif PAR-DESSUS cet état déjà à information parfaite côté client
  — il ne referme pas cette fuite, qui resterait à corriger avant toute
  vraie séparation d'information par joueur.
- Un bug de RNG pré-existant (`resolveUnitTargets`, `randomAllyUnit`/
  `randomEnemyUnit` ne faisaient jamais avancer la graine — deux tirages
  "aléatoires" successifs retombaient sur la même unité) a été corrigé ;
  aucune carte du catalogue actuel n'utilise encore ces cibles.

**Fidélité du catalogue** (`game/cards/sets/core.ts`) : toutes les cartes
portent leur texte réel et complet. Quand une carte n'a pas
d'`onPlayEffects`/`abilities`/`onBreakEffects` malgré un texte à effet,
c'est volontaire — un commentaire `// non appliqué : ...` explique
précisément pourquoi, juste au-dessus de sa définition (il n'en reste
plus que pour les points listés ci-dessus).

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
- Voir "Mécanismes avancés" plus haut pour ce qui reste réellement non
  modélisé (priorité de Garde, pondération des Eaux, bonus d'Équipement
  statiques, fuite d'information réseau).

`RULES.MAX_HAND_SIZE` (7) est désormais appliqué : `game/actions/endTurn.ts`
défausse les cartes excédentaires du joueur qui termine son tour, avant de
passer la main, de façon déterministe (depuis le début de la main) — même
principe que la défausse déjà existante liée aux dégâts de Marée
(`game/environment/resolveEnvironment.ts`). Le système de choix de joueur
qui existe désormais (`GameState.pendingChoice`) ne couvre que le cas
binaire fixe déjà décrit dans "Mécanismes avancés" ; un vrai "choisissez
lesquelles défausser" resterait un chantier séparé (choix parmi un nombre
variable de cartes, pas entre deux effets connus d'avance).

Pas encore fait : interface de jeu (plateau, main, drag&drop, affichage
de la Marée/des Eaux/de la Raison), deckbuilder (les decks personnels ont
un schéma BDD mais pas d'UI), historique de parties (UI — les données
existent dans `matches`), système de raretés/boosters/économie côté client
(ouverture de booster, boutique, recyclage — le schéma serveur existe,
pas la logique d'ouverture).

**Supabase** : schéma étendu par
`supabase/migrations/20260910120000_cards_collection_economy.sql` —
cartes (miroir de `game/cards/sets/core.ts`, synchronisé par
`npm run seed:cards`), decks de base système, decks personnels, collection,
boosters (format 8 cartes verrouillé, pity Abyssal, protection Abyssale —
schéma seulement, pas encore la logique d'ouverture serveur), monnaie
interne + historique de transactions, quêtes, onboarding, et une file de
matchmaking (`matchmaking_queue` + fonction Postgres
`claim_matchmaking_opponent()`, esquissées côté serveur dans
`features/matchmaking/actions.ts`). Toutes ces tables ont RLS activé ;
celles qui doivent rester autoritaires côté serveur (collection, boosters,
monnaie, quêtes) n'ont volontairement aucune policy d'écriture pour
`authenticated` — seule une Server Action avec la clé service_role peut y
écrire. `RULES` (`game/rules/constants.ts`) et le moteur restent l'unique
source de vérité pour la RÉSOLUTION d'une partie ; ce schéma sert les
systèmes de méta-jeu (collection, boosters, progression) autour.

**PWA** : `public/sw.js` (app shell minimal, stale-while-revalidate sur
`/assets/*`, repli réseau→cache→`public/offline.html` pour la navigation)
est enregistré côté client par `components/ServiceWorkerRegister.tsx`. Reste
à faire : icônes d'app (`manifest.webmanifest` a un tableau `icons` vide —
aucun asset d'icône n'existe encore dans `public/assets/menu/logo`), donc
la PWA n'est pas encore réellement installable.

## Prochaines étapes suggérées

Le bootstrap initial (moteur, UI de plateau, Server Actions, schéma
Supabase, parties en ligne) est loin derrière — voir "État du MVP" plus
haut pour ce qui existe déjà. Ce qui reste réellement devant nous :

1. **Quêtes quotidiennes/hebdomadaires** — l'écart le plus structurant de
   l'économie (cf. "État du MVP") : sans elles, la cadence de boosters
   visée n'est pas atteignable avec les seuls paliers de niveau.
2. **Parties bot arbitrées côté serveur** — remplacer la dérogation de
   développement actuelle (issue déclarée par le navigateur) en faisant
   tourner le moteur et le bot côté serveur, comme en PvP ; ne change pas
   le calcul de récompense (`allowBotTides` suffira).
3. **Fuite d'information réseau** — `matches.state` expose le `GameState`
   complet (main adverse incluse) aux deux participants via Realtime ;
   une vraie couche de projection par joueur est un préalable à toute
   information cachée fiable en ligne (cf. "Mécanismes avancés").
4. Nettoyage des bonus d'Équipement STATIQUES à la destruction de
   l'Équipement (cf. "Mécanismes avancés") — les bonus dynamiques sont déjà
   corrects, les modificateurs posés une fois pour toutes ne le sont pas.
5. Icônes d'application pour la PWA (`manifest.webmanifest` a un tableau
   `icons` vide) — service worker déjà en place, mais pas réellement
   installable sans elles.
6. Historique de parties (UI — les données existent déjà dans `matches`),
   boutique complète, recyclage côté client.
