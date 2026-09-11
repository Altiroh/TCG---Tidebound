import { getCardDefinition, getMaxCopies, UNIT_CARD_TYPES } from "@/game";
import { CARD_TYPE_LABELS } from "@/features/match/cardDisplay";

/** Panneau à largeur fixe (w-80) — paliers en rem par longueur, pour ne jamais passer sur 2 lignes (calibré/vérifié sur les 87 noms du catalogue). */
function panelTitleFontSizeRem(name: string): number {
  if (name.length <= 14) return 1.4;
  if (name.length <= 18) return 1.25;
  if (name.length <= 22) return 1.1;
  if (name.length <= 26) return 0.98;
  if (name.length <= 30) return 0.93;
  if (name.length <= 34) return 0.9;
  return 0.85;
}

/** Jeton stat (Coût/Puissance/Résistance) — verre dépoli, grosse valeur + légende. */
function StatChip({ value, label, accentClassName }: { value: number; label: string; accentClassName: string }) {
  return (
    <div className="flex flex-1 flex-col items-center gap-0.5 rounded-xl border border-white/15 bg-white/10 py-2.5 backdrop-blur-md">
      <span className={`text-xl font-bold [font-family:var(--font-card-title)] ${accentClassName}`}>{value}</span>
      <span className="text-[10px] font-medium uppercase tracking-wider text-slate-300/80">{label}</span>
    </div>
  );
}

interface CardInfoPanelProps {
  cardId: string;
  /** Glow diffus derrière le verre, teinté par famille — désactivable (ex: détail d'une carte de plateau, sans la bande de couleur de la Collection). Défaut : `true`. */
  showGlow?: boolean;
}

/** Panneau d'informations affiché à côté de la carte agrandie — verre liquide (glow coloré diffus + carte dépolie + reflet), inspiré des fiches de carte Hearthstone mais limité aux données réelles du modèle Tidebound (pas de rareté/artiste/poussière, absents de `CardDefinition`). Partagé entre la Collection (`CollectionScreen`) et le détail de carte de plateau (`CardDetailModal`). */
export function CardInfoPanel({ cardId, showGlow = true }: CardInfoPanelProps) {
  const def = getCardDefinition(cardId);
  const isAbyssal = def.subtype === "abyssal";
  const isUnit = (UNIT_CARD_TYPES as readonly string[]).includes(def.type);
  const otherSubtype = def.subtype && def.subtype !== "abyssal" ? def.subtype : null;
  const showAttack = isUnit || def.attack !== undefined;
  const showHealth = def.health !== undefined;

  return (
    <div className="relative h-full w-80 shrink-0 [font-family:var(--font-card-body)]">
      {showGlow && (
        <div aria-hidden className={`absolute -inset-8 opacity-50 blur-3xl ${isAbyssal ? "bg-fuchsia-700" : "bg-sky-500"}`} />
      )}

      <div className="relative flex h-full flex-col justify-center overflow-hidden border border-white/15 bg-white/[0.07] shadow-[0_8px_40px_rgba(0,0,0,0.55)] backdrop-blur-2xl">
        {/* Reflet du haut, façon verre liquide */}
        <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-white/25 to-transparent" />
        <div aria-hidden className="pointer-events-none absolute -left-10 top-0 h-full w-16 -rotate-12 bg-white/10 blur-md" />

        <div className="relative p-6">
          <div className="flex flex-wrap items-center gap-2">
            {/* Puce blanche, toujours visible : le type reste lisible même si
                l'icône seule est ambiguë (ex: Marin vs Créature). */}
            <span className="flex items-center gap-1.5 rounded-full bg-white px-3 py-1 shadow-[0_1px_4px_rgba(0,0,0,0.35)]">
              {/* eslint-disable-next-line @next/next/no-img-element -- asset local, icône de type */}
              <img
                src={`/assets/cards/icons/TYPE_${def.type.toUpperCase()}_STANDARD.png`}
                alt=""
                className="h-4 w-auto object-contain"
              />
              <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-800">
                {CARD_TYPE_LABELS[def.type]}
              </span>
            </span>
            {isAbyssal && (
              <span className="rounded-full border border-white/15 bg-fuchsia-500/20 px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-fuchsia-200 backdrop-blur-md">
                Abyssal
              </span>
            )}
            {otherSubtype && (
              <span className="rounded-full border border-white/15 bg-white/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-slate-300 backdrop-blur-md">
                {otherSubtype}
              </span>
            )}
          </div>

          <h2
            className="mt-3 overflow-hidden text-ellipsis whitespace-nowrap font-semibold text-white [font-family:var(--font-card-title)]"
            style={{ fontSize: `${panelTitleFontSizeRem(def.name)}rem` }}
          >
            {def.name}
          </h2>

          <div className="mt-4 flex gap-2">
            <StatChip value={def.cost} label="Coût" accentClassName="text-sky-300" />
            {showAttack && <StatChip value={def.attack ?? 0} label="Puissance" accentClassName="text-orange-300" />}
            {showHealth && <StatChip value={def.health ?? 0} label="Résistance" accentClassName="text-emerald-300" />}
          </div>

          {def.text && (
            <p className="mt-4 rounded-xl border border-white/10 bg-white/5 py-2 pl-3 pr-2.5 text-[15px] leading-relaxed text-slate-200 backdrop-blur-md">
              {def.text}
            </p>
          )}

          {def.keywords && def.keywords.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-1.5">
              {def.keywords.map((keyword) => (
                <span
                  key={keyword}
                  className="rounded-md border border-white/15 bg-white/10 px-2 py-1 text-[11px] font-medium uppercase tracking-wide text-sky-200 backdrop-blur-md"
                >
                  {keyword}
                </span>
              ))}
            </div>
          )}

          <div className="mt-5 border-t border-white/10 pt-3 text-right text-xs text-slate-400">
            {getMaxCopies(def)} exemplaire{getMaxCopies(def) > 1 ? "s" : ""} max / deck
          </div>
        </div>
      </div>
    </div>
  );
}
