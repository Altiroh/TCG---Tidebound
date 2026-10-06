"use client";

import { ARCHETYPE_LABELS, isAbyssalVariant, type CardDefinition } from "@/game";
import { CARD_TYPE_LABELS } from "@/features/match/cardDisplay";
import { useLayoutEffect, useRef } from "react";
import { useDebordPleinCadre } from "@/features/match/useDebordPleinCadre";
import { useImageOk } from "@/features/match/useImageOk";
import styles from "@/features/cadre-preview/NouveauCadreCard.module.css";

/**
 * NOUVEAU CADRE — test (03/10/2026). En jeu, il remplace la carte complète
 * de `CardTile` quand le joueur l'active dans les Options (« Nouveau cadre
 * de carte », `lib/settings.ts`) ; sinon l'ancien rendu reste en place.
 * La tuile de plateau, les jetons et les dos ne changent pas.
 *
 * Parti pris de la maquette : l'illustration couvre TOUTE la carte, le cadre
 * n'est plus qu'un liseré posé par-dessus, et tout le reste est écrit sur
 * l'image (un voile sombre en pied garantit la lecture) :
 *  - haut-gauche : coût + cerveau de Raison ;
 *  - haut-droite : pictogramme de type + son libellé ;
 *  - pied : nom, texte de règles, puis Puissance (sur l'éclaboussure rouge)
 *    et Résistance.
 *
 * Une Abyssale porte son sujet dans un calque de DÉBORD (l'illustration n'est
 * que le décor), posé par-dessus le liseré, et un reflet irisé ; une
 * légendaire scintille (`NouveauCadreCard.module.css`).
 *
 * Assets : `public/assets/cards/frames/nouveau/` (cadre, cadre légendaire, cadre abyssal, cerveau, épée, bouclier,
 * fond de Puissance, `types/<type>.webp`).
 * Toutes les icônes (type, cerveau, épée, bouclier) sont fournies, blanches.
 */
const ASSETS = "/assets/cards/frames/nouveau";
/**
 * Version des icônes (type, cerveau, épée, bouclier) : une icône remplacée
 * sous le même nom resterait un jour en cache (service worker + HTTP).
 * À monter à chaque nouvelle livraison d'icônes.
 */
const ICONES_REV = 3;

export interface NouveauCadreFaceProps {
  def: CardDefinition;
  /** Cadre doré et scintillement (rareté `legendary`). Sans effet sur une Abyssale, qui a le sien. */
  legendaire?: boolean;
  /** Valeurs AFFICHÉES en partie (modificateurs, blessures) ; à défaut, celles imprimées. */
  attack?: number;
  health?: number;
  /** Classes du chiffre (couleur de bonus/malus, animation), fournies par `CardTile`. */
  attackClassName?: string;
  healthClassName?: string;
}

/** Enveloppe à largeur fixe de la page de test : la face y compose tout en `cqw`. */
export function NouveauCadreCard({ widthClassName = "w-64", ...props }: NouveauCadreFaceProps & { widthClassName?: string }) {
  return (
    <div className={`${widthClassName} relative aspect-[5/7]`}>
      <NouveauCadreFace {...props} />
    </div>
  );
}

