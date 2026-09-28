/**
 * « Récemment supprimés » — la corbeille des decks personnels.
 *
 * Supprimer un deck le DATE (`player_decks.deleted_at`) au lieu de
 * l'effacer : pendant `DECK_TRASH_RETENTION_DAYS`, il reste visible dans
 * l'onglet « Récemment supprimés » de l'écran Decks, restaurable d'un clic
 * ou effaçable pour de bon après confirmation. Passé ce délai,
 * l'application l'efface à la prochaine ouverture de la liste
 * (`listPlayerDecks`). Partagé entre le serveur (actions) et l'écran
 * (dialogue de suppression) pour que les deux racontent le même délai.
 */
export const DECK_TRASH_RETENTION_DAYS = 30;

const DAY_MS = 24 * 60 * 60 * 1000;

/** Instant avant lequel un deck à la corbeille est bon pour l'effacement définitif. */
export function trashPurgeCutoff(now: Date = new Date()): Date {
  return new Date(now.getTime() - DECK_TRASH_RETENTION_DAYS * DAY_MS);
}
