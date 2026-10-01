# Tidebound — règles de travail

Projet Next.js 14 (app router) + Supabase + moteur de jeu pur TypeScript. Fichiers en CRLF. Commentaires, textes et identifiants métier en français.

## Commandes de vérification

```bash
npm run typecheck   # tsc --noEmit
npm run lint        # next lint
npm test            # vitest run (toute la suite, ~1 min)
```

Une modification n'est terminée que si les trois passent.

## Couches et sens des dépendances

- `game/` : moteur pur (état, actions, effets, déclencheurs, bot). N'importe jamais `features/`, `app/`, `lib/`. Point d'entrée public : `game/index.ts`.
- `features/<domaine>/` : interface et services d'un domaine (match, decks, market, progression…). Les server actions vivent dans `features/<domaine>/actions.ts` ou `*Service.ts` (`"use server"` : exports async seulement).
- `app/` : routes fines, qui composent des `features`.
- `lib/supabase/` : clients et types générés. La clé `service_role` ne sort jamais d'un fichier serveur.
- `supabase/migrations/` : migrations appliquées À LA MAIN par le propriétaire du projet ; en cas de doute, sonder la base réelle plutôt que supposer qu'une migration est passée.
- `tests/` : vitest, miroir de `game/` et `features/`.

## Cartes : ajouter ou modifier une carte

Le TEXTE de la carte est la source de vérité. Il vient de la page Notion « Catalogue de cartes » (et de la page de lot) et il est copié tel quel dans `text`. La définition doit réaliser ce texte, ni plus ni moins.

1. **Données, pas de code spécifique.** Une carte s'exprime avec les primitives existantes de `game/cards/types.ts` et `game/effects/types.ts` (`abilities`, `onPlayEffects`, `onBreakEffects`, champs de données). Si une primitive manque, on l'ajoute au moteur de façon GÉNÉRIQUE (documentée dans les types, avec son test), jamais en branchant un `if (cardId === …)`.
2. **Vocabulaire.** La zone s'appelle le **Cimetière** (« défausser » reste le verbe). Le mot-clé « peut attaquer dès son arrivée » s'appelle **Pied marin** (jamais « Ruée »). « Une fois par tour » → `oncePerTurnKey` ; « la première fois que… » sans « à chaque tour » → `onceEver` (un seul usage pour toute la partie) ; « vous pouvez » → `mode: "optional"` (ou une exception motivée) ; « Sabordage : » → `onSaborde` ; « Brisez cet Objet » → `onBreakEffects` ; « Équipez une Structure » → `equipTargetTypes` ; « si elle est visible » sur une capacité → `condition: { selfVisible: true }` ; « un autre X » restreint à votre plateau → le texte le dit (« que vous contrôlez »).
3. **Le joueur décide, jamais le moteur.** Aucun effet n'est appliqué d'office dès qu'il suppose une décision : une capacité déclenchée qui vise une unité désignée (`chosenUnit`) est `mode: "optional"` et passe par une fenêtre de réaction où le joueur pointe sa cible — le moteur ne choisit jamais à sa place. Le joueur peut toujours refuser : passer la fenêtre, ou « Ne rien appliquer » sur un « choisissez : A ou B ». Seul un texte qui IMPOSE un choix (Anomalie « perdez X Raison OU subissez X dégâts ») n'est pas refusable.
4. **Durées.** « Durée : N tours » sur une carte compte les N tours de SON contrôleur (décompte à l'entame de son tour) ; la durée d'un état de Marée, elle, se compte en tours de table.
5. **Conformité automatique.** `tests/game/cardConformity.test.ts` relit chaque texte et vérifie la structure de la définition. Il doit passer. Un écart assumé s'inscrit dans `EXCEPTIONS` avec son motif ; un écart sans motif est refusé.
6. **Test de comportement.** Toute capacité non triviale a un test dans `tests/game/` qui joue la carte via `dispatch` et vérifie l'effet observable (Raison, Ancrage, modificateurs, zone, fenêtre de réaction, choix en attente).
7. **Identifiants figés.** Un `id` de carte n'est jamais renommé : il est semé en base (`npm run seed:cards`) et référencé par les collections et decks des joueurs.
8. **Notion suit le code.** Si un texte change (décision de design), la ligne du Catalogue Notion et de la page de lot sont mises à jour dans la même session.
9. **Pas de rééquilibrage silencieux.** Coûts, stats et `maxCopies` viennent de Notion ; une divergence se signale, elle ne se corrige pas d'autorité.

## Assets

Jamais de PNG commité : déposer, ranger en kebab-case par famille, puis `node scripts/optimizeImages.mjs --delete-sources` (WebP).

Seule exception : les icônes d'application et favicons de `public/icons/` (+ `public/favicon.ico`), refabriqués par `npm run icons` depuis `public/assets/menu/logo/icon-tidebound.webp` — la SOURCE, elle, suit la règle. iOS n'accepte pas le WebP pour `apple-touch-icon`, une icône de manifeste en WebP reste refusée par certains vérificateurs d'installabilité, et un `.ico` n'existe qu'en PNG/BMP.

## PWA

- Manifeste : `public/manifest.webmanifest` (icônes 192/512 + maskable, raccourcis, `orientation: landscape`). Métadonnées, favicons, icône iOS et `viewport-fit: cover` : `app/layout.tsx`.
- Paysage imposé sur mobile : manifeste, `OrientationLock` (API d'orientation, Android installé), et le voile CSS `OrientationGate` en dernier recours — iOS n'honore ni l'un ni l'autre.
- Zone sûre : `--tb-safe-top/right/bottom/left` (`app/globals.css`) sont les SEULES lectures de `env(safe-area-inset-*)` hors plateau ; la scène de partie a les siennes (`features/match/table/Table.module.css`). Un écran plein cadre s'écarte avec ces variables, jamais avec une marge fixe.
- Hauteurs plein écran en `dvh`, jamais `vh` : sur iOS, `100vh` déborde sous la barre d'adresse.
- Mise à jour : `public/sw.js` ne prend PAS la main tout seul ; `components/ServiceWorkerRegister.tsx` détecte le worker en attente, propose « Recharger », et la page se recharge sur `controllerchange`. Changer la stratégie de cache demande de monter `CACHE_VERSION`.