/** La face seule : elle remplit son parent (format 5:7) et y ouvre son propre conteneur de `cqw`. */
export function NouveauCadreFace({ def, legendaire = false, attack, health, attackClassName = "", healthClassName = "" }: NouveauCadreFaceProps) {
  const illustration = `/assets/cards/illustrations/${def.id}.webp`;
  const illustrationOk = useImageOk(illustration);
  const hasPower = def.attack !== undefined;
  const hasResistance = def.health !== undefined;
  const abyssale = isAbyssalVariant(def);
  const debord = abyssale ? `/assets/cards/illustrations/${def.id}-debord.webp` : null;
  const debordOk = useImageOk(debord);
  const debordPlein = useDebordPleinCadre(debordOk ? debord : null);
  const nomRef = useRef<HTMLHeadingElement>(null);
  const effetRef = useRef<HTMLParagraphElement>(null);
  useFitText(nomRef, def.name, nameSizeCqw(def.name), 6.5);
  useFitText(effetRef, def.text ?? "", rulesSizeCqw(def.text ?? ""), 2.6);

  const cadre = frameName(def, legendaire);
  const calage = CALAGES[cadre];

  return (
    <div
      className="absolute inset-0 select-none"
      style={{ containerType: "inline-size", ["--illus-inset" as string]: calage.illustration, ["--illus-radius" as string]: calage.rayon }}
    >
      {/* Couche 1 : l'illustration, plein cadre, coupée à l'arrondi du liseré. */}
      <div className="absolute overflow-hidden bg-slate-900" style={{ inset: "var(--illus-inset)", borderRadius: "var(--illus-radius)" }}>
        {illustrationOk ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={illustration} alt="" className="h-full w-full object-cover" draggable={false} />
        ) : (
          <div className="h-full w-full bg-gradient-to-b from-slate-700 to-slate-950" />
        )}
        {/* Pas de voile continu (maquette du 04/10/2026) : chaque texte porte sa
            propre ombre floue (`HALO`), l'illustration reste lisible partout ailleurs. */}
      </div>

      {/* Couche 2 : le liseré. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={`${ASSETS}/${cadre}.webp`}
        alt=""
        className="pointer-events-none absolute inset-0 h-full w-full"
        draggable={false}
      />

      {/* Couche 3 (Abyssales) : le sujet, qui déborde du liseré et se fond dans le voile en pied. */}
      {abyssale && debordOk && debord && debordPlein === true && (
        // Calque peint sur le canevas de l'illustration : il se pose exactement
        // comme elle (même boîte, même cadrage), par-dessus le liseré.
        <div className="pointer-events-none absolute" style={{ inset: "var(--illus-inset)" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={debord} alt="" className={`h-full w-full object-cover ${styles.debord}`} draggable={false} />
        </div>
      )}
      {abyssale && debordOk && debord && debordPlein === false && (
        // Il passe PAR-DESSUS le liseré, mais jamais hors de la carte : il est
        // contenu dans la silhouette extérieure du cadre.
        <div className="pointer-events-none absolute overflow-hidden" style={{ inset: calage.silhouette, borderRadius: calage.rayonSilhouette }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={debord}
            alt=""
            className={`absolute object-contain object-bottom ${styles.debord}`}
            style={{ top: 0, left: 0, width: "100%", height: "66%" }}
            draggable={false}
          />
        </div>
      )}

      {/* Couche 4 : l'effet de rareté, sous les textes. */}
      {abyssale ? <EffetAbyssal /> : legendaire ? <EffetLegendaire /> : null}

      {/* Coût + Raison. */}
      <div
        className="absolute flex items-center font-bold leading-none text-white [font-family:var(--font-card-title)]"
        style={{ top: "4.5%", left: "10%", gap: "2cqw", fontSize: "15cqw", textShadow: HALO }}
      >
        <span>{def.cost}</span>
        <BrainGlyph />
      </div>

      {/* Type : une plaque sombre en haut à droite, glyphe et libellé. */}
      <div
        className="absolute flex flex-col items-center text-white"
        style={{
          top: "3.5%",
          right: "7%",
          minWidth: "20%",
          padding: "2.5cqw 3cqw 2.2cqw",
          gap: "1cqw",
          // Pas de plaque : une ombre épaisse et floue derrière, comme sur la maquette.
          background: "radial-gradient(ellipse at center, rgba(0,0,0,0.78) 0%, rgba(0,0,0,0.5) 45%, rgba(0,0,0,0) 72%)",
          textShadow: HALO,
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={`${ASSETS}/types/${def.type}.webp?v=${ICONES_REV}`}
          alt=""
          className="object-contain"
          style={{ height: "9cqw", width: "auto", filter: "drop-shadow(0 0 1cqw rgba(0,0,0,0.9)) drop-shadow(0 0 3cqw rgba(0,0,0,0.6))" }}
          draggable={false}
        />
        <span
          className="whitespace-nowrap font-semibold uppercase leading-none [font-family:var(--font-card-title)]"
          style={{ fontSize: "3.4cqw", letterSpacing: "0.04em" }}
        >
          {CARD_TYPE_LABELS[def.type]}
          {/* Famille conçue pour se reconnaître (Opalin) : « Créature · Opalin ». */}
          {def.showsArchetype && def.archetype ? ` · ${ARCHETYPE_LABELS[def.archetype]}` : null}
        </span>
      </div>

      {/* Nom : ancré par le BAS juste au-dessus de la zone d'effet — même place
          sur toutes les cartes, deux lignes au plus, en Lora gras italique, légèrement incliné. */}
      <h3
        ref={nomRef}
        className="absolute overflow-hidden text-white [font-family:var(--font-card-new-title)]"
        style={{
          left: "9%",
          right: "14%",
          bottom: `${100 - ZONE_EFFET_HAUT}%`,
          // Deux lignes à la taille de base : un nom plus long RÉTRÉCIT pour y
          // tenir (`useFitText`), il n'est jamais coupé de « … ».
          height: `${NOM_HAUTEUR_CQW}cqw`,
          fontSize: `${nameSizeCqw(def.name)}cqw`,
          lineHeight: 1.05,
          display: "flex",
          flexDirection: "column",
          justifyContent: "flex-end",
          paddingBottom: "0.2em",
          transform: "rotate(-3deg)",
          transformOrigin: "left bottom",
          textShadow: HALO,
        }}
      >
        <span>{def.name}</span>
      </h3>

      {/* Effet : une zone FIXE, plus étroite que la carte pour laisser la
          colonne des stats ; au-delà de sa hauteur, le texte défile. */}
      {def.text && (
        <p
          ref={effetRef}
          className={`absolute font-semibold text-white [font-family:var(--font-card-body)] ${styles.regles}`}
          style={{
            top: `${ZONE_EFFET_HAUT}%`,
            bottom: hasPower || hasResistance ? "14%" : "5%",
            left: "9%",
            right: "9%",
            fontSize: `${rulesSizeCqw(def.text)}cqw`,
            lineHeight: 1.18,
            textShadow: HALO_TEXTE,
          }}
        >
          {def.text}
        </p>
      )}

      {/* Stats : une ligne en bas à droite, la Puissance à gauche de la Résistance. */}
      {(hasPower || hasResistance) && (
        <div
          className="absolute flex items-center font-bold leading-none text-white [font-family:var(--font-card-title)]"
          style={{ right: "9%", bottom: "4.5%", gap: "4cqw", fontSize: "9cqw", textShadow: HALO }}
        >
          {hasPower && (
            <span className="flex items-center" style={{ gap: "1.5cqw" }}>
              <span data-stat="attack" className={attackClassName}>{attack ?? def.attack}</span>
              <SwordGlyph />
            </span>
          )}
          {hasResistance && (
            <span className="flex items-center" style={{ gap: "1.5cqw" }}>
              <span data-stat="resistance" className={healthClassName}>{health ?? def.health}</span>
              <ShieldGlyph />
            </span>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Ombre « derrière » les éléments (maquette du 04/10/2026) : un halo flou qui
 * suit les lettres, pas un bandeau — l'ombre n'existe que là où il y a du
 * texte, et l'illustration reste visible entre les mots.
 */
const HALO = "0 0 0.6cqw rgba(0,0,0,1), 0 0 2cqw rgba(0,0,0,0.95), 0 0.4cqw 4cqw rgba(0,0,0,0.85), 0 0.6cqw 7cqw rgba(0,0,0,0.6)";
/** Même halo, resserré pour le petit corps du texte d'effet. */
const HALO_TEXTE = "0 0 0.4cqw rgba(0,0,0,1), 0 0 1.2cqw rgba(0,0,0,1), 0 0 3cqw rgba(0,0,0,0.9), 0 0.4cqw 6cqw rgba(0,0,0,0.75)";
/**
 * CALAGE de chaque cadre, mesuré sur ses pixels (silhouette extérieure et bord
 * intérieur du liseré, en % de la carte). L'illustration et les effets de
 * rareté s'arrêtent au MILIEU du liseré : ni trou entre l'image et le cadre,
 * ni image qui dépasse à l'extérieur — leur arrondi reste caché sous le
 * liseré. Le débord des Abyssales, lui, est contenu dans la silhouette.
 */
type NomDeCadre = "cadre" | "cadre-legendaire" | "cadre-abyssal";

const CALAGES: Record<NomDeCadre, { illustration: string; rayon: string; silhouette: string; rayonSilhouette: string }> = {
  cadre: { illustration: "1.8% 5% 2.7% 5.2%", rayon: "4.5cqw", silhouette: "0.75% 3.73% 1.75% 3.96%", rayonSilhouette: "4.8cqw" },
  "cadre-legendaire": { illustration: "2.5% 5.2% 2.8% 5.3%", rayon: "4.5cqw", silhouette: "1.33% 3.49% 1.67% 3.49%", rayonSilhouette: "4.9cqw" },
  "cadre-abyssal": { illustration: "2.9% 4.8% 3.6% 4.9%", rayon: "4cqw", silhouette: "1.83% 3.26% 2.58% 3.14%", rayonSilhouette: "4.1cqw" },
};

/** Haut de la zone d'effet, en % de la carte : le nom s'ancre juste au-dessus. */
const ZONE_EFFET_HAUT = 73;

/** Étoiles de la légendaire : position (% de la carte) et décalage, fixes pour que la carte ne change pas d'un rendu à l'autre. */
const ETOILES = [
  { top: 8, left: 30, delai: 0 },
  { top: 18, left: 78, delai: 0.9 },
  { top: 34, left: 14, delai: 1.7 },
  { top: 42, left: 62, delai: 0.4 },
  { top: 27, left: 46, delai: 2.1 },
  { top: 55, left: 86, delai: 1.3 },
  { top: 62, left: 20, delai: 2.4 },
  { top: 12, left: 58, delai: 1.1 },
];

function EffetLegendaire() {
  return (
    <>
      <div className={styles.calque}>
        <div className={styles.eclatDore} />
      </div>
      {ETOILES.map((etoile, index) => (
        <span
          key={index}
          className={styles.etoile}
          style={{ top: `${etoile.top}%`, left: `${etoile.left}%`, animationDelay: `${etoile.delai}s` }}
        />
      ))}
    </>
  );
}

function EffetAbyssal() {
  return (
    <>
      <div className={styles.calque}>
        <div className={styles.irisation} />
        <div className={styles.refletNacre} />
      </div>
    </>
  );
}

/** Hauteur de la zone du nom : deux lignes à la plus grande taille, jambages compris. */
const NOM_HAUTEUR_CQW = 30;

/**
 * Le texte RÉTRÉCIT pour tenir dans sa zone, au lieu d'être coupé : on part
 * de la taille prévue pour sa longueur et on descend par pas de 0,25 cqw tant
 * qu'il déborde (en hauteur, ou un mot trop long en largeur), sans passer
 * sous `minCqw` — au-delà, l'effet défile. En `cqw`, le résultat ne dépend
 * pas de la taille de la carte : on ne le recalcule qu'au changement de
 * texte et une fois les polices chargées.
 */
function useFitText(ref: React.RefObject<HTMLElement | null>, text: string, baseCqw: number, minCqw: number) {
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !text) return;
    const fit = () => {
      let size = baseCqw;
      el.style.fontSize = `${size}cqw`;
      // Le nom est calé en BAS : ce qui déborde part vers le haut, où
      // `scrollHeight` ne le voit pas. On mesure donc son contenu (premier enfant).
      const contenu = (el.firstElementChild as HTMLElement | null) ?? el;
      const deborde = () =>
        (contenu === el ? el.scrollHeight : contenu.offsetHeight) > el.clientHeight + 1 || contenu.scrollWidth > el.clientWidth + 1;
      while (size > minCqw && deborde()) {
        size = Math.max(minCqw, size - 0.25);
        el.style.fontSize = `${size}cqw`;
      }
    };
    fit();
    let alive = true;
    void document.fonts?.ready.then(() => alive && fit());
    return () => {
      alive = false;
    };
  }, [ref, text, baseCqw, minCqw]);
}

function nameSizeCqw(name: string): number {
  if (name.length <= 14) return 13;
  if (name.length <= 22) return 12;
  if (name.length <= 30) return 10.5;
  return 9;
}

function rulesSizeCqw(text: string): number {
  if (text.length <= 90) return 4.4;
  if (text.length <= 160) return 4;
  return 3.6;
}

/** Cerveau de Raison (icône fournie). */
function BrainGlyph() {
  return <StatIcon src={`${ASSETS}/cerveau.webp?v=${ICONES_REV}`} height="0.75em" />;
}

/** Épée de Puissance et bouclier de Résistance : même hauteur, en `em` pour suivre le chiffre. */
function SwordGlyph() {
  return <StatIcon src={`${ASSETS}/epee.webp?v=${ICONES_REV}`} height="1.1em" />;
}

function ShieldGlyph() {
  return <StatIcon src={`${ASSETS}/bouclier.webp?v=${ICONES_REV}`} height="0.9em" />;
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
      style={{ height, filter: "drop-shadow(0 0 0.8cqw rgba(0,0,0,0.9)) drop-shadow(0 0 2.5cqw rgba(0,0,0,0.6))" }}
      draggable={false}
    />
  );
}

/** Une Abyssale garde toujours son cadre (c'est sa variante qui le dicte) ; sinon légendaire ou standard. */
function frameName(def: CardDefinition, legendaire: boolean): NomDeCadre {
  if (isAbyssalVariant(def)) return "cadre-abyssal";
  return legendaire ? "cadre-legendaire" : "cadre";
}
