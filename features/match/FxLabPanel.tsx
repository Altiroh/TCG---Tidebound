"use client";

import { useEffect, useRef, useState } from "react";
import { AttackImpactLayer, findElement } from "@/features/match/AttackImpactLayer";
import { awakenCard, dropToken, flipCard, revealGuard } from "@/features/match/cardFx";
import { AWAKE_LIFT_MS, ORB_CHARGE_MS, SHOT_FLIGHT_MS, type EffectVolley, type FxTarget } from "@/features/match/effectPresentation";
import { EffectFxLayer } from "@/features/match/EffectFxLayer";
import { PhaseBanner } from "@/features/match/PhaseBanner";
import { ATTACK_TOTAL_MS, attackLeadMs, type AttackAnimation } from "@/features/match/useAttackPresentation";
import { playCombatPhase, playMagicImpact, playSpellImpact, playTurnStart } from "@/lib/sound";

/**
 * Panneau « Animations » du labo de partie (\`/game/lande-preview\`) : lance à
 * la demande, sur les VRAIES cartes du plateau, chaque animation de carte et
 * de sort, pour les valider ensemble sans attendre qu'une partie les
 * provoque (demande du 10/10/2026).
 *
 * On désigne une SOURCE et des CIBLES en cliquant sur le plateau (carte ou
 * Navire) : le clic est intercepté avant la partie, il ne joue rien. Sans
 * choix, la source est la première carte du plateau et la cible la
 * dernière.
 *
 * Rien ne passe par le moteur : le panneau monte ses propres calques
 * (\`EffectFxLayer\`, \`AttackImpactLayer\`, \`PhaseBanner\`) avec des mises en
 * scène fabriquées, et appelle les animations impératives de \`cardFx.ts\`.
 * Les chiffres des cartes ne bougent donc pas : on juge le mouvement, la
 * lumière et le son.
 */

type Picking = "source" | "targets" | null;

/** Cible désignée sur le plateau : une carte (\`data-board-unit\`) ou un Navire (\`data-ship-target\`). */
function targetAt(node: EventTarget | null): FxTarget | null {
  if (!(node instanceof Element)) return null;
  const unit = node.closest<HTMLElement>("[data-board-unit]");
  if (unit?.dataset.boardUnit) return { kind: "unit", id: unit.dataset.boardUnit };
  const ship = node.closest<HTMLElement>("[data-ship-target]");
  if (ship?.dataset.shipTarget) return { kind: "ship", id: ship.dataset.shipTarget };
  return null;
}

function units(): string[] {
  return Array.from(document.querySelectorAll<HTMLElement>("[data-board-unit]")).flatMap((el) => (el.dataset.boardUnit ? [el.dataset.boardUnit] : []));
}

function anyShip(): string | null {
  return document.querySelector<HTMLElement>("[data-ship-target]")?.dataset.shipTarget ?? null;
}

function label(target: FxTarget | null): string {
  if (!target) return "—";
  const el = findElement(target.kind, target.id);
  // Le nom de la carte : le texte alternatif de son illustration ; à défaut, l'identifiant.
  const name = el?.querySelector("img[alt]")?.getAttribute("alt") || target.id;
  return target.kind === "ship" ? `Navire (${target.id})` : name;
}

/** Le plateau marque la sélection d'un liseré (source dorée, cibles bleues). */
function outline(target: FxTarget, color: string | null) {
  const el = findElement(target.kind, target.id);
  if (el) el.style.outline = color ? `3px solid ${color}` : "";
  if (el) el.style.outlineOffset = color ? "3px" : "";
}

