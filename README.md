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
  tokens.css          Design tokens globaux `--tb-*` (couleurs, effets, rayons, espacements, typographie)
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
/features/shell      Coquille des écrans hors plateau + design system (composants partagés, `DESIGN.md` = charte)
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
  cartes, plafonnée à `reasonMax` (propre au Navire). Pendant sa Phase
  principale, un joueur peut jouer **autant de cartes qu'il peut en
  payer** : il n'existe pas de limite artificielle du type "une carte par
  tour". La Raison **persiste d'un tour à l'autre** : ce qui n'est pas
  dépensé reste acquis, ce qui l'est n'est pas rendu (ci-dessous).
- **Persistance & récupération naturelle** (`RULES.NATURAL_REASON_RECOVERY`,
  passe de stabilisation du 2026-09-21, **à prototyper**) : au début de
  chacun de ses tours, le joueur récupère **+2 Raison**, et rien de plus.
  Remplace la remise à niveau au plafond, qui rendait la Raison gratuite et
  laissait un deck de swarm remplir son plateau dès son 2e tour. À cette
  valeur, la courbe de plafond ci-dessous devient la progression RÉELLE :
  un Courlis suit 2 / 4 / 6 / 8, puis le plafond prend le relais
  (9 / 11 / 12). Toute la courbe se pilote donc depuis cette seule
  constante. Prendre volontairement de la Déraison reste le moyen de jouer
  au-dessus de ses moyens, et se paie en Ancrage.
- **Plafond de début de partie** (`RULES.STARTING_REASON_CURVE`) : au `n`-ième
  tour du joueur, sa Raison ne peut pas **dépasser** 15 / 30 / 45 / 60 / 75 /
  90 / 100 % de sa Raison max, arrondi au supérieur (Courlis 12 →
  2 / 4 / 6 / 8 / 9 / 11 / 12, Brise-Lames 8 → 2 / 3 / 4 / 5 / 6 / 8 / 8).
  Ce plafond (`PlayerState.reasonCap`) ne fait **rien monter** — il ne mord
  que sur les gains venant des **cartes**, pour empêcher un deck de rampe de
  sauter les paliers. Il ne rogne jamais l'acquis : un joueur déjà au-dessus
  (Abysses qui abaissent sa Raison max) conserve sa Raison.
- **Déraison** (`game/state/reason.ts`, piste Notion "Gameplay — Raison,
  Déraison, healing & passifs de Navires", 2026-09-12, **à prototyper**) :
  la Raison peut passer sous 0, **sans plancher** (décision de design du
  2026-09-16 : « il n'y a pas de Déraison max »). Payer un coût (carte,
  capacité activable, réaction) ou subir une perte de Raison peut y
  pousser aussi loin que le joueur l'accepte ; le moteur ne refuse jamais
  un coût, c'est la dette qui freine. **Deux dettes, deux traitements**
  (arbitrage du 2026-09-21) :
  - **Déraison CHOISIE** — celle qu'on prend en dépensant pendant son
    propre tour. **À la fin de son tour** (après tous les effets de fin de
    tour — il peut donc encore remonter avant), chaque point sous 0
    inflige 1 dégât d'Ancrage (`DERAISON_ANCHOR_DAMAGE_PER_POINT`,
    événement `DERAISON_SETTLED`), puis la Raison repart de 0. Terminer à
    exactement 0 ne coûte rien. Pénitence (La Religieuse) réduit ces
    dégâts de 1.
  - **Déraison SUBIE** — celle qu'un effet adverse inflige pendant le tour
    d'en face. Elle ne coûte **aucun Ancrage** : elle coûte du **revenu**.
    Au début du tour de sa victime, la récupération naturelle est amputée
    du montant de la dette, puis l'ardoise est effacée. Un adversaire à 0
    qui subit -2 commence donc son tour à **0 Raison**, sans perdre
    d'Ancrage : il a perdu un tour de revenu. Amputée **une seule fois**,
    jamais reportée — sans quoi, avec une récupération à +1, des drains
    répétés maintiendraient quelqu'un sous zéro indéfiniment. Contrepartie
    assumée : drainer au-delà de la récupération ne coûte pas plus cher à
    qui est déjà à 0, la valeur d'un drain venant surtout de la Raison
    positive qu'il emporte.

  La séquence sépare seule le subi du choisi, sans que le moteur trace
  l'origine de chaque point perdu : ce qui est encore négatif à la fin d'un
  tour a forcément été choisi pendant ce tour. Exception assumée — une
  réaction adverse qui draine pendant VOTRE tour compte comme du choisi :
  vous avez eu tout votre tour pour remonter. Remplace l'ancienne
  règle "Raison à 0 en fin de tour = -1 Ancrage" : finir à exactement 0 ne
  coûte rien. Pénitence (La Religieuse) réduit ces dégâts de 1. Côté UI :
  jauge rouge et pastille "⚓ −N en fin de tour" sur le Navire, avertissement ambre avant de poser
  une carte qui fait passer sous 0 (second clic pour confirmer, ou pendant
  le glisser-déposer).
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
  Le propriétaire la voit toujours ; elle occupe son Slot et sa durée
  continue de se consumer même masquée. La transition d'invisible à visible
  déclenche `onBecomeVisible` (portée : la carte elle-même uniquement pour
  l'instant — un déclenchement plus large, ex: "n'importe laquelle de vos
  Structures", n'est pas encore modélisé).
- **Masquée = INACTIVE** (règle tenue par le moteur depuis le 21/09/2026) :
  une Structure masquée existe, occupe son Slot et vieillit, mais **ses
  capacités ne se déclenchent pas**. Auparavant le masquage ne bloquait
  rien — il fallait que chaque capacité déclare
  `condition: { selfVisible: true }` ou que chacun de ses effets porte
  `conditionSelfVisible`. Le catalogue le faisait par discipline, mais rien
  ne le tenait : la Balise des Profondeurs se proposait bel et bien alors
  qu'elle était invisible. Les déclencheurs de DÉPART (`onDeath`,
  `onSaborde`, `onExpire`, `onTideStateExited`) et la révélation
  (`onBecomeVisible`) échappent à la règle — partir ou se découvrir n'est
  pas « agir ».
