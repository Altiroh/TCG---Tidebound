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
  /rules              Constantes, validations serveur-autoritaires, Jugement de l'Océan
  /actions            Actions joueur (jouer une carte, attaquer, saborder, terminer le tour)
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

Taxonomie verrouillée (`game/cards/types.ts`) : **Marin** et **Créature**
sont des permanents-unités (occupent un emplacement, attaquent,
défendent) ; **Équipement** est permanent par défaut mais peut être
`permanent: false` pour un usage unique ; **Structure** et **Anomalie**
sont des permanents non-unités ; **Action** se résout puis part au
cimetière ; **Réaction** est prévue pour se jouer hors de son propre tour
— le système de chaînes/réactions n'est **pas encore implémenté** (voir
"Points restant à construire" ci-dessous).

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

Exemples de cartes illustrant ces systèmes : `poisson-lanterne` (stats
variables + pioche à l'entrée en Abysses), `vigie-fragile` (inactive en
Tempête, détruite en Abysses), `voiles-affalees` / `bouchons-de-cire`
(ignorer la prochaine perte d'Ancrage), `front-depressionnaire` (double
les prochains dégâts de Marée), `maree-precipitee` / `reflux` (réduire/
prolonger la durée restante), `courant-de-verre` (changer les Eaux
actuelles), `sentinelle-du-recif` (porte le mot-clé Garde).

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

- **Réactions et chaînes** (cartes jouables hors de son propre tour, à la
  Yu-Gi-Oh) : le type de carte `reaction` existe dans le modèle de
  données, mais aucune mécanique de chaîne/priorité n'est implémentée.
- **Invisibilité conditionnelle des Structures** selon la Marée : non
  implémentée.
- **Capacités de Navire activables/conditionnelles** (ex: "la première
  fois que...", "une fois par partie...") : plusieurs Navires
  (`game/environment/shipData.ts`) documentent ces textes dans
  `passiveText`/`weaknessText` avec la mention explicite "non appliqué" —
  seuls les effets exprimables par les champs numériques du moteur sont
  réellement actifs.
- **Priorité entre porteurs de Garde multiples** : non tranchée par le
  cadrage, tout porteur est accepté pour l'instant.
- **Pondération du tirage des Eaux** : tirage uniforme dans `WATER_POOL`
  pour l'instant ; l'algorithme réel reste "à préciser".

## État du MVP

Cible finale du cadrage : deck de 40 cartes (max 3 exemplaires par
carte), 2 decks préconstruits, 2 joueurs, un plateau dont la taille suit
le Navire (4/5/6 emplacements), Raison comme ressource unique, Ancrage
comme condition de victoire principale, tours alternés avec structure
verrouillée, combat sans riposte automatique, Sabordage, Garde,
Jugement de l'Océan, effets génériques, triggers, Marée + Eaux + Navires.

**Écart actuel documenté** : les deux decks préconstruits
(`game/cards/decks/preconstructed.ts`) contiennent encore 20 cartes
chacun (contenu du bootstrap initial), pas 40 — l'expansion du pool de
cartes vers la cible finale est une prochaine étape de contenu, pas de
moteur.

Pas encore fait : interface de jeu (plateau, main, drag&drop, affichage
de la Marée/des Eaux/de la Raison), Supabase (auth, schéma de base, RLS,
temps réel), parties privées + invitation par code, matchmaking, PWA
(manifest présent, service worker à ajouter), collection/decks persistés,
historique de parties, système de Réactions/chaînes.

## Prochaines étapes suggérées

1. Étendre le pool de cartes vers la cible de 40 cartes/deck (contenu,
   pas moteur).
2. Cadrer et implémenter le système de Réactions/chaînes.
3. Schéma Supabase minimal (profils, parties, invitations) + policies RLS.
4. Route API / Server Action qui appelle `dispatch()` côté serveur et
   persiste le nouvel état + événements.
5. UI de plateau (lecture seule de l'état, puis actions) avec affichage
   de la piste de Marée, des Eaux actuelles et de la Raison.
6. Parties privées par code d'invitation.
7. Historique de parties à partir du journal d'événements.