export function FxLabPanel() {
  const [open, setOpen] = useState(true);
  const [picking, setPicking] = useState<Picking>(null);
  const [source, setSource] = useState<FxTarget | null>(null);
  const [targets, setTargets] = useState<FxTarget[]>([]);
  const [volleys, setVolleys] = useState<EffectVolley[]>([]);
  const [attacks, setAttacks] = useState<AttackAnimation[]>([]);
  const [banner, setBanner] = useState<{ text: string; key: number } | null>(null);
  const nextId = useRef(1_000_000);

  // Désignation au clic : le premier appui sur une carte ou un Navire est capté AVANT la partie.
  useEffect(() => {
    if (!picking) return undefined;
    const onDown = (event: PointerEvent) => {
      if ((event.target as Element | null)?.closest?.("[data-fx-lab]")) return;
      const target = targetAt(event.target);
      if (!target) return;
      event.preventDefault();
      event.stopPropagation();
      if (picking === "source") {
        setSource(target);
        setPicking(null);
      } else {
        setTargets((current) => (current.some((t) => t.kind === target.kind && t.id === target.id) ? current : [...current, target]));
      }
    };
    window.addEventListener("pointerdown", onDown, true);
    return () => window.removeEventListener("pointerdown", onDown, true);
  }, [picking]);

  // Liserés de sélection, retirés quand elle change.
  useEffect(() => {
    if (source) outline(source, "#fbbf24");
    targets.forEach((target) => outline(target, "#38bdf8"));
    return () => {
      if (source) outline(source, null);
      targets.forEach((target) => outline(target, null));
    };
  }, [source, targets]);

  /** Source et cibles effectives : le choix, ou par défaut la première et la dernière carte du plateau. */
  function resolve(): { from: FxTarget | null; to: FxTarget[] } {
    const all = units();
    const from = source ?? (all[0] ? { kind: "unit", id: all[0] } : null);
    const to = targets.length > 0 ? targets : all.length > 1 ? [{ kind: "unit" as const, id: all[all.length - 1]! }] : [];
    return { from, to };
  }

  function elementOf(target: FxTarget | null): HTMLElement | null {
    return target ? findElement(target.kind, target.id) : null;
  }

  function spell(kind: "attack" | "heal" | "buff" | "malus") {
    const { from, to } = resolve();
    if (!from || to.length === 0) return;
    const originPlayerId = from.kind === "ship" ? from.id : (anyShip() ?? "p1");
    const sourceRef = { from, originPlayerId };
    const awakens = from.kind === "unit" ? [from.id] : [];
    const castMs = (awakens.length > 0 ? AWAKE_LIFT_MS : 0) + ORB_CHARGE_MS;
    const unitsOnly = to.flatMap((t) => (t.kind === "unit" ? [t.id] : []));
    const volley: EffectVolley = {
      id: nextId.current++,
      delayMs: 0,
      awakens,
      castMs,
      shots: kind === "attack" ? to.map((target) => ({ ...sourceRef, to: target, amount: 2, look: "magic" as const })) : [],
      heals: kind === "heal" ? to.map((target) => ({ to: target, amount: 2, source: sourceRef })) : [],
      buffs:
        kind === "buff" || kind === "malus"
          ? unitsOnly.map((id) => ({
              targetInstanceId: id,
              attack: kind === "buff" ? 1 : -1,
              health: kind === "buff" ? 1 : -1,
              keywords: [],
              loss: kind === "malus",
              source: sourceRef,
            }))
          : [],
      reason: [],
    };
    setVolleys((current) => [...current, volley]);
    // L'état réel ne bouge pas ici : le son d'impact, que la partie joue en affichant l'état, part à l'arrivée.
    window.setTimeout(() => (kind === "attack" ? playMagicImpact() : playSpellImpact(kind)), castMs + SHOT_FLIGHT_MS);
    window.setTimeout(() => setVolleys((current) => current.filter((it) => it.id !== volley.id)), castMs + SHOT_FLIGHT_MS + 2200);
  }

  function attack(guard: boolean) {
    const { from, to } = resolve();
    const target = to[0];
    if (!from || from.kind !== "unit" || !target) return;
    const animation: AttackAnimation = {
      id: nextId.current++,
      attackerInstanceId: from.id,
      ...(target.kind === "unit" ? { defenderInstanceId: target.id } : { defenderPlayerId: target.id }),
      amount: 2,
      defenderDies: false,
      attackerDies: false,
      guard,
    };
    setAttacks((current) => [...current, animation]);
    window.setTimeout(() => setAttacks((current) => current.filter((it) => it.id !== animation.id)), attackLeadMs(animation) + ATTACK_TOTAL_MS + 900);
  }

  function showBanner(text: string, play: () => void) {
    play();
    const key = nextId.current++;
    setBanner({ text, key });
    window.setTimeout(() => setBanner((current) => (current?.key === key ? null : current)), 1600);
  }

  const { from, to } = typeof document !== "undefined" ? resolve() : { from: null, to: [] };
  const button: React.CSSProperties = {
    border: "1px solid rgba(255,255,255,0.18)",
    background: "rgba(255,255,255,0.08)",
    color: "#f8fafc",
    borderRadius: 6,
    padding: "5px 8px",
    fontSize: 12,
    cursor: "pointer",
    textAlign: "left",
  };
  const section: React.CSSProperties = { fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: "#fbbf24", marginTop: 8 };

  return (
    <>
      <EffectFxLayer volleys={volleys} />
      <AttackImpactLayer attacks={attacks} />
      <PhaseBanner text={banner?.text ?? null} bannerKey={banner?.key ?? null} />
      <div
        data-fx-lab
        style={{
          position: "fixed",
          right: 12,
          top: "50%",
          transform: "translateY(-50%)",
          zIndex: 90,
          width: open ? 230 : "auto",
          maxHeight: "90dvh",
          overflowY: "auto",
          background: "rgba(8,15,28,0.92)",
          border: "1px solid rgba(255,255,255,0.15)",
          borderRadius: 10,
          padding: 10,
          color: "#e2e8f0",
          fontSize: 12,
          boxShadow: "0 10px 30px rgba(0,0,0,0.5)",
        }}
      >
        <button type="button" onClick={() => setOpen((value) => !value)} style={{ ...button, width: "100%", fontWeight: 700 }}>
          {open ? "▾" : "▸"} Animations
        </button>
        {open && (
          <div style={{ display: "grid", gap: 6, marginTop: 6 }}>
            <div style={section}>Sélection</div>
            <div>
              Source : <b>{label(from)}</b>
            </div>
            <button type="button" style={{ ...button, outline: picking === "source" ? "2px solid #fbbf24" : undefined }} onClick={() => setPicking(picking === "source" ? null : "source")}>
              {picking === "source" ? "Clique une carte ou un Navire…" : "Choisir la source"}
            </button>
            <div>
              Cibles : <b>{to.length > 0 ? to.map(label).join(", ") : "—"}</b>
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              <button type="button" style={{ ...button, flex: 1, outline: picking === "targets" ? "2px solid #38bdf8" : undefined }} onClick={() => setPicking(picking === "targets" ? null : "targets")}>
                {picking === "targets" ? "Terminer" : "Ajouter des cibles"}
              </button>
              <button
                type="button"
                style={button}
                onClick={() => {
                  setSource(null);
                  setTargets([]);
                  setPicking(null);
                }}
              >
                Effacer
              </button>
            </div>

            <div style={section}>Cartes</div>
            <button type="button" style={button} onClick={() => { const el = elementOf(from); if (el) awakenCard(el); }}>
              Réveil (capacité déclenchée)
            </button>
            <button type="button" style={button} onClick={() => attack(false)}>
              Attaque (source → 1re cible)
            </button>
            <button type="button" style={button} onClick={() => attack(true)}>
              Attaque sur une Garde
            </button>
            <button type="button" style={button} onClick={() => { const el = elementOf(to[0] ?? null); if (el) revealGuard(el); }}>
              Garde seule (1re cible)
            </button>
            <button type="button" style={button} onClick={() => to.forEach((t) => { const el = elementOf(t); if (el) dropToken(el); })}>
              Jeton qui tombe (cibles)
            </button>
            <button type="button" style={button} onClick={() => to.forEach((t) => { const el = elementOf(t); if (el) flipCard(el); })}>
              Structure révélée (cibles)
            </button>

            <div style={section}>Sorts (source → cibles)</div>
            <button type="button" style={button} onClick={() => spell("attack")}>
              Sort d&apos;attaque
            </button>
            <button type="button" style={button} onClick={() => spell("heal")}>
              Sort de soin
            </button>
            <button type="button" style={button} onClick={() => spell("buff")}>
              Sort de renfort (+1/+1)
            </button>
            <button type="button" style={button} onClick={() => spell("malus")}>
              Sort de malus (−1/−1)
            </button>

            <div style={section}>Bannières</div>
            <button type="button" style={button} onClick={() => showBanner("Tour du Joueur 1", () => playTurnStart(true))}>
              Début de ton tour
            </button>
            <button type="button" style={button} onClick={() => showBanner("Tour de l'adversaire", () => playTurnStart(false))}>
              Début du tour adverse
            </button>
            <button type="button" style={button} onClick={() => showBanner("Phase de combat", playCombatPhase)}>
              Phase de combat
            </button>
          </div>
        )}
      </div>
    </>
  );
}
