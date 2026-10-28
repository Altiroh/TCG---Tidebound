import { QUALIFICATIONS } from "@/game/cards/qualifications";
import { KEYWORD_DESCRIPTIONS } from "@/features/match/cardDisplay";

/**
 * GLOSSAIRE des mots-clés du jeu, pour les infobulles (retour de joueur du
 * 27/10/2026 : « tooltips sur les mots-clés d'une carte »).
 *
 * Aucune définition n'est écrite pour l'occasion : chacune vient d'une
 * source du projet — les mots-clés universels (`KEYWORD_DESCRIPTIONS`), les
 * qualifications (`game/cards/qualifications.ts`) et, pour le vocabulaire
 * d'action, la page Notion « Règles & mécaniques verrouillées ». Un terme
 * absent d'ici n'a simplement pas d'infobulle.
 */
export interface GlossaryEntry {
  label: string;
  description: string;
  /** Formes repérées dans un texte de carte (insensible à la casse, mot entier). */
  forms: readonly string[];
  /** Une qualification (`QUALIFICATIONS`) — la fiche détaillée les liste déjà à part. */
  qualification?: true;
}

const QUALIFICATION_ENTRIES: GlossaryEntry[] = Object.values(QUALIFICATIONS).map((rule) => ({
  label: rule.name,
  description: rule.describe(),
  forms: [rule.name],
  qualification: true,
}));

export const KEYWORD_GLOSSARY: readonly GlossaryEntry[] = [
  { label: "Garde", description: KEYWORD_DESCRIPTIONS.garde!, forms: ["Garde"] },
  { label: "Voile", description: KEYWORD_DESCRIPTIONS.voile!, forms: ["Voile"] },
  { label: "Pied marin", description: "Ce permanent peut attaquer dès son arrivée (le tour où il est posé).", forms: ["Pied marin"] },
  {
    label: "Chaîne",
    description:
      "Réaction : un Objet Chaîne se joue depuis la main, pour son coût, pendant la fenêtre de son déclencheur — même au tour adverse, et sans emplacement libre.",
    forms: ["Chaîne"],
  },
  {
    label: "Saborder",
    description: "Sacrifier volontairement l'un de ses permanents : il part au Cimetière. Saborder n'est ni Détruire, ni Briser.",
    forms: ["Saborder", "Sabordez", "Sabordage", "Sabordé", "Sabordée"],
  },
  {
    label: "Briser",
    description: "Un Objet joué depuis la main lance son effet ; il est Brisé quand cet effet se résout. Briser n'est pas Saborder.",
    forms: ["Briser", "Brisez", "Brisé", "Brisée", "Bris"],
  },
  { label: "Éveil", description: "Son effet « Éveil » se résout à son arrivée, et chaque fois qu'un effet déclenche son Éveil.", forms: ["Éveil", "Éveillé", "Éveillée"] },
  { label: "Durée", description: "Se compte en tours de table : un de moins à l'entame de chaque tour de son contrôleur. À zéro, la carte quitte le jeu.", forms: ["Durée"] },
  { label: "Malade", description: "Perd 1 Résistance à chaque tour tant que ce statut reste actif.", forms: ["Malade", "MALADE"] },
  {
    label: "Bénie",
    description: "Une unité bénie l'est une seule fois, jusqu'à ce qu'un effet le lui retire ; elle le reste au Cimetière. Sans effet propre : certaines cartes le récompensent, d'autres le punissent.",
    forms: ["bénie", "bénies", "béni", "bénis", "Bénédiction"],
  },
  {
    label: "Souillure",
    description: "Marqueur cumulable posé sur une unité : elle est « souillée » tant qu'elle en porte au moins un. Sans effet propre : certaines cartes les comptent.",
    forms: ["Souillure", "souillée", "souillées", "souillé"],
  },
  {
    label: "Marqueur +1/+1",
    description: "Marqueur cumulable : +1 Puissance et +1 Résistance par marqueur, tant que la carte reste en jeu.",
    forms: ["+1/+1"],
  },
  ...QUALIFICATION_ENTRIES,
];

const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Les termes du glossaire présents dans ce texte, dans l'ordre du glossaire, chacun une fois. */
export function glossaryTermsIn(text: string | undefined): GlossaryEntry[] {
  if (!text) return [];
  return KEYWORD_GLOSSARY.filter((entry) =>
    entry.forms.some((form) => new RegExp(`(^|[^\\p{L}])${escape(form)}(?![\\p{L}])`, "iu").test(text))
  );
}