- **Réaction cachée** (`TriggeredAbility.hiddenReaction`) : l'unique
  exception. Une capacité ainsi déclarée PEUT s'utiliser alors que sa
  porteuse est masquée, ce qui en fait un **piège** — l'adversaire voit un
  Slot occupé, pas une carte (`toPlayerView`). Trois règles l'encadrent :
  1. **La révélation précède la résolution.** Activer expose la carte
     (`CardInstance.revealed`, événement `STRUCTURE_REVEALED`) AVANT que
     ses effets ne s'appliquent, et dans cet ordre dans le journal — on ne
     se fait pas frapper par une carte qu'on n'a jamais vue.
  2. **La révélation est définitive.** Si la Marée remasque la Structure
     ensuite, elle reste connue de l'adversaire.
  3. **Le joueur décide.** Une Réaction cachée est toujours facultative :
     fenêtre de réaction, Activer ou Passer, jamais d'office.

  Le SORT DE LA CARTE après coup appartient à son texte : sans mention,
  elle reste en jeu, révélée. Pour qu'elle parte, le texte le dit et la
  définition le réalise (`saborde` ou une destruction sur `self`).
- **Fenêtre d'interception** (`onIncomingDirectAttack`, 21/09/2026) : une
  attaque DIRECTE au Navire s'arrête **à sa déclaration** si le défenseur a
  au moins un piège éligible. L'attaque n'est pas coupée en deux — elle
  n'est pas encore commencée : rien n'a été calculé, aucun bouclier
  consommé. L'état porte `pendingAttack`, la fenêtre s'ouvre chez le
  défenseur, et `dispatch` résout l'attaque dès que la fenêtre se referme
  (seul point que toutes les actions traversent, donc le seul où la reprise
  ne peut pas être oubliée).

  L'effet `cancelIncomingAttack` annule **les seuls dégâts à la coque**. Le
  coup a bien été porté : l'attaquant a dépensé son attaque, son propre
  contrecoup s'applique, et les pertes de Raison qu'il inflige aussi. Le
  montant `incomingAttackDamage` (« autant de dégâts ») rend la Puissance
  de l'attaquant, et non le dégât final — boucliers, plafonds et faiblesse
  de Navire ne s'appliquent pas, puisque le coup n'a pas touché.

  Les autres modificateurs de dégâts directs restent **automatiques**
  (Le Filet qui Respire, Cage de Flottaison, Carcasse Renversée, faiblesse
  de Navire) : ce sont des réductions pures, jamais un désavantage, donc
  rien à décider. Seul ce qui COÛTE quelque chose — une carte qui se
  détruit, se Saborde, ou se révèle — mérite une fenêtre.
