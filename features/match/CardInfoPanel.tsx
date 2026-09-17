import { getCardDefinition, getMaxCopies, isAbyssalVariant, UNIT_CARD_TYPES } from "@/game";
import { CARD_TYPE_LABELS } from "@/features/match/cardDisplay";

/** Paliers de taille par longueur de nom — le panneau est étroit, un nom long ne doit jamais passer sur deux lignes (calibré sur les noms du catalogue). */
function panelTitleFontSizeRem(name: string): number {
  if (name.length <= 14) return 1.4;
  if (name.length <= 18) return 1.25;
  if (name.length <= 22) return 1.1;
  if (name.length <= 26) return 0.98;
  if (name.length <= 30) return 0.93;
  if (name.length <= 34) return 0.9;
  return 0.85;
}

/** Statistique de base : la VALEUR porte la couleur, rien autour. */
function Stat({ value, label, accentClassName }: { value: number; label: string; accentClassName: string }) {
  return (
    <div className="flex flex-col items-center gap-0.5">
      <span className={`text-2xl font-bold leading-none [font-family:var(--font-card-title)] ${accentClassName}`}>{value}</span>
      <span className="text-[10px] font-medium uppercase tracking-wider text-slate-400">{label}</span>
    </div>
  );
}

interface CardInfoPanelProps {
  cardId: string;
}

/**
 * Informations de règles affichées à côté d'une carte agrandie EN PARTIE
 * (`features/match/CardDetailModal.tsx`, son unique appelant).
 *
 * Volontairement DÉPOUILLÉ : aucune surface. Plus de dalle de verre pleine
 * hauteur à droite de la carte, plus de pastille blanche de type, plus de
 * tuiles de statistiques, plus de cadre autour du texte — ces bandes
 * empilées pesaient plus que l'information qu'elles portaient, et la dalle
 * courait du haut au bas de l'écran quel que soit son contenu. Ne restent
 * que le type, le nom, trois chiffres colorés et le texte de règles, posés
 * directement sur le fond de la fenêtre.
 *
 * La fiche de la COLLECTION ne passe plus par ici : elle a sa propre vue
 * (`features/collection/card-detail/`), pensée pour inspecter une
 * définition de catalogue. Ce panneau-ci accompagne une carte EN JEU et
 * reste donc au plus près du plateau.
 */
export function CardInfoPanel({ cardId }: CardInfoPanelProps) {
  const def = getCardDefinition(cardId);
  const isAbyssal = isAbyssalVariant(def);
  const isUnit = (UNIT_CARD_TYPES as readonly string[]).includes(def.type);
  const otherSubtype = def.subtype ?? null;
  const showAttack = isUnit || def.attack !== undefined;
  const showHealth = def.health !== undefined;
  const maxCopies = getMaxCopies(def);

  return (
    <div className="w-72 shrink-0 [font-family:var(--font-card-body)]">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] font-semibold uppercase tracking-wider">
        <span className="text-slate-300">{CARD_TYPE_LABELS[def.type]}</span>
        {isAbyssal && <span className="text-fuchsia-300">· Abyssal</span>}
        {otherSubtype && <span className="text-slate-500">· {otherSubtype}</span>}
      </div>

      <h2
        className="mt-1.5 overflow-hidden text-ellipsis whitespace-nowrap font-semibold text-white [font-family:var(--font-card-title)]"
        style={{ fontSize: `${panelTitleFontSizeRem(def.name)}rem` }}
      >
        {def.name}
      </h2>

      <div className="mt-4 flex gap-6">
        <Stat value={def.cost} label="Coût" accentClassName="text-sky-300" />
        {showAttack && <Stat value={def.attack ?? 0} label="Puissance" accentClassName="text-orange-300" />}
        {showHealth && <Stat value={def.health ?? 0} label="Résistance" accentClassName="text-emerald-300" />}
      </div>

      {def.text && (
        <p className="mt-4 border-l border-white/15 pl-3 text-[15px] leading-relaxed text-slate-200">{def.text}</p>
      )}

      {def.keywords && def.keywords.length > 0 && (
        <p className="mt-3 text-[11px] font-medium uppercase tracking-wide text-sky-300">{def.keywords.join(" · ")}</p>
      )}

      <p className="mt-5 text-xs text-slate-500">
        {maxCopies} exemplaire{maxCopies > 1 ? "s" : ""} max / deck
      </p>
    </div>
  );
}
