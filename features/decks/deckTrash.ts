/**
 * « Récemment supprimés » — la corbeille des decks personnels.
 *
 * Supprimer un deck le DATE (`player_decks.deleted_at`) au lieu de
 * l'effacer : pendant `DECK_TRASH_RETENTION_DAYS`, il reste visible dans
 * son rayon de l'écran Decks, restaurable d'un clic ou effaçable pour de
 * bon après confirmation. Passé ce délai, l'application l'efface à la
 * prochaine ouverture de la liste (`listPlayerDecks`). Partagé entre le
 * serveur (actions) et l'écran (compte à rebours) pour que les deux
 * racontent le même délai.
 */
export const DECK_TRASH_RETENTION_DAYS = 30;

const DAY_MS = 24 * 60 * 60 * 1000;

/** Instant avant lequel un deck à la corbeille est bon pour l'effacement définitif. */
export function trashPurgeCutoff(now: Date = new Date()): Date {
  return new Date(now.getTime() - DECK_TRASH_RETENTION_DAYS * DAY_MS);
}

/** Jours entiers restants avant l'effacement définitif d'un deck supprimé à `deletedAt` — 0 s'il est déjà échu. */
export function daysLeftInTrash(deletedAt: string, now: Date = new Date()): number {
  const expiresAt = new Date(deletedAt).getTime() + DECK_TRASH_RETENTION_DAYS * DAY_MS;
  return Math.max(0, Math.ceil((expiresAt - now.getTime()) / DAY_MS));
}