- **Fenêtre d'annonce de Marée** (`onTideAnnounced`, 21/09/2026) : même
  geste à l'autre bout du tour. L'étape de Marée est coupée en deux —
  l'**annonce** (décompte, progression, orientation, Anomalies de
  changement) puis l'**application** (dégâts de Tempête, choc des Abysses,
  maladie de la Houle) — et la fenêtre s'intercale entre les deux. L'état
  porte `pendingTideStep` ; l'entame du tour est suspendue en entier : ni
  Raison, ni pioche, ni `TURN_STARTED` tant que le joueur n'a pas répondu.

  L'effet `deferTideEffects` (Ancre de Dérive) repousse à la **fin du tour
  en cours** les seuls effets de TOUR de cette Marée. L'état, lui, a bel et
  bien changé : les capacités `onTideStateEntered` se déclenchent à
  l'heure, et les Structures changent de visibilité comme prévu. La Marée
  n'est pas retenue — c'est sa gifle qui arrive en retard.

  Comme toute fenêtre, elle est refusable : passer garde l'Ancre en jeu et
  laisse la Marée frapper tout de suite. Avant cette passe, le Sabordage et
  le report étaient appliqués d'office dès que la carte était en jeu et
  visible — le moteur décidait à la place du joueur.

## Structure de tour

Appliqué par `game/actions/endTurn.ts`, en deux temps distincts (cadrage
Notion "Moteur de partie — déroulement, Raison & chaînes d'effets",
2026-09-10) :

