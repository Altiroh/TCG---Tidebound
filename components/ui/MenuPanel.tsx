import Link from "next/link";
import type { Route } from "next";

export interface MenuPanelItem {
  href: Route | string;
  label: string;
  disabled?: boolean;
}

const RIVET_POSITIONS = ["left-2 top-2", "right-2 top-2", "left-2 bottom-2", "right-2 bottom-2"];

const ROW_TEXT_STYLE = {
  fontFamily: 'Georgia, "Times New Roman", serif',
  fontWeight: 700,
} as const;

/**
 * Panneau de menu unifié — approximation CSS en attendant l'asset "panneau"
 * (`public/assets/menu/panel/`) : un seul cadre en bois contenant toutes
 * les entrées, séparées par de fines lignes, plutôt que des planches
 * individuelles espacées. Couleurs calées sur la texture du bouton
 * (`public/assets/menu/buttons/repos/`) pour rester cohérent visuellement.
 * À remplacer par l'asset réel une fois fourni.
 */
export function MenuPanel({ items }: { items: MenuPanelItem[] }) {
  return (
    <div className="relative w-full max-w-xs rounded-sm border-2 border-[#1f1712] bg-[#3c4a45]/95 shadow-[0_10px_30px_rgba(0,0,0,0.65),inset_0_0_50px_rgba(0,0,0,0.45)]">
      {RIVET_POSITIONS.map((pos) => (
        <span
          key={pos}
          className={`absolute z-10 h-2.5 w-2.5 rounded-full bg-[#7a5c3e] shadow-[inset_0_1px_1px_rgba(255,255,255,0.3),0_1px_2px_rgba(0,0,0,0.6)] ${pos}`}
        />
      ))}
      <nav className="divide-y divide-black/40">
        {items.map((item) =>
          item.disabled ? (
            <span
              key={item.label}
              className="block cursor-not-allowed px-6 py-4 text-center text-xl text-[#6b7570]"
              style={ROW_TEXT_STYLE}
            >
              {item.label}
            </span>
          ) : (
            <Link
              key={item.label}
              href={item.href as Route}
              className="block px-6 py-4 text-center text-xl text-[#e8e2d0] transition-colors hover:bg-white/[0.06] active:bg-black/20"
              style={{ ...ROW_TEXT_STYLE, textShadow: "0 1px 2px rgba(0,0,0,0.7)" }}
            >
              {item.label}
            </Link>
          )
        )}
      </nav>
    </div>
  );
}
