import type { GameEvent, PlayerId, QualificationId } from "@/game";

/**
 * Données PURES de la mise en scène des qualifications : le moment et la
 * couleur de chacune, et la lecture de l'événement du moteur. Sans DOM ni
 * son — `useAttackPresentation` les lit, `qualificationFx.ts` les joue.
 */

export const QUALIFICATION_SHOW_MS = 1150;

export type QualificationMoment = "declare" | "impact" | "after";
export type Tone = "gold" | "blue" | "red" | "purple" | "green";

export const TONES: Record<Tone, string> = {
  gold: "253,224,71",
  blue: "125,211,252",
  red: "248,113,113",
  purple: "232,121,249",
  green: "134,239,172",
};

interface FxSpec {
  moment: QualificationMoment;
  /** Décalage après le moment, pour que plusieurs glyphes se lisent l'un après l'autre. */
  offsetMs: number;
  tone: Tone;
  /** Où le glyphe se pose : sur le porteur, ou sur ce que la qualification touche. */
  on: "source" | "target";
  caption: (amount?: number) => string;
}

export const QUALIFICATION_FX: Record<QualificationId, FxSpec> = {
  rafale: { moment: "declare", offsetMs: 0, tone: "gold", on: "source", caption: () => "Rafale — 2e attaque" },
  deluge: { moment: "declare", offsetMs: 0, tone: "blue", on: "source", caption: () => "Déluge" },
  contournement: { moment: "declare", offsetMs: 120, tone: "blue", on: "source", caption: () => "Contournement" },
  salve: { moment: "declare", offsetMs: 0, tone: "gold", on: "source", caption: () => "Salve" },
  "coup-de-grace": { moment: "impact", offsetMs: 0, tone: "red", on: "target", caption: () => "Coup de grâce" },
  eclaboussure: { moment: "impact", offsetMs: 90, tone: "blue", on: "target", caption: (n) => `Éclaboussure ${n ?? ""}`.trim() },
  entaille: { moment: "impact", offsetMs: 160, tone: "purple", on: "target", caption: (n) => `Entaille −${n ?? 0} Puissance` },
  breche: { moment: "impact", offsetMs: 260, tone: "red", on: "target", caption: (n) => `Brèche +${n ?? 0}` },
  ponction: { moment: "impact", offsetMs: 420, tone: "purple", on: "target", caption: (n) => `Ponction −${n ?? 0} Raison` },
  sangsue: { moment: "impact", offsetMs: 560, tone: "green", on: "target", caption: (n) => `Sangsue +${n ?? 0} Ancrage` },
  carnage: { moment: "after", offsetMs: 0, tone: "red", on: "source", caption: () => "Carnage — une attaque de plus" },
};

/** Une qualification à mettre en scène : ce que dit l'événement du moteur. */
export interface QualificationFx {
  qualification: QualificationId;
  sourceInstanceId: string;
  targetInstanceId?: string;
  targetPlayerId?: PlayerId;
  amount?: number;
}

export function qualificationFxFrom(event: GameEvent): QualificationFx | null {
  if (event.type !== "QUALIFICATION_TRIGGERED") return null;
  return {
    qualification: event.qualification,
    sourceInstanceId: event.sourceInstanceId,
    targetInstanceId: event.targetInstanceId,
    targetPlayerId: event.targetPlayerId,
    amount: event.amount,
  };
}