**A. Fin de tour DU JOUEUR QUI TERMINE** — effets de fin de tour,
défausse forcée (main > 7), puis, en tout dernier, règlement de **SA**
Déraison (dette sous 0 → dégâts d'Ancrage, Raison remise à 0).

**B. Début de tour DU JOUEUR QUI DEVIENT ACTIF** :

1. Vérification des Eaux (tirage de nouvelles Eaux si leur durée est
   épuisée — jamais une carte de deck, toujours tiré par le moteur).
2. **Annonce** de la Marée : décompte de la durée restante, progression
   éventuelle vers l'état suivant (`Calme → Houle → Tempête → Abysses →
   Calme`), orientation, Anomalies de changement. Sur un changement
   d'état, la fenêtre `onTideAnnounced` s'ouvre ici (voir "Fenêtre
   d'annonce de Marée") et **suspend tout ce qui suit**.
3. **Application** de la Marée : malus de l'état courant — voir "Malus
   globaux des Marées" ci-dessous —, capacités d'entrée/sortie d'état,
   expiration des permanents à durée limitée, Structures qui deviennent
   visibles. Une Ancre de Dérive activée à l'étape 2 repousse les seuls
   malus à la fin du tour en cours (`deferredTideEffects`).
4. Récupération naturelle : **+2 Raison**, bornée par le plafond de début
   de partie, et **amputée d'une dette subie** éventuelle (qui est alors
   effacée). La Raison persiste, elle n'est jamais remise à niveau.
5. Pioche d'une carte (deck vide → Jugement de l'Océan, voir plus bas).
6. Phase principale : dégel des unités, réinitialisation des attaques,
   nettoyage des modificateurs temporaires.

Un joueur **n'est plus limité** à une seule action principale par tour
(changement de cadrage 2026-09-10) : jouer une carte, Saborder ou Briser
un Objet peuvent s'enchaîner librement pendant la Phase principale — seule
la Raison disponible (et l'espace sur le plateau) les limite.

### Phases d'un tour

`Phase principale → Phase de combat → Phase principale 2`, chaque passage
par `advancePhase` ; `endTurn` sort de n'importe laquelle. Poser une
carte, Saborder, Briser un Objet et activer une capacité sont possibles
dans **les deux** Phases principales (`isMainPhase`, `assertInMainPhase`) ;
attaquer reste réservé à la Phase de combat. La Phase principale 2 existe
pour pouvoir répondre à ce que le combat vient de révéler — reposer sur un
plateau dégarni, Saborder ce qui s'est exposé, Briser un Objet devenu
utile. Le tour suivant recommence toujours en Phase principale.

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

  L'**Ancrage de départ** est le levier de RYTHME de la partie : une partie
  dure le temps que met le débit de dégâts à vider cette réserve. Porté de
  17/20/24 à **26/30/36** le 21/09/2026 (+50 %), ce qui fait passer la durée
  moyenne de 5,8 à ~10 tours par joueur. Six leviers ont été mesurés sur un
  tournoi complet ; celui-ci écrase les autres, parce que les attaques font
  53 % des dégâts et que rien d'autre ne les ralentit. Valeur NON
  VERROUILLÉE et divergente de Notion, qui porte encore 17/20/24.
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
  Vague de Fortune, Seconde au Visage Pâle, Baleine aux Cicatrices
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
  `processTrigger`/`resolveEffect`/`resolveEnvironment`. **Le Fond Vous
  Regarde ×2 reste à part** : voir "Choix de joueur" ci-dessous.
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
  `game/environment/tide.ts`) : La Gueule Sous la Mer (Créature) / Sept Brasses Plus
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
- Recyclage des doublons : la fonction serveur existe (`recycle_card`,
  barème verrouillé) mais aucune UI ne l'appelle encore.
- Parties serveur sans reprise sur abandon : une partie en ligne ou contre
  bot quittée en cours reste `active` indéfiniment (pas de délai de tour,
  pas d'abandon déclaré).
- Voir "Mécanismes avancés" plus haut pour ce qui reste réellement non
  modélisé (priorité de Garde, pondération des Eaux, bonus d'Équipement
  statiques).

`RULES.MAX_HAND_SIZE` (7) est désormais appliqué : `game/actions/endTurn.ts`
défausse les cartes excédentaires du joueur qui termine son tour, avant de
passer la main, de façon déterministe (depuis le début de la main) — même
principe que la défausse déjà existante liée aux dégâts de Marée
(`game/environment/resolveEnvironment.ts`). Le système de choix de joueur
qui existe désormais (`GameState.pendingChoice`) ne couvre que le cas
binaire fixe déjà décrit dans "Mécanismes avancés" ; un vrai "choisissez
lesquelles défausser" resterait un chantier séparé (choix parmi un nombre
variable de cartes, pas entre deux effets connus d'avance).

Pas encore fait : historique de parties (UI — les données existent dans
`matches`), boutique complète (offres au-delà de l'achat de booster),
recyclage côté client.

## Parties arbitrées côté serveur & information cachée

Toutes les parties qui rapportent quelque chose — en ligne (invitation,
matchmaking) **et contre bot pour un joueur connecté** — sont jouées par le
serveur (`features/matches/matchStore.ts`). Seules les parties locales
(deux joueurs sur le même écran, ou bot hors connexion) tournent dans le
navigateur, et elles ne rapportent jamais rien.

- **État privé.** L'état complet vit dans `match_states`, sans aucune policy
  RLS et hors de la publication Realtime. `matches` ne garde que des
  métadonnées, dont `state_version` : c'est tout ce que Realtime diffuse.
  Quand la version change, le client redemande sa vue (`fetchMatchView`).
- **Vue par joueur** (`toPlayerView`, `game/state/playerView.ts`, testée
  dans `tests/game/playerView.test.ts`) : main adverse, contenu et ordre des
  deux decks, graine du générateur aléatoire et Structures adverses
  invisibles pendant la Marée courante sont masqués — y compris leurs traces
  dans le journal d'événements. La forme de l'état est conservée ; les cartes
  masquées portent `HIDDEN_CARD_ID`, que `getCardDefinition` sait résoudre.
- **Aucune écriture navigateur sur `matches`.** Les policies d'insertion et
  de mise à jour ont été supprimées (un participant pouvait réécrire l'état
  de sa partie avec la clé anon). Création, jonction et coups passent par des
  fonctions Postgres réservées au serveur : `create_active_match()`,
  `activate_waiting_match()`, `commit_match_state()`.
- **Un coup = une version.** `commit_match_state()` n'enregistre un coup que
  s'il a été calculé sur la version courante : deux soumissions simultanées
  ne peuvent pas s'écraser.
- **Un coup est joué au nom de l'appelant.** Le serveur refuse toute action
  dont le `playerId` n'est pas le joueur connecté (avant, rien n'empêchait de
  terminer le tour de son adversaire).
- **Bot.** `startBotMatch()` (`features/bot/actions.ts`) crée la partie ; après
  chaque coup du joueur, `runBotUntilIdle()` (`game/bot/runBotTurn.ts`) fait
  jouer le bot jusqu'à ce qu'il rende la main. Le serveur renvoie chaque état
  intermédiaire, projeté, et le client les rejoue avec un délai pour garder
  un tour du bot lisible carte par carte.
- **Fin de partie.** Constatée dans l'état autoritaire, juste après son
  enregistrement : récompenses (`features/progression/rewards.ts`) et
  progression des quêtes (`features/quests/questService.ts`) pour chaque
  participant humain. Ces fonctions ne sont plus dans des fichiers
  `"use server"` : exportées depuis un tel fichier, elles devenaient des
  Server Actions que n'importe quel navigateur pouvait appeler avec le
  joueur et l'issue de son choix.

## Quêtes

Cadrage : Notion "Catalogue de quêtes — Tidebound" et "Progression joueur"
§9-10. Logique pure et testée dans `game/quests/`
(`tests/game/quests.test.ts`) :

- **Cinq catégories** — Cartes, Parties, Decks, Stats, Marée
  (`QuestCategory`), chacune avec son icône
  (`public/assets/quests/icon-cat-*.webp`). Elles structurent l'écran et
  pilotent le tirage : **les 3 quotidiennes viennent de 3 catégories
  différentes** (« pour éviter les journées répétitives »), avec une seconde
  passe de repli si le catalogue ne le permet pas.
- **Catalogue et calibrage** (`game/quests/catalog.ts`) : 3 quêtes
  quotidiennes et 3 hebdomadaires par joueur, au plus une quête PvP-only par
  période (un joueur solo ne reçoit jamais plusieurs quêtes qu'il ne peut pas
  faire avancer). Chaque quête rapporte **XP et Tides** ; 30 à 50 Tides par
  quotidienne, soit 90 à 150 pour la journée — presque exactement un booster
  (150 Tides). Au moins une hebdomadaire donne un booster.
- **Trois formes d'objectif** : CUMUL (« Jouer 15 Créatures »), SEUIL PAR
  PARTIE (« Jouer 5 Créatures dans une même partie » — la partie rapporte 1
  quand le seuil tombe) et ENSEMBLE (« Jouer avec 2 decks différents »,
  `progress_kind = 'set'`, dont les valeurs distinctes sont mémorisées dans
  `player_quest_progress.progress_meta` et fusionnées en SQL pour que deux
  parties simultanées n'en perdent aucune).
- **Attribution** (`selectQuestsForPeriod`) : déterministe par joueur et par
  période UTC (`d:AAAA-MM-JJ`, `w:<lundi>`), donc idempotente sous accès
  concurrents. `assign_player_quests()` n'écrit que si la période n'a encore
  aucune quête de ce type.
- **Remplacement gratuit** : une quête quotidienne non terminée par jour
  (`pickReplacementQuest`, déterministe lui aussi ; quota tenu par
  `player_quest_rerolls` et consommé dans la même transaction que l'échange).
  Une quête TERMINÉE n'est jamais remplaçable — ce serait rejouer sa
  récompense.
- **Progression** (`computeMatchQuestContribution`) : calculée par le serveur
  depuis le journal d'événements de l'état final. Les objectifs dont le
  moteur n'attribue pas la cause (`DAMAGE` n'a pas de source, `TIDE_ADVANCED`
  non plus) sont crédités via un ACTEUR COURANT — le joueur dont l'action est
  en cours de résolution, remis à zéro à chaque changement de tour. Ce qui
  vient de l'environnement n'est donc crédité à personne, ce qui est voulu.
  `record_match_quest_progress()` applique le tout une seule fois par partie
  (`match_quest_progress`) et respecte `bot_progress_allowed` quête par quête.
- **Réclamation** : écran `/quetes` (onglet « Quêtes » du bandeau) ;
  `claim_quest_reward()` relit montant ET XP en base et empêche d'encaisser
  deux fois. Une quête terminée reste réclamable après la fin de sa période.

La table `quests` est un miroir du catalogue TypeScript, synchronisé par
`npm run seed:cards` (une quête retirée du catalogue est désactivée, pas
supprimée).

## Onboarding, paliers et méta-jeu

Cadrage : Notion "Progression joueur — Tutoriel, XP, Quêtes &
Préconstruits". Tout ce qui suit est PUR et testé
(`tests/game/progression.test.ts`, `tests/game/metaCatalog.test.ts`) ; les
écritures passent par les fonctions Postgres de
`supabase/migrations/..._player_progression_meta.sql`, dont
l'anti-double-claim repose sur des CLÉS PRIMAIRES, jamais sur une
vérification applicative.

**Économie** (`game/economy/`) — **150 Tides = 1 booster Standard**, valeur
verrouillée dont tout le reste dérive (`TIDE_REWARD`). Un compte neuf reçoit
150 Tides et **aucun booster** : celui-ci récompense désormais le tutoriel.

**Tutoriel** (`/tutoriel`, `game/tutorial/`) — proposé à la première
connexion, avec un vrai choix : le faire (1 booster) ou le passer (rien).
C'est une PARTIE guidée contre le bot, pas un diaporama : sept étapes
(`TUTORIAL_STEPS`), chacune un prédicat pur sur l'état réel, qui se valident
quand le joueur fait le geste. Le booster n'est jamais accordé côté client —
`finish_tutorial()` décide, et ne crédite qu'une fois. Dans les deux cas, le
joueur est conduit à la Collection.

**Deck d'emprunt** (§3) — premier deck jouable, gratuit, choisi une seule
fois depuis la Collection. Aucune carte n'est créditée : `deckOwnership()`
répartit les exemplaires entre POSSÉDÉS et PRÊTÉS, à l'exemplaire et non à
la carte distincte, pour que le compteur bouge à chaque booster. Le premier
deck n'est volontairement PAS un déblocage de niveau 1.

**Préconstruits et Jetons** (§4) — `player_progression.precon_tokens`, gagnés
aux niveaux 10/20/30/40/50. Le jeton n'impose aucun deck : l'écran Decks a
trois rayons (Mes decks / Decks d'emprunt / Préconstruits), les préconstruits
verrouillés restent consultables (style, difficulté, mécaniques, courbe,
liste complète, possédé/prêté) et un bouton **Essayer** lance une partie
locale avec le deck entièrement prêté, sans récompense.

**Paliers 1-50** (`game/progression/levelRewards.ts`) — une récompense à
chaque niveau, sans trou, typée (`LevelRewardItem`) pour être exécutable :
Tides, boosters, carte au choix parmi 3, Jeton de Préconstruit, cosmétiques.
Un gros palier au moins tous les 5 niveaux, un Jeton tous les 10 — vérifié
par des tests plutôt que par relecture. `player_level_rewards (user_id,
level)` empêche qu'un palier soit crédité deux fois, même si `level_before`
était périmé.

**XP de partie** (§7) — 25 XP pour une partie terminée, +25 en cas de
victoire, +75 XP et 25 Tides à la première victoire du jour, +50 XP à la
3ᵉ partie de la journée. Protection anti-AFK : une partie sans activité
significative (`MEANINGFUL_ACTIVITY`, lue sur le journal par
`matchActivity()`) ne donne ni Tides, ni bonus, et ne compte pas dans les
3 parties du jour.

**Connexions** (§8) — cycle de 7 escales **non punitif** : l'état persisté
est une ÉTAPE, pas un streak. Rien, dans le schéma, ne permet de la faire
reculer — une absence de trois semaines laisse le joueur exactement où il
s'était arrêté. Une réclamation par jour UTC.

**Exploits** (§10) — permanents, non renouvelables, et ÉVALUÉS depuis les
compteurs persistés plutôt que déclenchés par un événement
(`game/achievements/`). Conséquence voulue : un exploit ajouté plus tard se
débloque tout seul pour les comptes qui remplissent déjà sa condition, et
une synchronisation manquée se rattrape à la suivante.

**Profil** (`/profil`) — niveau, jauge, XP restante, récompense du prochain
niveau, prochaines escales, paliers déjà franchis, cycle de connexion et
exploits, sur une direction « carnet de marin ».

## Progression & boosters

**Progression (XP / niveaux)** — `game/progression/` : logique pure et
testée (`tests/game/progression.test.ts`). La courbe de niveaux et tout le
calibrage (XP par partie, Tides par palier, bonus de première victoire
quotidienne) vivent dans `game/progression/constants.ts`, avec le statut de
chaque valeur : le cadrage Notion verrouille les PRINCIPES (les parties
donnent surtout de l'XP, le bot ne donne jamais de Tide, le farm PvP doit
rester peu rentable) mais aucun nombre. La base ne stocke que `xp_total` et
un cache de `level` — le niveau est toujours dérivé de la courbe, ce qui
permet de recalibrer sans migration.

L'octroi est autoritaire et idempotent : le serveur détecte la fin de partie
(`features/matches/matchStore.ts`), `computeMatchReward()` calcule, et la fonction Postgres
`grant_match_progression()` applique tout en une transaction. La clé
primaire de `match_rewards (match_id, user_id)` garantit qu'une partie ne
peut jamais récompenser deux fois — une double soumission ou une reprise
réseau est sans effet.

**Boosters** — `game/boosters/` : format 8 cartes, pity Abyssal et
protection Abyssale implémentés selon le cadrage verrouillé, en fonctions
pures à RNG déterministe (`tests/game/boosters.test.ts`, dont un test qui
vérifie la garantie du 20e booster sur 40 graines). Le tirage se fait dans
la Server Action ; toutes les écritures passent par `open_booster()`, qui
re-vérifie la possession, le format et relit la rareté depuis `cards` pour
décider du pity. Le client n'envoie qu'un id de booster.

La rareté carte par carte vit dans `game/boosters/cardRarity.ts` (issue de
l'audit de design Notion, mappée par slug) et alimente `cards.rarity` via
`npm run seed:cards`. **Le script refuse de tourner** si une carte du
catalogue n'a pas de rareté explicite, et `tests/game/cardRarity.test.ts`
échoue de même : sans ce garde-fou, une carte ajoutée retombait en `common`
par défaut et tous les boosters devenaient faux en silence. Les six cartes
postérieures à l'audit ont été arbitrées le 2026-09-12 ;
`PROVISIONAL_RARITY_CARD_IDS` est donc vide, et y remettre une entrée fait
volontairement échouer le test jusqu'au prochain arbitrage.

Répartition actuelle du pool (98 cartes) : 28 Communes, 27 Peu communes,
24 Rares, 19 Abyssales — les Abyssales sont nombreuses parce que chaque
variante `*-abyssal` en est une. **Le nombre de cartes d'un palier ne change
pas le taux de drop** (ce sont les poids de slot qui le gouvernent) : sur
5000 ouvertures consécutives, pity inclus, 12,8 % des boosters contiennent
une Abyssale, soit environ une tous les 8 boosters. Les variantes Abyssales
ont leur place dans le pool standard ; elles sont exclues du Mini Booster de
Bienvenue via `booster_definitions.pool_excluded_rarities`, filtré avant le
tirage (`tests/game/boosters.test.ts` vérifie qu'aucune n'en sort même avec
le pity au maximum).

### Récompenses contre bot

Les parties contre bot étant arbitrées côté serveur, leur issue est aussi
fiable qu'en PvP : elles rapportent toujours leur XP (`MATCH_XP.bot*`) et
font avancer les quêtes compatibles bot, sans plafond quotidien (le cadrage
demande d'éviter « un plafond brutal » ; le plafond n'existait que parce que
le navigateur déclarait l'issue).

Reste une **dérogation de développement pour les Tides seulement**, dans
`features/progression/botRewardPolicy.ts` : le cadrage verrouille « 0 Tide
contre bot », mais hors production les parties bot rapportent des Tides
réduites (`DEV_BOT_MATCH_TIDES`) pour tester l'économie en solo.
`MATCH_TIDES.bot*` reste à 0 ; la règle n'est contournée qu'à un endroit, par
le paramètre explicite `allowBotTides`. Désactivée en production par défaut ;
`TIDEBOUND_BOT_REWARDS=on|off` force les deux sens. Le bonus de première
victoire du jour reste strictement PvP.

**Supabase** : schéma étendu par
`supabase/migrations/20260910120000_cards_collection_economy.sql` —
cartes (miroir de `game/cards/sets/core.ts`, synchronisé par
`npm run seed:cards`), decks de base système, decks personnels, collection,
boosters (format 8 cartes verrouillé, pity Abyssal, protection Abyssale),
monnaie interne + historique de transactions, quêtes, onboarding, et une
file de matchmaking (`matchmaking_queue` + fonction Postgres
`claim_matchmaking_opponent()`, esquissées côté serveur dans
`features/matchmaking/actions.ts`) — puis par
`supabase/migrations/20260912200000_progression_and_boosters.sql` :
`player_progression`, `match_rewards`, et les quatre opérations atomiques
`grant_match_progression()`, `purchase_booster()`, `open_booster()`,
`recycle_card()` — puis par
`supabase/migrations/20260913100000_private_match_state.sql` (état de partie
privé, fonctions de parties serveur, cf. "Parties arbitrées côté serveur")
et `supabase/migrations/20260913110000_quests.sql` (quêtes par période,
progression par partie, réclamation). Toutes ces tables ont RLS activé ;
celles qui doivent rester autoritaires côté serveur (collection, boosters,
monnaie, quêtes) n'ont volontairement aucune policy d'écriture pour
`authenticated` — seule une Server Action avec la clé service_role peut y
écrire. `RULES` (`game/rules/constants.ts`) et le moteur restent l'unique
source de vérité pour la RÉSOLUTION d'une partie ; ce schéma sert les
systèmes de méta-jeu (collection, boosters, progression) autour.

Les migrations de progression, d'état de partie privé et de quêtes **n'ont
pas été appliquées** : elles sont validées syntaxiquement (parser
PostgreSQL) mais jamais exécutées, faute de Docker/psql dans
l'environnement de développement utilisé. À appliquer avec
`npx supabase db push`, puis `npm run seed:cards` pour pousser les raretés
et le catalogue de quêtes — sans ce seed, `openBooster()` refuse
explicitement d'ouvrir plutôt que de consommer un booster dans le vide, et
l'écran Quêtes reste vide. **Le code de cette branche suppose la migration
d'état privé appliquée** : sans elle, aucune partie en ligne ou contre bot
connectée ne peut démarrer (`match_states` et les fonctions de partie
n'existent pas).

**PWA** : `public/sw.js` (app shell minimal, stale-while-revalidate sur
`/assets/*`, repli réseau→cache→`public/offline.html` pour la navigation)
est enregistré côté client par `components/ServiceWorkerRegister.tsx`. Reste
à faire : icônes d'app (`manifest.webmanifest` a un tableau `icons` vide —
aucun asset d'icône n'existe encore dans `public/assets/menu/logo`), donc
la PWA n'est pas encore réellement installable.

## Prochaines étapes suggérées

Le bootstrap initial (moteur, UI de plateau, Server Actions, schéma
Supabase, parties en ligne) est loin derrière — voir "État du MVP" et
"Progression & boosters" plus haut pour ce qui existe déjà. Ce qui reste
réellement devant nous :

1. **Appliquer les migrations** (`npx supabase db push`) puis
   `npm run seed:cards`, et jouer une partie en ligne et une partie contre
   bot connectée de bout en bout : état privé, rejeu du bot, récompenses et
   quêtes n'ont été testés qu'en logique pure et en typage, jamais contre une
   vraie base.
2. **Abandon et délai de tour** pour les parties serveur — aujourd'hui une
   partie quittée reste `active` pour toujours.
3. Nettoyage des bonus d'Équipement STATIQUES à la destruction de
   l'Équipement (cf. "Mécanismes avancés") — les bonus dynamiques sont déjà
   corrects, les modificateurs posés une fois pour toutes ne le sont pas.
4. Icônes d'application pour la PWA (`manifest.webmanifest` a un tableau
   `icons` vide) — service worker déjà en place, mais pas réellement
   installable sans elles.
5. Historique de parties (UI — les données existent déjà dans `matches`),
   boutique complète, recyclage côté client.
6. Calibrage des quêtes et de la progression après de vraies sessions de jeu.

## Déploiement

Le projet travaille **directement en production** : `main` est la seule
branche déployée. `vercel.json` désactive donc les déploiements des
branches de travail (`claude/*`) — chaque déploiement, preview comprise,
consomme le quota de "Deployment Storage", et des previews jamais
consultées l'avaient fait exploser (19 Go pour 10 de quota).

Deux conséquences pratiques :

- pousser sur `main` déclenche une mise en production, donc on groupe les
  commits d'un même lot de travail en un seul push plutôt que d'en
  enchaîner un par correction ;
- les images passent par `npm run optimize:images` avant d'être commitées
  (voir `public/assets/README.md`) : elles pèsent dans chaque déploiement.
