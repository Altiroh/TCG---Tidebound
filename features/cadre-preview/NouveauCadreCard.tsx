"use client";

import { isAbyssalVariant, type CardDefinition } from "@/game";
import { CARD_TYPE_LABELS } from "@/features/match/cardDisplay";
import { useImageOk } from "@/features/match/useImageOk";

/**
 * NOUVEAU CADRE — test (03/10/2026), à côté de `CardTile` qui reste le
 * rendu officiel tant que la décision n'est pas prise.
 *
 * Parti pris de la maquette : l'illustration couvre TOUTE la carte, le cadre
 * n'est plus qu'un liseré posé par-dessus, et tout le reste est écrit sur
 * l'image (un voile sombre en pied garantit la lecture) :
 *  - haut-gauche : coût + cerveau de Raison ;
 *  - haut-droite : pictogramme de type + son libellé ;
 *  - pied : nom, texte de règles, puis Puissance (sur l'éclaboussure rouge)
 *    et Résistance.
 *
 * Assets : `public/assets/cards/frames/nouveau/` (cadre, cadre légendaire, cadre abyssal, cerveau, épée, bouclier,
 * fond de Puissance, `types/<type>.webp`).
 * Toutes les icônes (type, cerveau, épée, bouclier) sont fournies, blanches.
 */
const ASSETS = "/assets/cards/frames/nouveau";

export interface NouveauCadreCardProps {
  def: CardDefinition;
  legendaire?: boolean;
  /** Classe de largeur : la carte compose tout en `cqw`, elle suit son emplacement. */
  widthClassName?: string;
}

