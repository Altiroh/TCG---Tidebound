import { getCardDefinition, type GameEvent, type GameState, type PlayerId } from "@/game";
import { findInstanceCardId, formatEvent } from "@/features/match/formatEvent";

/** Ce qui a mis fin à la partie, en mots — pour le laisser VOIR avant l'écran de fin. */
export interface FinalBlow {
  /** « Coup fatal », « Abandon », « Temps écoulé »… */
  title: string;
  /** La phrase qui dit QUI a frappé, et COMMENT. */
  line: string;
  /** Dégâts du dernier coup, s'il y en a un (affichés en grand). */
  amount?: number;
  /** Le joueur qui a sombré — absent en cas de match nul. */
  loserId?: PlayerId;
  /** La fin vient d'un coup porté (vs. abandon, délai) : on la montre plus longtemps. */
  struck: boolean;
}

function cardLabel(cardId: string | undefined): string | null {
  if (!cardId) return null;
  try {
    return getCardDefinition(cardId).name;
  } catch {
    return null;
  }
}

/**
 * Lit le journal à rebours depuis `GAME_ENDED` : le dernier coup porté au
 * Navire vaincu, et d'où il venait (attaquant, carte ou capacité de Navire).
 * Tout vient de l'état final — rien à garder pendant la partie.
 */
export function describeFinalBlow(state: GameState, playerLabel: (playerId?: string) => string): FinalBlow | null {
  if (state.status !== "finished") return null;
  const log = state.eventLog;
  const endIndex = log.map((event) => event.type).lastIndexOf("GAME_ENDED");
  const ended = endIndex >= 0 ? (log[endIndex] as Extract<GameEvent, { type: "GAME_ENDED" }>) : undefined;
  const loserId = ended?.winnerId ? state.players.find((p) => p.id !== ended.winnerId)?.id : undefined;

  if (ended?.reason === "concede" || ended?.reason === "timeout") {
    return {
      title: ended.reason === "concede" ? "Abandon" : "Temps écoulé",
      line: formatEvent(state, ended, playerLabel),
      loserId,
      struck: false,
    };
  }

  // Le dernier coup au Navire vaincu, et ce qui l'a porté.
  const before = endIndex >= 0 ? log.slice(0, endIndex) : log;
  let fatalIndex = -1;
  for (let i = before.length - 1; i >= 0; i -= 1) {
    const event = before[i]!;
    if (event.type === "DAMAGE" && event.targetPlayerId && (!loserId || event.targetPlayerId === loserId)) {
      fatalIndex = i;
      break;
    }
    if (event.type === "TURN_STARTED") break;
  }

  if (fatalIndex < 0) {
    const deraison = [...before].reverse().find((event) => event.type === "DERAISON_SETTLED");
    return {
      title: ended?.reason === "oceanJudgment" ? "Jugement de l'Océan" : "Le Navire sombre",
      line: deraison ? formatEvent(state, deraison, playerLabel) : ended ? formatEvent(state, ended, playerLabel) : "La partie est terminée.",
      loserId,
      struck: Boolean(deraison),
    };
  }

  const fatal = before[fatalIndex] as Extract<GameEvent, { type: "DAMAGE" }>;
  const victim = playerLabel(fatal.targetPlayerId);
  let source: string | null = null;

  if (fatal.combat === "strike") {
    for (let i = fatalIndex - 1; i >= 0; i -= 1) {
      const event = before[i]!;
      if (event.type === "ATTACK") {
        source = cardLabel(findInstanceCardId(state, event.attackerInstanceId));
        break;
      }
    }
    if (source) return { title: "Coup fatal", line: `${source} frappe le Navire de ${victim}.`, amount: fatal.amount, loserId, struck: true };
  }

  if (fatal.origin?.instanceId) source = cardLabel(findInstanceCardId(state, fatal.origin.instanceId));
  if (!source) {
    for (let i = fatalIndex - 1; i >= 0; i -= 1) {
      const event = before[i]!;
      if (event.type === "SHIP_ABILITY_FIRED" || event.type === "SHIP_ABILITY_ACTIVATED") {
        source = event.abilityName;
        break;
      }
      if (event.type === "PLAY_CARD") {
        source = cardLabel(event.cardId);
        break;
      }
      if (event.type === "TURN_STARTED") break;
    }
  }
  if (fatal.cause === "tide" && !source) source = "La Marée";

  return {
    title: "Coup fatal",
    line: source ? `${source} achève le Navire de ${victim}.` : `Le Navire de ${victim} sombre.`,
    amount: fatal.amount,
    loserId,
    struck: true,
  };
}
