"use client";

import { ARCHETYPE_LABELS, displayedSubtypes, isAbyssalVariant, subtypeLabel, type CardDefinition } from "@/game";
import { CARD_TYPE_LABELS } from "@/features/match/cardDisplay";
import { cardSetMark } from "@/game/boosters";
import type { CardFinish } from "@/game/cosmetics/finishes";
import { isFullArt, type CardArtwork } from "@/game/cosmetics/artworks";
import { cardArtworkUrl } from "@/features/decks/cardArtUrl";
import { HIDDEN_ARTWORK_FILTER } from "@/features/collection/hiddenArtwork";
import { useLayoutEffect, useRef } from "react";
import { useDebordPleinCadre } from "@/features/match/useDebordPleinCadre";
import { useImageOk } from "@/features/match/useImageOk";
import { effectLead, effectLine, type QualificationChip } from "@/features/match/qualificationDisplay";
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

/** Vert Mort-vivant : un sous-type venu d'un marqueur (lisible sur le cadre clair comme sur l'illustration). */
export const MARKER_SUBTYPE_COLOR = "#5fd86a";
const MARKER_SUBTYPE_GLOW = "0 0 0.6cqw rgba(20, 60, 25, 0.9), 0 0 1.4cqw rgba(95, 216, 106, 0.45)";

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
  /** Qualifications (« spé. ») à écrire en tête de l'effet, en gras : « Sangsue — … ». */
  qualifications?: readonly QualificationChip[];
  /**
   * Finition de l'exemplaire (16/10/2026, `game/cosmetics/finishes.ts`) :
   * Monochrome, Foil, Negative, Prisma, Star Foil — des FILTRES posés sur
   * l'illustration seule, jamais sur le cadre ni les textes. Défaut : Classique.
   */
  finition?: CardFinish;
  /**
   * Illustration de l'exemplaire (Collection visuelle V2, `artworks.ts`).
   * Styled : l'image change, le cadre reste. Styled Full-Art : nom, coût,
   * type et effet sont PEINTS dans l'image — ni liseré ni textes : le cadre
   * ne pose plus que Puissance et Résistance. Défaut : Classique.
   */
  illustration?: CardArtwork;
  /**
   * Sous-types que l'exemplaire EN JEU tient de ses marqueurs
   * (`markerGrantedSubtypes`) : écrits à la suite des imprimés, en vert —
   * un mort ramené avec un marqueur Mort devient « Mort-vivant ».
   */
  markerSubtypes?: readonly string[];
  /** Illustration pas encore sortie, ni obtenue ni vue en mode Dev (`isArtworkHidden`) : floutée, sans stats. */
  illustrationCachee?: boolean;
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
export function NouveauCadreFace({
  def,
  legendaire = false,
  attack,
  health,
  attackClassName = "",
  healthClassName = "",
  qualifications,
  finition = "classique",
  illustration: oeuvre = "classique",
  illustrationCachee = false,
  markerSubtypes = [],
}: NouveauCadreFaceProps) {
  const illustration = cardArtworkUrl(def.id, oeuvre);
  // Le texte d'une Full-Art est dans l'image : le réécrire le doublerait.
  const textesPeints = isFullArt(oeuvre);
  // Cachée (pas encore sortie) : l'image floutée SEULE, sans liseré, textes ni
  // stats — sinon une Styled se lisait en entier sous son flou.
  const imageSeule = textesPeints || illustrationCachee;
  const illustrationOk = useImageOk(illustration);
  const hasPower = def.attack !== undefined;
  const hasResistance = def.health !== undefined;
  const abyssale = isAbyssalVariant(def);
  const shownSubtypes = displayedSubtypes(def);
  // Le débord est le sujet de l'illustration CLASSIQUE d'une Abyssale.
  const debord = abyssale && oeuvre === "classique" ? `/assets/cards/illustrations/${def.id}-debord.webp` : null;
  const debordOk = useImageOk(debord);
  const debordPlein = useDebordPleinCadre(debordOk ? debord : null);
  const nomRef = useRef<HTMLHeadingElement>(null);
  const effetRef = useRef<HTMLParagraphElement>(null);
  useFitText(nomRef, def.name, nameSizeCqw(def.name), 6.5);
  // « Spé. » : mots-clés de tête (Garde, Pied marin) et qualifications, en gras devant le reste du texte.
  const { lead: spe, text: reste } = effectLead(def.text, qualifications ?? []);
  // Le texte mesuré inclut la spé. : c'est lui qui occupe la zone d'effet.
  const texteEffet = effectLine(def.text, qualifications ?? []);
  useFitText(effetRef, texteEffet, rulesSizeCqw(texteEffet), 2.6, EFFET_LISIBLE_CQW, RULES_FLOOR);

  const cadre = frameName(def, legendaire);
  const calage = CALAGES[cadre];
  // Rareté et extension d'origine, « L-BD » (16/10/2026) : le sigle de collection ; « S-MM » pour une Styled.
  const sigle = cardSetMark(def.id, oeuvre);

  return (
    <div
      // Negative : les textes passent en noir sur halo blanc, les icônes s'inversent (16/10/2026).
      className={`absolute inset-0 select-none ${finition === "negative" ? styles.negatif : ""}`}
      data-finition={finition}
      data-illustration={oeuvre}
      style={{
        containerType: "inline-size",
        // Full-Art : PAS de liseré (retour du 18/10/2026) — l'image occupe toute
        // la silhouette de la carte, celle que dessinerait le liseré.
        ["--illus-inset" as string]: imageSeule ? calage.silhouette : calage.illustration,
        ["--illus-radius" as string]: imageSeule ? calage.rayonSilhouette : calage.rayon,
      }}
    >
      {/* Couche 1 : l'illustration, plein cadre, coupée à l'arrondi du liseré. */}
      <div
        className="absolute overflow-hidden bg-slate-900"
        style={{ inset: "var(--illus-inset)", borderRadius: "var(--illus-radius)" }}
        data-illustration-cachee={illustrationCachee || undefined}
      >
        {/* Le flou d'une illustration cachée est posé ICI, sous la découpe : il ne bave pas hors de la carte. */}
        <div className="absolute inset-0" style={illustrationCachee ? { filter: HIDDEN_ARTWORK_FILTER, transform: "scale(1.08)" } : undefined}>
        {illustrationOk ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={illustration} alt="" className={`h-full w-full object-cover ${FILTRE_FINITION[finition]}`} draggable={false} />
        ) : (
          <div className={`h-full w-full bg-gradient-to-b from-slate-700 to-slate-950 ${FILTRE_FINITION[finition]}`} />
        )}
        {/* Finitions à reflets : leur lumière reste DANS l'illustration, sous le liseré. */}
        <RefletsFinition finition={finition} />
        </div>
        {/* Pas de voile continu (maquette du 04/10/2026) : chaque texte porte sa
            propre ombre floue (`HALO`), l'illustration reste lisible partout ailleurs. */}
      </div>

      {/* Couche 2 : le liseré — jamais sur une Full-Art, dont l'image est le cadre. */}
      {!imageSeule && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={`${ASSETS}/${cadre}.webp`}
          alt=""
          className="pointer-events-none absolute inset-0 h-full w-full"
          draggable={false}
        />
      )}

      {/* Couche 3 (Abyssales) : le sujet, qui déborde du liseré et se fond dans le voile en pied. */}
      {abyssale && debordOk && debord && debordPlein === true && (
        // Calque peint sur le canevas de l'illustration : il se pose exactement
        // comme elle (même boîte, même cadrage), par-dessus le liseré.
        <div className="pointer-events-none absolute" style={{ inset: "var(--illus-inset)" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={debord} alt="" className={`h-full w-full object-cover ${styles.debord} ${FILTRE_FINITION[finition]}`} draggable={false} />
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
            className={`absolute object-contain object-bottom ${styles.debord} ${FILTRE_FINITION[finition]}`}
            style={{ top: 0, left: 0, width: "100%", height: "66%" }}
            draggable={false}
          />
        </div>
      )}

      {/* Couche 4 : l'effet de rareté, sous les textes. */}
      {illustrationCachee ? null : abyssale ? <EffetAbyssal /> : legendaire ? <EffetLegendaire /> : null}

      {/* Cachée : son sigle, discret, au milieu du flou — « S » (Styled), « FA » (Full-Art). */}
      {illustrationCachee && (
        <span
          data-illustration-sigle
          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 select-none rounded-full font-semibold uppercase leading-none text-white/85 [font-family:var(--font-card-title)]"
          style={{
            fontSize: "9cqw",
            letterSpacing: "0.12em",
            padding: "3.5cqw 5cqw 3.5cqw 6.2cqw",
            border: "0.5cqw solid rgba(255,255,255,0.45)",
            background: "rgba(8,12,20,0.35)",
            textShadow: HALO_TEXTE,
          }}
          aria-label={textesPeints ? "Full-Art pas encore sortie" : "Styled pas encore sortie"}
        >
          {textesPeints ? "FA" : "S"}
        </span>
      )}

      {!imageSeule && (
      <>
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
          ["--plaque-type" as string]: "1",
          textShadow: HALO,
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={`${ASSETS}/types/${def.type}.webp?v=${ICONES_REV}`}
          alt=""
          data-icone
          className="object-contain"
          style={{ height: "9cqw", width: "auto", filter: "drop-shadow(0 0 1cqw rgba(0,0,0,0.9)) drop-shadow(0 0 3cqw rgba(0,0,0,0.6))" }}
          draggable={false}
        />
        <span
          className="whitespace-nowrap font-semibold uppercase leading-none [font-family:var(--font-card-title)]"
          style={{ fontSize: "3.4cqw", letterSpacing: "0.04em" }}
        >
          {CARD_TYPE_LABELS[def.type]}
        </span>
        {/* Les SOUS-TYPES, juste sous le type (décision du 09/10/2026) : ce
            que les effets visent (« vos Chevaliers »), deux ou trois au plus. */}
        {(shownSubtypes.length > 0 || markerSubtypes.length > 0) && (
          <span
            className="whitespace-nowrap italic leading-none [font-family:var(--font-card-title)]"
            style={{ fontSize: "2.6cqw", letterSpacing: "0.03em", marginTop: "-0.2cqw" }}
          >
            {shownSubtypes.length > 0 && <span style={{ opacity: 0.85 }}>{shownSubtypes.map(subtypeLabel).join(" · ")}</span>}
            {/* Ce que lui donnent ses marqueurs, à la suite, en vert Mort-vivant. */}
            {markerSubtypes.map((subtype, index) => (
              <span key={subtype} style={{ color: MARKER_SUBTYPE_COLOR, textShadow: MARKER_SUBTYPE_GLOW, fontWeight: 700 }}>
                {shownSubtypes.length > 0 || index > 0 ? " · " : ""}
                {subtypeLabel(subtype)}
              </span>
            ))}
          </span>
        )}
      </div>

      {/* L'ARCHÉTYPE, discret, tout en bas au centre (décision du 09/10/2026) :
          la famille se lit sans prendre la place des sous-types. */}
      {def.archetype && (
        <span
          className="absolute overflow-hidden text-ellipsis whitespace-nowrap text-center italic leading-none text-white [font-family:var(--font-card-title)]"
          style={{ left: "32%", right: "32%", bottom: "4.6%", fontSize: "2.3cqw", letterSpacing: "0.05em", opacity: 0.6, textShadow: HALO_TEXTE }}
        >
          {ARCHETYPE_LABELS[def.archetype]}
        </span>
      )}

      {/* SIGLE DE COLLECTION, en bas à gauche (16/10/2026) : la rareté puis
          l'extension d'où vient la carte — « L-BD », Légendaire du Booster Défaut. */}
      {sigle && (
        <span
          data-set-mark
          title="Rareté — extension"
          className="absolute whitespace-nowrap font-semibold uppercase leading-none text-white [font-family:var(--font-card-title)]"
          style={{ left: "9%", bottom: "4.6%", fontSize: "2.6cqw", letterSpacing: "0.08em", opacity: 0.8, textShadow: HALO_TEXTE }}
        >
          {sigle}
        </span>
      )}

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
      {texteEffet && (
        <p
          ref={effetRef}
          className={`absolute font-semibold text-white [font-family:var(--font-card-body)] ${styles.regles}`}
          style={{
            top: `${ZONE_EFFET_HAUT}%`,
            // Sans stats, le texte s'arrête au-dessus du pied (sigle de collection, archétype).
            bottom: hasPower || hasResistance ? "14%" : "8%",
            left: "9%",
            right: "9%",
            fontSize: `max(${rulesSizeCqw(texteEffet)}cqw, ${RULES_FLOOR})`,
            lineHeight: 1.18,
            textShadow: HALO_TEXTE,
          }}
        >
          {spe && (
            <strong data-qualifications className="font-extrabold">
              {spe}
            </strong>
          )}
          {spe && reste ? " — " : null}
          {reste}
        </p>
      )}
      </>
      )}

      {/* Stats : une ligne en bas à droite, la Puissance à gauche de la Résistance. */}
      {(hasPower || hasResistance) && !illustrationCachee && (
        <div
          className="absolute flex items-center font-bold leading-none text-white [font-family:var(--font-card-title)]"
          style={{
            right: "9%",
            bottom: "4.5%",
            gap: "4cqw",
            fontSize: "9cqw",
            textShadow: HALO,
            // Full-Art : rien n'est réservé à cet endroit de l'image (Elyor y a
            // ses ornements) — une ombre épaisse, comme la plaque du type.
            ...(textesPeints
              ? { padding: "2cqw 3cqw", background: "radial-gradient(ellipse at center, rgba(0,0,0,0.8) 0%, rgba(0,0,0,0.55) 50%, rgba(0,0,0,0) 75%)" }
              : null),
          }}
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

/**
 * Filtre de l'illustration par finition — le sujet d'une Abyssale (débord)
 * le reçoit aussi. Exporté : la tuile du plateau (`CardTile`, ancien cadre)
 * pose la même finition sur son illustration.
 */
export const FILTRE_FINITION: Record<CardFinish, string> = {
  classique: "",
  monochrome: styles.finitionMonochrome!,
  foil: styles.finitionFoil!,
  negative: styles.finitionNegative!,
  prismatic: styles.finitionPrismatic!,
  "star-foil": styles.finitionStarFoil!,
};

/** Éclats de la Star Foil : position (% de l'illustration), couleur et décalage, fixes. */
const ECLATS_STAR_FOIL = [
  { top: 9, left: 18, teinte: 52, delai: 0 },
  { top: 15, left: 72, teinte: 190, delai: 0.6 },
  { top: 28, left: 40, teinte: 300, delai: 1.4 },
  { top: 36, left: 86, teinte: 120, delai: 0.3 },
  { top: 44, left: 10, teinte: 20, delai: 1.9 },
  { top: 52, left: 58, teinte: 260, delai: 1.1 },
  { top: 61, left: 30, teinte: 170, delai: 2.3 },
  { top: 66, left: 80, teinte: 45, delai: 0.8 },
  { top: 22, left: 92, teinte: 330, delai: 1.7 },
  { top: 72, left: 52, teinte: 210, delai: 2.6 },
  { top: 5, left: 52, teinte: 90, delai: 2.0 },
  { top: 48, left: 34, teinte: 0, delai: 0.5 },
  { top: 33, left: 64, teinte: 140, delai: 1.2 },
  { top: 58, left: 92, teinte: 280, delai: 0.2 },
  { top: 18, left: 6, teinte: 200, delai: 2.8 },
  { top: 70, left: 14, teinte: 60, delai: 1.6 },
];

/**
 * Les REFLETS d'une finition (Foil, Star Foil, Prisma), posés au-dessus de
 * l'illustration, dans sa découpe. Le parent doit être un conteneur
 * (`container-type: inline-size`) : les éclats de la Star Foil se mesurent
 * en `cqw`. Partagé avec la tuile du plateau.
 */
export function RefletsFinition({ finition }: { finition: CardFinish }) {
  if (finition === "foil") return <div className={styles.foilReflet} aria-hidden />;
  if (finition === "star-foil") return <EffetStarFoil />;
  if (finition === "prismatic") return <EffetPrismatic />;
  return null;
}

function EffetStarFoil() {
  return (
    <>
      <div className={styles.holoFoil} aria-hidden />
      {ECLATS_STAR_FOIL.map((eclat, index) => (
        <span
          key={index}
          className={styles.eclatFoil}
          aria-hidden
          style={{ top: `${eclat.top}%`, left: `${eclat.left}%`, animationDelay: `${eclat.delai}s`, ["--teinte" as string]: eclat.teinte }}
        />
      ))}
    </>
  );
}

function EffetPrismatic() {
  return (
    <>
      <div className={styles.prismeRayons} aria-hidden />
      <div className={styles.prismeArcEnCiel} aria-hidden />
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

/** En dessous de cette taille, l'effet se lit mal même en aperçu : l'encart de lecture prend le relais. */
const EFFET_LISIBLE_CQW = 3.4;

/**
 * PLANCHER du texte d'effet, en pixels : là où on PARCOURT des cartes
 * (ouverture de booster, collection), l'effet doit se lire sans ouvrir la
 * carte (retour du 13/10/2026). Ces écrans posent `--card-rules-min` ; un
 * texte trop long pour sa zone à cette taille y défile au lieu de
 * rapetisser. Ailleurs (plateau, main), la variable est absente : 0.
 */
const RULES_FLOOR = "var(--card-rules-min, 0px)";

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
function useFitText(ref: React.RefObject<HTMLElement | null>, text: string, baseCqw: number, minCqw: number, smallCqw?: number, floor?: string) {
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !text) return;
    const sized = (cqw: number) => (floor ? `max(${cqw}cqw, ${floor})` : `${cqw}cqw`);
    const fit = () => {
      let size = baseCqw;
      el.style.fontSize = sized(size);
      // Le nom est calé en BAS : ce qui déborde part vers le haut, où
      // `scrollHeight` ne le voit pas. On mesure donc son contenu (premier enfant).
      const contenu = (el.firstElementChild as HTMLElement | null) ?? el;
      const deborde = () =>
        (contenu === el ? el.scrollHeight : contenu.offsetHeight) > el.clientHeight + 1 || contenu.scrollWidth > el.clientWidth + 1;
      while (size > minCqw && deborde()) {
        size = Math.max(minCqw, size - 0.25);
        el.style.fontSize = sized(size);
      }
      // Texte devenu PETIT pour tenir : l'aperçu ajoute alors l'encart de
      // lecture (`CardRulesPanel`, affiché par `:has([data-fit-small])`).
      if (smallCqw !== undefined) el.toggleAttribute("data-fit-small", size < smallCqw || deborde());
    };
    fit();
    let alive = true;
    void document.fonts?.ready.then(() => alive && fit());
    return () => {
      alive = false;
    };
  }, [ref, text, baseCqw, minCqw, smallCqw, floor]);
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
      data-icone
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
