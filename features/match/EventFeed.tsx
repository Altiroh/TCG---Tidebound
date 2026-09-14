"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { getShipDefinition, type GameEvent, type GameState, type PlayerId } from "@/game";
import { CardThumb } from "@/features/match/CardThumb";
import { findInstanceCardId, formatEvent } from "@/features/match/formatEvent";

type PlayerLabel = (playerId?: string) => string;

/** Nombre de faits marquants gardés dans la version compacte. */
const HIGHLIGHT_COUNT = 6;

type Highlight =
  | {
      kind: "attack";
      key: string;
      attackerCardId?: string;
      target: { cardId?: string } | { playerId: PlayerId };
      amount: number;
      retaliation: number;
      defenderDestroyed: boolean;
    }
  | { kind: "effect"; key: string; targetCardId?: string; attack: number; health: number };

/** Variation abrégée pour la version compacte ("+1 Rés.", "-2 Puis."). */
function shortDelta(attack: number, health: number): string {
  const signed = (value: number) => `${value > 0 ? "+" : ""}${value}`;
  return [attack !== 0 ? `${signed(attack)} Puis.` : "", health !== 0 ? `${signed(health)} Rés.` : ""].filter(Boolean).join(" ");
}

/**
 * Faits marquants du journal : uniquement les attaques (avec leurs dégâts,
 * riposte et destruction regroupés) et les effets de stats appliqués — la
 * version compacte ne montre QUE ce qui s'est passé sur les cartes.
 */
