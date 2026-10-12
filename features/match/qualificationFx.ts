"use client";

import { QUALIFICATIONS, qualificationGlyphUrl, type QualificationId } from "@/game";
import { showBadges } from "@/features/match/cardFx";
import { QUALIFICATION_TONES } from "@/features/match/qualificationFxData";
import { playCardAwake } from "@/lib/sound";

export * from "@/features/match/qualificationFxData";

/**
 * La SPÉ. S'ACTIVE, comme la Garde : la carte qui la porte se lève, le
 * médaillon de chaque qualification qui joue scintille à sa couleur (halo,
 * anneaux, éclats), puis elle se repose. Un médaillon absent de la carte
 * (glyphe pas encore livré, carte du labo qui ne la porte pas) apparaît en
 * haut le temps de se montrer. Le sort qui suit, s'il y en a un, est lancé
 * par `EffectFxLayer` (`qualificationVolley`).
 */
export function activateQualifications(el: HTMLElement, qualifications: readonly QualificationId[]): void {
  if (qualifications.length === 0) return;
  playCardAwake();
  showBadges(
    el,
    qualifications.map((id) => {
      const glyph = QUALIFICATIONS[id].glyph;
      return {
        iconSrc: qualificationGlyphUrl(id),
        badgeSelector: `img[src*="/qualifications/${glyph}."], [data-qualification-placeholder="${id}"]`,
        color: QUALIFICATION_TONES[id],
      };
    })
  );
}
