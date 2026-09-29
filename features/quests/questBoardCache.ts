import { fetchQuestBoard, type QuestBoard } from "@/features/quests/actions";
import { fetchVoyageBoard, type VoyageBoard } from "@/features/quests/voyageActions";

/**
 * LECTURES DU JOURNAL DE BORD, partagées et dédoublonnées.
 *
 * L'onglet Quêtes du profil se monte et se démonte à chaque changement
 * d'onglet : sans mémoire, chaque passage relisait tout et remontrait
 * l'attente. Ici, une lecture en route est partagée, et une lecture
 * récente (moins de `FRESH_FOR_MS`) est rendue telle quelle — un aller-retour
 * Profil → Quêtes → Exploits → Quêtes n'en fait qu'une.
 *
 * Ce qui est gardé ne vit que le temps de l'écran profil : `ProfileView`
 * l'oublie en se démontant (`forgetQuestBoards`), si bien qu'un compte
 * suivant ne peut jamais voir, même un instant, le journal du précédent.
 * Rien n'est gardé d'un visiteur déconnecté.
 */

const FRESH_FOR_MS = 30_000;

interface Cached<T> {
  /** Dernière valeur lue (jamais celle d'un visiteur déconnecté). */
  peek: () => T | null;
  /** Valeur récente ou lecture en route ; `force` : relecture obligatoire (après une réclamation). */
  load: (force?: boolean) => Promise<T>;
  forget: () => void;
}

function cached<T>(read: () => Promise<T>, keep: (value: T) => boolean): Cached<T> {
  let value: T | null = null;
  let readAt = 0;
  let inflight: Promise<T> | null = null;
  // Incrémentée par `forget` : une lecture partie avant l'oubli ne réécrit pas le cache.
  let generation = 0;

  return {
    peek: () => value,
    load(force = false) {
      if (!force && value !== null && Date.now() - readAt < FRESH_FOR_MS) return Promise.resolve(value);
      if (!force && inflight) return inflight;
      const started = generation;
      const request = read().then((result) => {
        if (started === generation) {
          value = keep(result) ? result : null;
          readAt = Date.now();
        }
        return result;
      });
      inflight = request;
      void request
        .finally(() => {
          if (inflight === request) inflight = null;
        })
        .catch(() => undefined);
      return request;
    },
    forget() {
      generation += 1;
      value = null;
      readAt = 0;
      inflight = null;
    },
  };
}

/** Quêtes du jour et de la semaine (avec le quota de remplacements). */
export const questBoardCache = cached<QuestBoard>(fetchQuestBoard, (board) => board.isSignedIn && !board.unavailable);

/**
 * Traversées : une seule requête (`fetchVoyageBoard`), c'est elle que
 * l'écran profil lit d'avance — les quêtes, elles, arrivent déjà avec le
 * profil (`ProfileSummary.quests`).
 */
export const voyageBoardCache = cached<VoyageBoard>(fetchVoyageBoard, (board) => board.available);

/** Lecture d'avance des Traversées, sans attendre ni signaler d'échec. */
export function preloadVoyageBoard(): void {
  voyageBoardCache.load().catch(() => undefined);
}

/** En quittant l'écran profil (ou à la déconnexion). */
export function forgetQuestBoards(): void {
  questBoardCache.forget();
  voyageBoardCache.forget();
}
