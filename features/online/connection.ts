import { useEffect, useState } from "react";

/**
 * ÉTAT DE LA CONNEXION D'UNE PARTIE EN LIGNE — la sienne, et celle de
 * l'adversaire.
 *
 * Deux silences rendaient une partie en ligne opaque (12/10/2026) :
 *
 *  - **L'adversaire parti.** Il ferme son onglet, perd le réseau : rien ne le
 *    disait. Le joueur resté voyait « En attente de l'adversaire… » pendant
 *    les trois, puis deux, puis une minute du délai dégressif, sans savoir
 *    s'il réfléchissait ou s'il avait quitté la table. On suit donc sa
 *    PRÉSENCE sur le canal Realtime de la partie (Supabase Presence) : un
 *    écran ouvert sur la table s'y annonce, et la socket qui tombe l'en
 *    retire. Ce n'est QUE de l'affichage — la présence est déclarée par le
 *    navigateur, elle ne décide de rien : seul le délai de tour, constaté
 *    par le serveur, fait avancer une table délaissée.
 *
 *  - **Soi-même hors ligne.** Dans le métro, les rafraîchissements échouaient
 *    l'un après l'autre et l'écran finissait par recharger la page — hors
 *    ligne, donc sur une page d'erreur, la partie perdue de vue. Hors ligne,
 *    on ne recharge plus : on attend le réseau (`useResyncOnReturn` redemande
 *    la vue à son retour), et un coup joué entre-temps attend avec lui au
 *    lieu d'échouer (`waitUntilOnline`).
 */

/** Ce que l'écran sait de l'adversaire : là, parti, ou pas encore de quoi le dire. */
export type OpponentPresence = "present" | "away" | "unknown";

/**
 * Délai de GRÂCE avant d'annoncer l'adversaire parti. Une socket se coupe et
 * se rétablit en quelques secondes au moindre changement d'antenne ou de
 * Wi-Fi : annoncer un départ à chaque hoquet serait faux et inquiétant.
 */
export const PRESENCE_GRACE_MS = 10_000;

export interface PresenceInput {
  /** L'adversaire est-il annoncé sur le canal à cet instant ? */
  present: boolean;
  /** Depuis quand on suit la présence (premier `sync` reçu) — `null` tant qu'on ne la suit pas. */
  watchingSince: number | null;
  /** Dernier instant où l'adversaire était annoncé — `null` s'il ne l'a jamais été depuis qu'on regarde. */
  lastSeenAt: number | null;
  now: number;
  graceMs?: number;
}

/**
 * Verdict de présence, et dans combien de temps le revoir (`recheckInMs`)
 * si rien ne bouge d'ici là — la grâce qui court finit par trancher.
 *
 * Un adversaire jamais vu depuis l'ouverture de la table est parti lui
 * aussi, une fois la grâce écoulée : c'est le joueur qui revient sur une
 * partie que l'autre a déjà quittée.
 */
export function presenceVerdict(input: PresenceInput): { status: OpponentPresence; recheckInMs?: number } {
  const grace = input.graceMs ?? PRESENCE_GRACE_MS;
  if (input.present) return { status: "present" };
  if (input.watchingSince === null) return { status: "unknown" };
  const since = Math.max(input.watchingSince, input.lastSeenAt ?? -Infinity);
  const left = grace - (input.now - since);
  if (left > 0) return { status: input.lastSeenAt === null ? "unknown" : "present", recheckInMs: left };
  return { status: "away" };
}

/**
 * Identifiants annoncés sur le canal, d'après `channel.presenceState()`.
 * Chaque écran s'annonce sous la clé de son joueur (`presence.key`) : les
 * clés SONT les joueurs présents. Une clé sans annonce (tous ses onglets
 * fermés) ne compte pas.
 */
export function presentUserIds(presenceState: Record<string, unknown[] | undefined>): Set<string> {
  return new Set(Object.entries(presenceState).flatMap(([key, metas]) => (metas && metas.length > 0 ? [key] : [])));
}

/** Le navigateur se dit-il hors ligne ? `false` dans le doute (rendu serveur, API absente). */
export function isOffline(): boolean {
  return typeof navigator !== "undefined" && navigator.onLine === false;
}

/**
 * Se résout au retour du réseau — tout de suite si on n'est pas hors ligne.
 * Un coup joué hors ligne n'est jamais parti : l'envoyer au retour est sans
 * risque de doublon, là où le renvoyer après un échec en vol en serait un.
 */
export function waitUntilOnline(): Promise<void> {
  if (!isOffline()) return Promise.resolve();
  return new Promise((resolve) => {
    const onOnline = () => {
      window.removeEventListener("online", onOnline);
      resolve();
    };
    window.addEventListener("online", onOnline);
  });
}

/** `true` tant que le navigateur se dit hors ligne. */
export function useOffline(): boolean {
  const [offline, setOffline] = useState(false);
  useEffect(() => {
    const update = () => setOffline(isOffline());
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);
  return offline;
}

/**
 * Présence de l'adversaire, grâce comprise. `present` : ce que dit le canal
 * à cet instant, ou `null` tant qu'il n'a rien dit (canal pas encore
 * synchronisé, partie contre le bot).
 */
export function useOpponentPresence(present: boolean | null): OpponentPresence {
  const [watchingSince, setWatchingSince] = useState<number | null>(null);
  const [lastSeenAt, setLastSeenAt] = useState<number | null>(null);
  const [, setTick] = useState(0);

  useEffect(() => {
    if (present === null) return;
    setWatchingSince((since) => since ?? Date.now());
    // Vu à l'instant — et, à son départ, vu pour la dernière fois à l'instant : la grâce part de là.
    setLastSeenAt((seen) => (present ? Date.now() : seen === null ? null : Date.now()));
  }, [present]);

  const verdict = presenceVerdict({ present: present === true, watchingSince, lastSeenAt, now: Date.now() });
  useEffect(() => {
    if (verdict.recheckInMs === undefined) return;
    const id = setTimeout(() => setTick((tick) => tick + 1), verdict.recheckInMs + 50);
    return () => clearTimeout(id);
  }, [verdict.recheckInMs, verdict.status]);

  return present === null ? "unknown" : verdict.status;
}
