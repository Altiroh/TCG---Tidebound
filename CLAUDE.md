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
2. **Vocabulaire.** La zone s'appelle le **Cimetière** (« défausser » reste le verbe). Le mot-clé « peut attaquer dès son arrivée » s'appelle **Pied marin** (jamais « Ruée »). « Une fois par tour » → `oncePerTurnKey` ; « la première fois que… » sans « à chaque tour » → `onceEver` ; « vous pouvez » → `mode: "optional"` (ou une exception motivée) ; « Sabordage : » → `onSaborde` ; « Brisez cet Objet » → `onBreakEffects` ; « Équipez une Structure » → `equipTargetTypes`.
3. **Conformité automatique.** `tests/game/cardConformity.test.ts` relit chaque texte et vérifie la structure de la définition. Il doit passer. Un écart assumé s'inscrit dans `EXCEPTIONS` avec son motif ; un écart sans motif est refusé.
4. **Test de comportement.** Toute capacité non triviale a un test dans `tests/game/` qui joue la carte via `dispatch` et vérifie l'effet observable (Raison, Ancrage, modificateurs, zone, fenêtre de réaction, choix en attente).
5. **Identifiants figés.** Un `id` de carte n'est jamais renommé : il est semé en base (`npm run seed:cards`) et référencé par les collections et decks des joueurs.
6. **Notion suit le code.** Si un texte change (décision de design), la ligne du Catalogue Notion et de la page de lot sont mises à jour dans la même session.
7. **Pas de rééquilibrage silencieux.** Coûts, stats et `maxCopies` viennent de Notion ; une divergence se signale, elle ne se corrige pas d'autorité.

## Assets

Jamais de PNG commité : déposer, ranger en kebab-case par famille, puis `node scripts/optimizeImages.mjs --delete-sources` (WebP).
