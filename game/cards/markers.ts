import type { CardDefinition, CardInstance } from "@/game/cards/types";
import { hasSubtype, type SubtypeId } from "@/game/cards/subtypes";

/**
 * MARQUEURS — des jetons de carton qu'une règle POSE sur une carte en jeu
 * (Lot 18, décision du 09/10/2026). Ce ne sont pas des états : un état
 * (Garde, Éveil…) est un médaillon sur le cadre, un marqueur se pose sur
 * l'illustration (`public/assets/markers/`).
 *
 * Un marqueur n'est posé QUE quand le texte d'une carte le dit (« ramenez-la
 * du Cimetière avec un marqueur Mort ») : aucun effet n'en pose en silence.
 *
 * Il vit sur l'exemplaire EN JEU (`CardInstance.markers`) et part avec lui :
 * une carte qui quitte le plateau (Cimetière, main, pioche) le perd. C'est
 * `stripMarkers` qui le garantit aux portes du plateau.
 *
 * Les marqueurs Niveau de la lignée LV (Lot 17) ont précédé cette primitive
 * et vivent encore à part (`CardInstance.levelMarkers`).
 */
export type MarkerId = "mort";

export interface MarkerRule {
  /** Nom imprimé (« un marqueur Mort »). */
  label: string;
  /** Combien une même carte peut en porter. */
  max: number;
  /**
   * Une carte qui le porte compte AUSSI comme ce sous-type, pour tous les
   * effets (« une unité marquée Mort est Mort-vivant ») — lu par
   * `unitHasSubtype`, jamais par `hasSubtype` seul.
   */
  grantsSubtype?: SubtypeId;
  /**
   * Quand une carte qui le porte devrait rejoindre le Cimetière, elle va
   * ailleurs, et le marqueur est retiré (`game/state/processDeaths.ts`).
   */
  insteadOfGraveyard?: "deckBottom";
  /**
   * Une carte qui porte DÉJÀ ce sous-type (imprimé) ne le reçoit jamais :
   * le marqueur ne sert qu'à faire entrer une autre famille dans la sienne.
   */
  refusedOnSubtype?: SubtypeId;
}

/**
 * Le marqueur MORT (Lot 18, règle validée le 09/10/2026) :
 *  - une unité qui le porte est Mort-vivant, en plus de ses sous-types ;
 *  - un seul par unité ;
 *  - une unité marquée qui devrait rejoindre le Cimetière va SOUS la pioche
 *    de son propriétaire, et perd le marqueur : on ne ramène pas deux fois
 *    de suite la même unité, aucune boucle n'est possible ;
 *  - un Mort-vivant n'en porte JAMAIS (décision du 10/10/2026) : le marqueur
 *    fait entrer les autres familles dans la sienne. Ramené « avec un
 *    marqueur Mort », un Mort-vivant revient sans.
 */
export const MARKER_RULES: Readonly<Record<MarkerId, MarkerRule>> = {
  mort: { label: "Mort", max: 1, grantsSubtype: "mort-vivant", insteadOfGraveyard: "deckBottom", refusedOnSubtype: "mort-vivant" },
};

export type CardMarkers = Partial<Record<MarkerId, number>>;

/** Nombre de marqueurs `marker` sur cette carte. */
export function markerCount(card: Pick<CardInstance, "markers">, marker: MarkerId): number {
  return card.markers?.[marker] ?? 0;
}

/** La carte porte-t-elle au moins un marqueur `marker` ? */
export function hasMarker(card: Pick<CardInstance, "markers">, marker: MarkerId): boolean {
  return markerCount(card, marker) > 0;
}

/** Peut-on encore lui en poser un (`MarkerRule.max`) ? */
export function canReceiveMarker(card: Pick<CardInstance, "markers">, marker: MarkerId, def: Pick<CardDefinition, "subtype" | "subtypes">): boolean {
  const rule = MARKER_RULES[marker];
  // La famille qui le refuse (`refusedOnSubtype`) : jamais, même sans en porter.
  if (rule.refusedOnSubtype && hasSubtype(def, rule.refusedOnSubtype)) return false;
  return markerCount(card, marker) < rule.max;
}

/** La carte avec un marqueur `marker` de plus, sans dépasser le maximum de la règle. */
export function withMarker<T extends CardInstance>(card: T, marker: MarkerId, amount = 1): T {
  const next = Math.min(MARKER_RULES[marker].max, markerCount(card, marker) + amount);
  return { ...card, markers: { ...card.markers, [marker]: next } };
}

/** La carte sans aucun marqueur : ce qu'elle devient en quittant le plateau. */
export function stripMarkers<T extends CardInstance>(card: T): T {
  if (!card.markers) return card;
  const { markers: _markers, ...rest } = card;
  return rest as T;
}

/** Ce qu'un marqueur porté impose à la carte qui devrait rejoindre le Cimetière, s'il impose quelque chose. */
export function graveyardReplacementOf(card: Pick<CardInstance, "markers">): "deckBottom" | undefined {
  for (const [marker, count] of Object.entries(card.markers ?? {}) as Array<[MarkerId, number]>) {
    if (count > 0 && MARKER_RULES[marker].insteadOfGraveyard) return MARKER_RULES[marker].insteadOfGraveyard;
  }
  return undefined;
}

/**
 * Le sous-type d'une carte EN JEU : ceux de sa définition (`hasSubtype`),
 * plus ceux que lui donnent ses marqueurs. C'est la question que pose tout
 * effet qui vise un sous-type sur le plateau ; hors du plateau, une carte
 * n'a plus de marqueur et `hasSubtype` suffit.
 */
export function unitHasSubtype(def: Pick<CardDefinition, "subtype" | "subtypes">, card: Pick<CardInstance, "markers">, subtype: string): boolean {
  if (hasSubtype(def, subtype)) return true;
  return (Object.entries(card.markers ?? {}) as Array<[MarkerId, number]>).some(
    ([marker, count]) => count > 0 && MARKER_RULES[marker].grantsSubtype === subtype
  );
}
