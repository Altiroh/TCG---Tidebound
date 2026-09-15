import { enumerateCandidateActions } from "@/game/bot/enumerateActions";
import { evaluateState } from "@/game/bot/evaluateState";
import { dispatch } from "@/game/engine";
import type { PlayerAction } from "@/game/actions/types";
import type { GameState, PlayerId } from "@/game/state/types";

/**
 * RECHERCHE DE TOUR — ce qui sépare « difficile » des autres difficultés.
 *
 * Les trois difficultés partageaient la même décision gloutonne à un coup :
 * jouer l'action dont l'état RÉSULTANT note le mieux. « Difficile » se
 * contentait d'en prendre le maximum au lieu d'un tirage au sort. Un tel bot
 * ne peut pas :
 *   - enchaîner deux cartes dont seule la combinaison est bonne ;
 *   - refuser un échange qui paie maintenant et coûte au tour suivant ;
 *   - voir qu'il laisse passer la contre-attaque qui le tue.
 *
 * Ici, le bot explore des SUITES d'actions jusqu'à la fin de son tour, puis
 * évalue la position APRÈS la meilleure réponse de l'adversaire. Un coup
 * n'est donc plus jugé sur ce qu'il rapporte, mais sur ce qu'il laisse.
 *
 * Recherche en faisceau plutôt qu'exhaustive : le facteur de branchement
 * mesuré est d'environ 6 coups légaux (jusqu'à 34), et un tour compte
 * plusieurs actions — l'arbre complet serait hors de portée du temps de
 * réponse attendu, alors qu'un faisceau étroit garde l'essentiel.
 */

export interface SearchOptions {
  /** Suites conservées à chaque palier. Plus large = plus fort, plus lent. */
  beamWidth: number;
  /** Actions explorées d'affilée dans le tour du bot. */
  maxDepth: number;
  /** Actions simulées pour la réponse de l'adversaire. 0 = pas de réponse simulée. */
  opponentReplyDepth: number;
}

/**
 * Avance qu'une suite commençant par un Sabordage doit prendre sur la
 * meilleure des autres pour être retenue. Détruire sa propre carte ne se
 * fait pas pour un gain marginal.
 */
const SCUTTLE_MARGIN = 3;

export const DEFAULT_SEARCH: SearchOptions = {
  beamWidth: 8,
  maxDepth: 12,
  opponentReplyDepth: 14,
};

interface Line {
  state: GameState;
  /** Première action de la suite — la seule qui sera réellement jouée. */
  first: PlayerAction;
  /** Note statique, pour élaguer le faisceau en cours de route. */
  score: number;
  /** `true` quand le bot n'a plus la main dans cette suite. */
  closed: boolean;
}

/** Le bot a-t-il encore quelque chose à décider dans cet état ? */
function stillActing(state: GameState, playerId: PlayerId): boolean {
  return (
    state.status === "active" &&
    (state.activePlayerId === playerId ||
      state.pendingReaction?.awaitingPlayerId === playerId ||
      state.pendingChoice?.playerId === playerId)
  );
}

/**
 * Meilleure action immédiate selon la seule évaluation statique — le modèle
 * d'adversaire, et le repli quand la recherche n'a rien à départager.
 *
 * Volontairement glouton : il sert à estimer la riposte, pas à la jouer. Un
 * adversaire modélisé par une recherche complète ferait exploser le coût
 * sans rendre le bot sensiblement plus fort.
 */
export function greedyAction(state: GameState, playerId: PlayerId): PlayerAction | null {
  let best: { action: PlayerAction; score: number } | null = null;

  for (const action of enumerateCandidateActions(state, playerId)) {
    const result = dispatch(state, action);
    if (!result.ok) continue;
    const score = evaluateState(result.state, playerId);
    if (!best || score > best.score) best = { action, score };
  }

  return best?.action ?? null;
}

/**
 * Termine le tour du bot gloutonnement, quand la recherche s'est arrêtée
 * avant la fin (`maxDepth` atteint).
 *
 * Indispensable à la COMPARABILITÉ des suites. Sans ça, une suite encore
 * ouverte était notée sans qu'aucune riposte ne lui soit opposée — puisque
 * l'adversaire n'a pas encore la main — là où une suite terminée subissait
 * tout le tour adverse. Les longues suites inachevées paraissaient donc
 * systématiquement meilleures, et le bot les préférait pour une raison qui
 * n'avait rien de stratégique.
 */
function finishOwnTurn(state: GameState, playerId: PlayerId, depth: number): GameState {
  let current = state;
  for (let i = 0; i < depth; i += 1) {
    if (!stillActing(current, playerId)) break;
    const action = greedyAction(current, playerId);
    if (!action) break;
    const result = dispatch(current, action);
    if (!result.ok) break;
    if (result.state === current) break;
    current = result.state;
  }
  return current;
}

/**
 * Déroule la riposte de l'adversaire, gloutonnement, et rend l'état obtenu.
 *
 * C'est ce passage qui donne sa dureté au bot : une suite qui laisse le
 * Navire à découvert est notée APRÈS que l'adversaire en a profité, pas
 * avant. Sabordages gratuits, attaques suicidaires et bloqueurs abandonnés
 * s'effondrent ici d'eux-mêmes, sans règle dédiée à écrire pour chacun.
 */
function afterOpponentReply(state: GameState, playerId: PlayerId, depth: number): GameState {
  const opponent = state.players.find((p) => p.id !== playerId);
  if (!opponent || depth <= 0) return state;

  let current = state;
  for (let i = 0; i < depth; i += 1) {
    if (current.status !== "active") break;
    if (!stillActing(current, opponent.id)) break;
    const action = greedyAction(current, opponent.id);
    if (!action) break;
    const result = dispatch(current, action);
    if (!result.ok) break;
    // Aucune progression : on s'arrête plutôt que de boucler.
    if (result.state === current) break;
    current = result.state;
  }

  return current;
}