function buildHighlights(state: GameState): Highlight[] {
  const events = state.eventLog;
  const highlights: Highlight[] = [];
  // Parcours À REBOURS, arrêté dès qu'on a les `HIGHLIGHT_COUNT` derniers :
  // seule la fin du journal est affichée, inutile de reconstituer toute la
  // partie (et de recopier la suite du journal à chaque attaque) à chaque rendu.
  for (let index = events.length - 1; index >= 0 && highlights.length < HIGHLIGHT_COUNT; index--) {
    const event = events[index]!;
    if (event.type === "BUFF_APPLIED" || event.type === "DEBUFF_APPLIED") {
      highlights.push({
        kind: "effect",
        key: `${index}`,
        targetCardId: findInstanceCardId(state, event.targetInstanceId),
        attack: event.attack,
        health: event.health,
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
    highlights.push({
      kind: "attack",
      key: `${index}`,
      attackerCardId: findInstanceCardId(state, event.attackerInstanceId),
      target: event.defenderInstanceId
        ? { cardId: findInstanceCardId(state, event.defenderInstanceId) }
        : { playerId: targetPlayerId ?? opponentId ?? event.playerId },
      amount,
      retaliation,
      defenderDestroyed,
    });
  }
  return highlights.reverse();
}

function shipIllustration(state: GameState, playerId: PlayerId): string | undefined {
  const player = state.players.find((p) => p.id === playerId);
  const illustration = player ? getShipDefinition(player.shipId).illustration : undefined;
  return illustration ? `/assets/ships/illu/${illustration}` : undefined;
}

function HighlightRow({ state, highlight }: { state: GameState; highlight: Highlight }) {
  if (highlight.kind === "effect") {
    const buff = highlight.attack + highlight.health >= 0;
    return (
      <div className="flex items-center gap-1">
        <CardThumb cardId={highlight.targetCardId} size={20} className={buff ? "border-emerald-400/50" : "border-rose-400/50"} />
        <span className={`truncate text-[10px] font-semibold ${buff ? "text-emerald-300" : "text-rose-300"}`}>
          {shortDelta(highlight.attack, highlight.health)}
        </span>
      </div>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-x-1 gap-y-0.5">
      <CardThumb cardId={highlight.attackerCardId} size={20} />
      <span className="text-[10px] text-rose-300" aria-label="attaque">
        ⚔
      </span>
      {"playerId" in highlight.target ? (
        <CardThumb src={shipIllustration(state, highlight.target.playerId)} glyph="⚓" size={20} />
      ) : (
        <CardThumb cardId={highlight.target.cardId} size={20} className={highlight.defenderDestroyed ? "border-rose-500/70 opacity-60" : undefined} />
      )}
      <span className="text-[10px] font-semibold text-rose-300">
        {highlight.amount > 0 ? `-${highlight.amount}` : "0"}
        {highlight.defenderDestroyed ? " ☠" : ""}
      </span>
      {highlight.retaliation > 0 && (
        <span className="w-full text-[9px] leading-none text-slate-400" title="Dégâts de riposte subis par l'attaquant">
          riposte -{highlight.retaliation}
        </span>
      )}
    </div>
  );
}

/** Miniatures des cartes impliquées dans un événement — jamais pour une pioche (la carte piochée est une information cachée). */
function eventThumbs(state: GameState, event: GameEvent): Array<{ cardId?: string; src?: string; glyph?: string }> {
  const card = (instanceId?: string) => (instanceId ? [{ cardId: findInstanceCardId(state, instanceId) }] : []);
  switch (event.type) {
    case "PLAY_CARD":
    case "SUMMON":
    case "HAND_CARD_REVEALED":
      return [{ cardId: event.cardId }];
    case "ATTACK":
      return [
        ...card(event.attackerInstanceId),
        ...(event.defenderInstanceId
          ? card(event.defenderInstanceId)
          : [{ src: shipIllustration(state, state.players.find((p) => p.id !== event.playerId)?.id ?? event.playerId), glyph: "⚓" }]),
      ];
    case "DAMAGE":
    case "HEAL":
      return event.targetInstanceId ? card(event.targetInstanceId) : [];
    case "BUFF_APPLIED":
    case "DEBUFF_APPLIED":
    case "STATUS_CHANGED":
      return card(event.targetInstanceId);
    case "DESTROY":
    case "SABORDED":
      return card(event.instanceId);
    case "CARD_MOVED":
      return event.toZone === "graveyard" ? card(event.instanceId) : [];
    case "REACTION_ACTIVATED":
      return card(event.sourceInstanceId);
    default:
      return [];
  }
}

function FullLogPanel({ state, playerLabel, onClose }: { state: GameState; playerLabel: PlayerLabel; onClose: () => void }) {
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [state.eventLog.length]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
      }
    }
    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [onClose]);

  let turnCount = 0;
  return createPortal(
    <aside
      aria-label="Journal de partie"
      className="fixed inset-y-0 right-0 z-[80] flex w-[min(92vw,400px)] flex-col border-l border-white/15 bg-slate-950/90 shadow-[-12px_0_40px_rgba(0,0,0,0.6)] backdrop-blur-xl [font-family:var(--font-card-body)]"
    >
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
        <h2 className="text-base font-semibold text-slate-100 [font-family:var(--font-card-title)]">Journal de partie</h2>
        <button
          type="button"
          onClick={onClose}
          className="flex items-center gap-1.5 rounded-md px-2 py-1 text-sm text-slate-300 transition-colors hover:bg-white/10 hover:text-board-accent"
        >
          Fermer
          <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4" aria-hidden>
            <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth={2} strokeLinecap="round" />
          </svg>
        </button>
      </div>

      <div ref={listRef} className="flex-1 overflow-y-auto px-4 py-3">
        {state.eventLog.map((event, index) => {
          if (event.type === "TURN_STARTED") {
            turnCount += 1;
            return (
              <div key={index} className="mb-1.5 mt-3 flex items-center gap-2 first:mt-0">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                  Tour {Math.ceil(turnCount / 2)} · {playerLabel(event.playerId)}
                </span>
                <span className="h-px flex-1 bg-white/10" />
              </div>
            );
          }
          if (event.type === "PHASE_CHANGED") return null;
          const thumbs = eventThumbs(state, event);
          return (
            <div key={index} className="flex items-start gap-2 py-1">
              <span className="flex shrink-0 gap-1" style={{ minWidth: 28 }}>
                {thumbs.map((thumb, i) => (
                  <Fragment key={i}>
                    <CardThumb cardId={thumb.cardId} src={thumb.src} glyph={thumb.glyph} size={28} />
                  </Fragment>
                ))}
              </span>
              <p className="pt-1 text-[13px] leading-snug text-slate-200">{formatEvent(state, event, playerLabel)}</p>
            </div>
          );
        })}
      </div>
    </aside>,
    document.body
  );
}

/**
 * Journal de partie. Version COMPACTE sur le plateau : uniquement les
 * attaques et les effets appliqués, abrégés avec les miniatures des cartes
 * (retour de test du 13/09 — les lignes de texte étaient tronquées). Le
 * bouton d'agrandissement ouvre le journal COMPLET en panneau à droite :
 * tous les événements, sans troncature, avec miniatures quand une carte est
 * impliquée. Le panneau passe par un portail : `BoardStage` est mis à
 * l'échelle par `transform`, ce qui piégerait un `position: fixed` à
 * l'intérieur du plateau.
 */
export function EventFeed({ state, playerLabel }: { state: GameState; playerLabel?: PlayerLabel }) {
  const [open, setOpen] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  // Le plateau se re-rend souvent sans que l'état change (survol, glisser…).
  const highlights = useMemo(() => buildHighlights(state), [state]);
  const closeLog = useCallback(() => setOpen(false), []);
  const label = playerLabel ?? ((id?: string) => (id === "p1" ? "Joueur 1" : id === "p2" ? "Joueur 2" : "?"));

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [highlights.length, state.eventLog.length]);

  return (
    <>
      <div className="flex h-full flex-col rounded-md border border-white/15 bg-black/90 text-slate-100">
        <div className="flex items-center justify-between border-b border-white/10 py-1 pl-1.5 pr-1">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Journal</span>
          <button
            type="button"
            onClick={() => setOpen(true)}
            title="Ouvrir le journal complet"
            aria-label="Ouvrir le journal complet"
            className="flex h-5 w-5 items-center justify-center rounded text-slate-300 transition-colors hover:bg-white/10 hover:text-board-accent"
          >
            <svg viewBox="0 0 24 24" fill="none" className="h-3.5 w-3.5" aria-hidden>
              <path d="M14 4h6v6M10 20H4v-6M20 4l-7 7M4 20l7-7" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>
        <div ref={listRef} className="flex flex-1 flex-col gap-1.5 overflow-y-auto p-1.5">
          {highlights.length === 0 ? (
            <p className="text-[10px] leading-snug text-slate-400">Aucune attaque ni effet pour l&apos;instant.</p>
          ) : (
            highlights.map((highlight) => <HighlightRow key={highlight.key} state={state} highlight={highlight} />)
          )}
        </div>
      </div>
      {open && <FullLogPanel state={state} playerLabel={label} onClose={closeLog} />}
    </>
  );
}