export function NouveauCadreCard({ def, legendaire = false, widthClassName = "w-64" }: NouveauCadreCardProps) {
  const illustration = `/assets/cards/illustrations/${def.id}.webp`;
  const illustrationOk = useImageOk(illustration);
  const hasPower = def.attack !== undefined;
  const hasResistance = def.health !== undefined;

  return (
    <div className={`${widthClassName} relative aspect-[5/7] select-none`} style={{ containerType: "inline-size" }}>
      {/* Couche 1 : l'illustration, plein cadre, coupée à l'arrondi du liseré. */}
      <div className="absolute overflow-hidden bg-slate-900" style={{ inset: "1.2% 4.6% 1.2% 4.6%", borderRadius: "6cqw" }}>
        {illustrationOk ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={illustration} alt="" className="h-full w-full object-cover" draggable={false} />
        ) : (
          <div className="h-full w-full bg-gradient-to-b from-slate-700 to-slate-950" />
        )}
        {/* Voiles : un léger en tête pour le coût et le type, un franc en pied pour le texte. */}
        <div className="absolute inset-x-0 top-0 h-[22%] bg-gradient-to-b from-black/55 to-transparent" />
        <div
          className="absolute inset-x-0 bottom-0 h-[52%]"
          style={{ background: "linear-gradient(to bottom, transparent 0%, rgba(0,0,0,0.55) 28%, rgba(0,0,0,0.88) 60%, rgba(0,0,0,0.94) 100%)" }}
        />
      </div>

      {/* Couche 2 : le liseré. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={`${ASSETS}/${frameName(def, legendaire)}.webp`}
        alt=""
        className="pointer-events-none absolute inset-0 h-full w-full"
        draggable={false}
      />

      {/* Coût + Raison. */}
      <div
        className="absolute flex items-center font-bold leading-none text-white [font-family:var(--font-card-title)]"
        style={{ top: "4.5%", left: "11%", gap: "2cqw", fontSize: "15cqw", textShadow: TEXT_SHADOW }}
      >
        <span>{def.cost}</span>
        <BrainGlyph />
      </div>

      {/* Type : glyphe blanc + libellé. */}
      <div className="absolute flex flex-col items-center text-white" style={{ top: "5%", right: "10%", width: "20%" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={`${ASSETS}/types/${def.type}.webp`}
          alt=""
          className="object-contain"
          style={{ height: "13cqw", width: "auto", filter: "drop-shadow(0 0.4cqw 0.6cqw rgba(0,0,0,0.7))" }}
          draggable={false}
        />
        <span
          className="whitespace-nowrap font-semibold leading-none [font-family:var(--font-card-body)]"
          style={{ fontSize: "5cqw", marginTop: "1.2cqw", textShadow: TEXT_SHADOW }}
        >
          {CARD_TYPE_LABELS[def.type]}
        </span>
      </div>

      {/* Pied : nom, règles, stats — empilés depuis le bas pour qu'un texte long pousse le nom vers le haut. */}
      <div
        className="absolute flex flex-col justify-end text-white"
        style={{ left: "11%", right: "11%", bottom: hasPower || hasResistance ? "16%" : "6%", top: "45%" }}
      >
        <h3
          className="font-bold [font-family:var(--font-card-title)]"
          style={{ fontSize: `${nameSizeCqw(def.name)}cqw`, lineHeight: 1.05, textShadow: TEXT_SHADOW }}
        >
          {def.name}
        </h3>
        {def.text && (
          <p
            className="[font-family:var(--font-card-body)]"
            style={{ fontSize: `${rulesSizeCqw(def.text)}cqw`, lineHeight: 1.18, marginTop: "3.5cqw", textShadow: TEXT_SHADOW }}
          >
            {def.text}
          </p>
        )}
      </div>

      {/* Puissance sur l'éclaboussure rouge, Résistance à nu. */}
      {hasPower && (
        <div className="absolute" style={{ left: "7%", bottom: "4.5%", width: "44%", height: "12.5%" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`${ASSETS}/fond-puissance.webp`} alt="" className="absolute inset-0 h-full w-full object-fill" draggable={false} />
          <div
            className="absolute inset-0 flex items-center justify-center font-bold leading-none text-white [font-family:var(--font-card-title)]"
            style={{ gap: "2.5cqw", fontSize: "10cqw", textShadow: TEXT_SHADOW }}
          >
            <SwordGlyph />
            <span>{def.attack}</span>
          </div>
        </div>
      )}
      {hasResistance && (
        <div
          className="absolute flex items-center justify-center font-bold leading-none text-white [font-family:var(--font-card-title)]"
          style={{ right: "11%", bottom: "4.2%", height: "13%", gap: "2.5cqw", fontSize: "10cqw", textShadow: TEXT_SHADOW }}
        >
          <ShieldGlyph />
          <span>{def.health}</span>
        </div>
      )}
    </div>
  );
}

const TEXT_SHADOW = "0 0.3cqw 0.8cqw rgba(0,0,0,0.85), 0 0 0.3cqw rgba(0,0,0,0.9)";

function nameSizeCqw(name: string): number {
  if (name.length <= 16) return 8.6;
  if (name.length <= 28) return 7.4;
  return 6.2;
}

function rulesSizeCqw(text: string): number {
  if (text.length <= 90) return 4.8;
  if (text.length <= 150) return 4.6;
  if (text.length <= 220) return 3.8;
  return 3.4;
}

/** Cerveau de Raison (icône fournie). */
function BrainGlyph() {
  return <StatIcon src={`${ASSETS}/cerveau.webp`} height="0.75em" />;
}

/** Épée de Puissance et bouclier de Résistance : même hauteur, en `em` pour suivre le chiffre. */
function SwordGlyph() {
  return <StatIcon src={`${ASSETS}/epee.webp`} height="1.1em" />;
}

function ShieldGlyph() {
  return <StatIcon src={`${ASSETS}/bouclier.webp`} height="0.9em" />;
}

/** L'épée, fine, monte un peu plus haut que le bouclier pour peser autant que lui. */
function StatIcon({ src, height }: { src: string; height: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      aria-hidden
      className="w-auto shrink-0"
      style={{ height, filter: "drop-shadow(0 0.3cqw 0.6cqw rgba(0,0,0,0.8))" }}
      draggable={false}
    />
  );
}

/** Une Abyssale garde toujours son cadre (c'est sa variante qui le dicte) ; sinon légendaire ou standard. */
function frameName(def: CardDefinition, legendaire: boolean): string {
  if (isAbyssalVariant(def)) return "cadre-abyssal";
  return legendaire ? "cadre-legendaire" : "cadre";
}
