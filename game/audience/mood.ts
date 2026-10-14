/**
 * Humeur du public, en une phrase — SANS dépendance : le bandeau commun la
 * lit sur chaque écran, et passer par `analyzeMatch` y tirait le catalogue
 * de cartes et le moteur (audit de fluidité du 14/10/2026).
 */

/** Humeur du public, en une phrase, pour un spectacle donné. */
export function audienceMood(spectacle: number): string {
  if (spectacle >= 80) return "Le public est debout";
  if (spectacle >= 60) return "Le public est captivé";
  if (spectacle >= 40) return "Le public suit la partie";
  if (spectacle >= 20) return "Le public s'impatiente";
  return "Le public s'ennuie";
}
