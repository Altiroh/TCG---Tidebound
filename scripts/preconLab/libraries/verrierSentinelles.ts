import { CHROMATIC_TUNING } from "@/game/rules/chromatic";

/**
 * STANDARD VERRIER — SENTINELLES CHROMATIQUES (01/10/2026).
 *
 * Plafonne le cumul des Signaux permanents (Rouge, Jaune) le temps d'une
 * mesure : `SIGNAL_CAP=1 npx tsx scripts/preconLab/lab.ts --setup <ce fichier> …`.
 * Sans variable, la règle en vigueur (cumul sans plafond) s'applique.
 */
const cap = Number(process.env.SIGNAL_CAP);
if (Number.isFinite(cap) && cap > 0) CHROMATIC_TUNING.staticSignalCap = cap;
