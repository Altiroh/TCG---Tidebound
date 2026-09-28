/**
 * Faut-il proposer « Une partie t'attend — Reprendre » pour cette partie ?
 *
 * Le bandeau lisait la seule ligne `matches` (statut `waiting`/`active`),
 * sans regarder l'état de jeu : une partie contre le bot laissée en plan
 * restait « en cours » pour toujours, et un état manquant, déjà terminé ou
 * illisible (ancienne version du moteur) ramenait sur une table morte —
 * d'où un bandeau qui mentait (28/09/2026).
 *
 * Verdicts :
 *  - `resume` : la partie se reprend vraiment ;
 *  - `close` : elle ne se reprendra jamais — on la ferme (`abandoned`) ;
 *  - `hide` : pas à proposer, mais on n'y touche pas (terminée en jeu alors
 *    que la ligne dit encore « active » : la fin se règle par son propre
 *    chemin, avec ses récompenses).
 */
export type ResumeVerdict = "resume" | "close" | "hide";

/** Une table contre le bot sans un coup depuis ce délai est tenue pour abandonnée. */
export const BOT_MATCH_IDLE_MS = 12 * 60 * 60 * 1000;
/** Une invitation que personne n'a rejointe expire au bout de ce délai. */
export const WAITING_MATCH_IDLE_MS = 24 * 60 * 60 * 1000;

export interface ResumeCandidate {
  mode: "private_invite" | "matchmaking" | "bot";
  status: "waiting" | "active";
  /** Dernière écriture de la ligne (`matches.updated_at`, ISO). */
  updatedAt: string;
}

/**
 * `game` : l'état de jeu tel que le serveur le relit — `"missing"` (pas de
 * `match_states`), `"broken"` (illisible), ou son statut.
 */
export function resumeVerdict(match: ResumeCandidate, game: "missing" | "broken" | "active" | "finished" | string, now: number): ResumeVerdict {
  const idle = now - Date.parse(match.updatedAt);
  if (match.status === "waiting") {
    // Une invitation n'a pas encore d'état de jeu : seul l'âge compte.
    return Number.isFinite(idle) && idle > WAITING_MATCH_IDLE_MS ? "close" : "resume";
  }
  if (game === "missing" || game === "broken") return "close";
  if (game !== "active") return "hide";
  if (match.mode === "bot" && Number.isFinite(idle) && idle > BOT_MATCH_IDLE_MS) return "close";
  return "resume";
}