/**
 * Choisit l'action du bot en explorant son tour jusqu'au bout, puis la
 * riposte de l'adversaire.
 *
 * Renvoie `null` seulement si aucun coup légal n'existe — l'appelant
 * termine alors le tour.
 *
 * Entièrement DÉTERMINISTE : aucun tirage au sort, et les égalités sont
 * tranchées par l'ordre d'énumération. C'est ce qu'on attend d'un adversaire
 * « implacable » — il ne se trompe pas par accident, et deux parties
 * identiques se jouent pareil.
 */
export function searchBestAction(
  state: GameState,
  playerId: PlayerId,
  options: SearchOptions = DEFAULT_SEARCH
): PlayerAction | null {
  // Palier initial : une suite par action légale.
  let frontier: Line[] = [];
  const closed: Line[] = [];

  for (const action of enumerateCandidateActions(state, playerId)) {
    const result = dispatch(state, action);
    if (!result.ok) continue;
    const line: Line = {
      state: result.state,
      first: action,
      score: evaluateState(result.state, playerId),
      closed: !stillActing(result.state, playerId),
    };
    (line.closed ? closed : frontier).push(line);
  }

  if (frontier.length === 0 && closed.length === 0) return null;

  // Élagage dès le premier palier : inutile de prolonger vingt suites dont
  // les trois quarts partent déjà mal.
  frontier = topLines(frontier, options.beamWidth);

  for (let depth = 1; depth < options.maxDepth && frontier.length > 0; depth += 1) {
    const next: Line[] = [];

    for (const line of frontier) {
      let extended = false;

      for (const action of enumerateCandidateActions(line.state, playerId)) {
        const result = dispatch(line.state, action);
        if (!result.ok) continue;
        if (result.state === line.state) continue;
        extended = true;
        const child: Line = {
          state: result.state,
          first: line.first,
          score: evaluateState(result.state, playerId),
          closed: !stillActing(result.state, playerId),
        };
        (child.closed ? closed : next).push(child);
      }

      // Suite qu'on ne peut plus prolonger : elle reste candidate telle
      // quelle, sinon on perdrait une ligne parfaitement valable.
      if (!extended) closed.push({ ...line, closed: true });
    }

    frontier = topLines(next, options.beamWidth);
  }

  // Les suites encore ouvertes au bout de `maxDepth` restent candidates :
  // le bot finira son tour, la recherche a seulement cessé de l'anticiper.
  const candidates = [...closed, ...frontier];
  if (candidates.length === 0) return null;

  // Note FINALE : après la riposte. C'est elle qui décide, pas la note
  // statique qui n'a servi qu'à élaguer.
  //
  // Un SABORDAGE doit en plus être franchement gagnant, pas gagnant d'un
  // cheveu (`SCUTTLE_MARGIN`) : détruire sa propre carte est sans retour,
  // et une recherche qui tranche à 0,3 point près sabordera régulièrement
  // pour un gain que personne ne voit. C'est la seule préférence de STYLE
  // de cette recherche, et elle est là parce qu'un bot qui se saborde a
  // l'air bête même quand il a mathématiquement raison.
  let best: { line: Line; score: number } | null = null;
  for (const line of topLines(candidates, options.beamWidth * 2)) {
    // Toutes les suites sont ramenées au MÊME point de comparaison : fin du
    // tour du bot, puis riposte de l'adversaire.
    const ownTurnDone = line.closed ? line.state : finishOwnTurn(line.state, playerId, options.maxDepth);
    const settled = afterOpponentReply(ownTurnDone, playerId, options.opponentReplyDepth);
    const raw = evaluateState(settled, playerId);
    const score = line.first.type === "saborder" ? raw - SCUTTLE_MARGIN : raw;
    if (!best || score > best.score) best = { line, score };
  }

  return best?.line.first ?? candidates[0]!.first;
}

/**
 * Les `width` meilleures suites — mais jamais toutes issues du même premier
 * coup.
 *
 * Un faisceau classique se remplit volontiers des descendants d'UNE seule
 * ouverture : celle qui note le mieux tout de suite. Les autres meurent au
 * premier palier et ne sont jamais développées — alors que c'est précisément
 * le premier coup, et lui seul, que le bot va jouer. Un coup de préparation
 * (poser la carte qui rendra la suivante dévastatrice) note mal sur le coup
 * et disparaissait donc toujours avant d'avoir payé.
 *
 * Chaque premier coup garde donc au moins une suite vivante, et le reste du
 * faisceau va aux meilleures, d'où qu'elles viennent. À note égale l'ordre
 * d'énumération l'emporte (`sort` est stable) : la recherche reste
 * déterministe.
 */
function topLines(lines: Line[], width: number): Line[] {
  if (lines.length <= width) return lines;

  const ranked = [...lines].sort((a, b) => b.score - a.score);
  const kept: Line[] = [];
  const seenFirst = new Set<PlayerAction>();

  // Premier tour de table : la meilleure suite de CHAQUE premier coup.
  for (const line of ranked) {
    if (seenFirst.has(line.first)) continue;
    seenFirst.add(line.first);
    kept.push(line);
    if (kept.length >= width) return kept;
  }

  // Le reste du faisceau va aux meilleures suites encore disponibles.
  for (const line of ranked) {
    if (kept.includes(line)) continue;
    kept.push(line);
    if (kept.length >= width) break;
  }

  return kept;
}
