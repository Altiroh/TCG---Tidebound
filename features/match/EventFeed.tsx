"use client";

import { useMemo, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { getCardDefinition, getShipDefinition, type GameState, type PlayerId } from "@/game";
import { CardThumb } from "@/features/match/CardThumb";
import { findInstanceCardId } from "@/features/match/formatEvent";

type PlayerLabel = (playerId?: string) => string;

/**
 * Nombre de faits marquants gardés. Le journal ne défile PAS et ne s'ouvre
 * pas : il montre les dernières actions, un point c'est tout (demande du
 * 15/09). Assez peu pour tenir dans le feutre de la colonne à toutes les
 * tailles d'écran ; ce qui déborderait malgré tout est masqué par
 * `overflow: hidden` côté colonne, les lignes les plus récentes étant
 * ancrées en bas.
 */
const HIGHLIGHT_COUNT = 5;

type Highlight =
  | {
      kind: "attack";
      key: string;
      attackerCardId?: string;
      target: { cardId?: string } | { playerId: PlayerId };
      amount: number;
      retaliation: number;
      defenderDestroyed: boolean;
      /** Récapitulatif en toutes lettres, affiché en infobulle au survol. */
      summary: string;
    }
  | { kind: "effect"; key: string; targetCardId?: string; attack: number; health: number; summary: string };

/** Variation abrégée pour la version compacte ("+1 Rés.", "-2 Puis."). */
function shortDelta(value: number, unit: string): string {
  return `${value > 0 ? "+" : ""}${value} ${unit}`;
}

function cardLabel(cardId: string | undefined, fallback = "Une carte"): string {
  if (!cardId) return fallback;
  try {
    return getCardDefinition(cardId).name;
  } catch {
    return fallback;
  }
}

/**
 * Faits marquants du journal : uniquement les attaques (avec leurs dégâts,
 * riposte et destruction regroupés) et les effets de stats appliqués — le
 * journal ne montre QUE ce qui s'est passé sur les cartes.
 */
function buildHighlights(state: GameState, label: PlayerLabel): Highlight[] {
  const events = state.eventLog;
  const highlights: Highlight[] = [];
  // Parcours À REBOURS, arrêté dès qu'on a les `HIGHLIGHT_COUNT` derniers :
  // seule la fin du journal est affichée, inutile de reconstituer toute la
  // partie (et de recopier la suite du journal à chaque attaque) à chaque rendu.
  for (let index = events.length - 1; index >= 0 && highlights.length < HIGHLIGHT_COUNT; index--) {
    const event = events[index]!;
    if (event.type === "BUFF_APPLIED" || event.type === "DEBUFF_APPLIED") {
      const targetCardId = findInstanceCardId(state, event.targetInstanceId);
      const parts = [
        event.attack !== 0 ? `${shortDelta(event.attack, "Puissance")}` : "",
        event.health !== 0 ? `${shortDelta(event.health, "Résistance")}` : "",
      ].filter(Boolean);
      highlights.push({
        kind: "effect",
        key: `${index}`,
        targetCardId,
        attack: event.attack,
        health: event.health,
        summary: `${cardLabel(targetCardId)} : ${parts.join(" et ") || "aucune variation"}.`,
      });
      continue;
    }
    if (event.type !== "ATTACK") continue;

    let amount = 0;
    let retaliation = 0;
    let targetPlayerId: PlayerId | undefined;
    let defenderDestroyed = false;
    for (let nextIndex = index + 1; nextIndex < events.length; nextIndex++) {
      const next = events[nextIndex]!;
      if (next.type === "ATTACK" || next.type === "END_TURN" || next.type === "PHASE_CHANGED") break;
      if (next.type === "DAMAGE") {
        if (event.defenderInstanceId && next.targetInstanceId === event.defenderInstanceId) amount += next.amount;
        else if (next.targetInstanceId === event.attackerInstanceId) retaliation += next.amount;
        else if (!event.defenderInstanceId && next.targetPlayerId) {
          amount += next.amount;
          targetPlayerId = next.targetPlayerId;
        }
      } else if (next.type === "DESTROY" && next.instanceId === event.defenderInstanceId) {
        defenderDestroyed = true;
      }
    }
    const opponentId = state.players.find((player) => player.id !== event.playerId)?.id;
    const attackerCardId = findInstanceCardId(state, event.attackerInstanceId);
    const defenderCardId = event.defenderInstanceId ? findInstanceCardId(state, event.defenderInstanceId) : undefined;
    const targetName = event.defenderInstanceId
      ? cardLabel(defenderCardId)
      : `le Navire de ${label(targetPlayerId ?? opponentId ?? event.playerId)}`;
    const summary = [
      `${cardLabel(attackerCardId)} attaque ${targetName} : ${amount} dégât${amount > 1 ? "s" : ""}.`,
      defenderDestroyed ? " Cible détruite." : "",
      retaliation > 0 ? ` Riposte : ${retaliation} dégât${retaliation > 1 ? "s" : ""} subi${retaliation > 1 ? "s" : ""}.` : "",
    ].join("");

    highlights.push({
      kind: "attack",
      key: `${index}`,
      attackerCardId,
      target: event.defenderInstanceId ? { cardId: defenderCardId } : { playerId: targetPlayerId ?? opponentId ?? event.playerId },
      amount,
      retaliation,
      defenderDestroyed,
      summary,
    });
  }
  return highlights.reverse();
}

function shipIllustration(state: GameState, playerId: PlayerId): string | undefined {
  const player = state.players.find((p) => p.id === playerId);
  const illustration = player ? getShipDefinition(player.shipId).illustration : undefined;
  return illustration ? `/assets/ships/illu/${illustration}` : undefined;
}

/**
 * Couleur d'une variation de stat : une HAUSSE est verte, une BAISSE rouge
 * — chaque composante jugée pour elle-même. Un "+1 Puissance / -1
 * Résistance" affiche donc bien un morceau vert et un morceau rouge, là où
 * une teinte unique tirée de la somme rendait l'augmentation rouge (retour
 * du 15/09 : « l'info d'une augmentation n'est pas forcément en vert »).
 */
function deltaToneClass(value: number): string {
  return value > 0 ? "text-emerald-300" : value < 0 ? "text-rose-300" : "text-slate-300";
}

function HighlightRow({ state, highlight, thumbSize = 20 }: { state: GameState; highlight: Highlight; thumbSize?: number }) {
  // Le texte suit la taille des miniatures (variante « colonne » du nouveau plateau, plus grande).
  const text = { fontSize: Math.max(10, Math.round(thumbSize * 0.42)) };
  if (highlight.kind === "effect") {
    // Bordure de la miniature : teinte du signe DOMINANT, faute de pouvoir
    // en afficher deux — le texte, lui, garde une couleur par composante.
    const dominant = Math.abs(highlight.attack) >= Math.abs(highlight.health) ? highlight.attack : highlight.health;
    return (
      <div className="flex items-center gap-1">
        <CardThumb
          cardId={highlight.targetCardId}
          size={thumbSize}
          className={dominant >= 0 ? "border-emerald-400/50" : "border-rose-400/50"}
        />
        <span className="flex min-w-0 flex-wrap items-center gap-x-1 font-semibold" style={text}>
          {highlight.attack !== 0 && <span className={deltaToneClass(highlight.attack)}>{shortDelta(highlight.attack, "Puis.")}</span>}
          {highlight.health !== 0 && <span className={deltaToneClass(highlight.health)}>{shortDelta(highlight.health, "Rés.")}</span>}
        </span>
      </div>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-x-1 gap-y-0.5">
      <CardThumb cardId={highlight.attackerCardId} size={thumbSize} />
      <span className="text-rose-300" style={text} aria-label="attaque">
        ⚔
      </span>
      {"playerId" in highlight.target ? (
        <CardThumb src={shipIllustration(state, highlight.target.playerId)} glyph="⚓" size={thumbSize} />
      ) : (
        <CardThumb cardId={highlight.target.cardId} size={thumbSize} className={highlight.defenderDestroyed ? "border-rose-500/70 opacity-60" : undefined} />
      )}
      <span className="font-semibold text-rose-300" style={text}>
        {highlight.amount > 0 ? `-${highlight.amount}` : "0"}
        {highlight.defenderDestroyed ? " ☠" : ""}
      </span>
      {highlight.retaliation > 0 && (
        <span className="w-full text-[9px] leading-none text-slate-400">riposte -{highlight.retaliation}</span>
      )}
    </div>
  );
}

/**
 * Infobulle du journal : posée en coordonnées VIEWPORT via un portail, pour
 * ne pas être rognée par le `overflow: hidden` de la colonne ni décalée par
 * ses transformations. Ancrée à gauche de la ligne survolée (la colonne
 * longe le bord droit de l'écran) et recentrée verticalement sur elle.
 */
function JournalTooltip({ text, anchor }: { text: string; anchor: DOMRect }) {
  if (typeof document === "undefined") return null;
  return createPortal(
    <div
      role="tooltip"
      className="pointer-events-none fixed z-[90] max-w-[min(320px,60vw)] -translate-x-full -translate-y-1/2 rounded-lg border border-white/20 bg-slate-950/95 px-3 py-2 text-[13px] leading-snug text-slate-100 shadow-[0_8px_30px_rgba(0,0,0,0.6)] backdrop-blur-md [font-family:var(--font-card-body)]"
      style={{ left: Math.max(8, anchor.left - 10), top: anchor.top + anchor.height / 2 }}
    >
      {text}
    </div>,
    document.body
  );
}

/**
 * Journal de partie — les DERNIÈRES actions, rien d'autre : ni défilement,
 * ni panneau complet à ouvrir (retrait demandé le 15/09). Chaque ligne est
 * abrégée avec les miniatures des cartes concernées ; le récapitulatif en
 * toutes lettres n'apparaît qu'au survol de la ligne, en infobulle.
 */
interface EventFeedProps {
  state: GameState;
  playerLabel?: PlayerLabel;
  /**
   * `panel` (défaut, ancien plateau) : encadré noir avec le titre « Journal ».
   * `rail` (nouveau plateau) : posé directement sur le feutre de la colonne
   * boussole, sans titre (le cadre suffit), miniatures plus grandes.
   */
  variant?: "panel" | "rail";
}

export function EventFeed({ state, playerLabel, variant = "panel" }: EventFeedProps) {
  const rail = variant === "rail";
  const thumbSize = rail ? 30 : 20;
  const [hovered, setHovered] = useState<{ text: string; anchor: DOMRect } | null>(null);
  const label = playerLabel ?? ((id?: string) => (id === "p1" ? "Joueur 1" : id === "p2" ? "Joueur 2" : "?"));
  // Le plateau se re-rend souvent sans que l'état change (survol, glisser…).
  const highlights = useMemo(() => buildHighlights(state, label), [state, label]);

  let body: ReactNode;
  if (highlights.length === 0) {
    body = <p className={`leading-snug text-slate-400 ${rail ? "text-[11px]" : "text-[10px]"}`}>Aucune attaque ni effet pour l&apos;instant.</p>;
  } else {
    body = highlights.map((highlight) => (
      <div
        key={highlight.key}
        onPointerEnter={(event) => setHovered({ text: highlight.summary, anchor: event.currentTarget.getBoundingClientRect() })}
        onPointerLeave={() => setHovered(null)}
        className="cursor-default rounded transition-colors hover:bg-white/10"
      >
        <HighlightRow state={state} highlight={highlight} thumbSize={thumbSize} />
      </div>
    ));
  }

  return (
    <>
      <div className={rail ? "flex h-full flex-col text-slate-100" : "flex h-full flex-col rounded-md border border-white/15 bg-black/90 text-slate-100"}>
        {!rail && (
          <div className="border-b border-white/10 py-1 pl-1.5 pr-1">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Journal</span>
          </div>
        )}
        {/* Aucun défilement : les lignes les plus récentes sont ancrées en
            bas (`justify-end`) et ce qui ne tient pas est simplement masqué. */}
        <div className={`flex flex-1 flex-col justify-end overflow-hidden ${rail ? "gap-2 py-1" : "gap-1.5 p-1.5"}`}>{body}</div>
      </div>
      {hovered && <JournalTooltip text={hovered.text} anchor={hovered.anchor} />}
    </>
  );
}
