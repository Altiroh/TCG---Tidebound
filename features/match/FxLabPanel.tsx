"use client";

import { useEffect, useRef, useState } from "react";
import { AttackImpactLayer, findElement } from "@/features/match/AttackImpactLayer";
import { awakenCard, dropToken, flipCard, showGuard } from "@/features/match/cardFx";
import { AWAKE_LIFT_MS, GLOW_LAND_MS, ORB_CHARGE_MS, SHOT_FLIGHT_MS, type EffectVolley, type FxTarget } from "@/features/match/effectPresentation";
import { EffectFxLayer } from "@/features/match/EffectFxLayer";
import { applyLabEffect, applyLabPatch, LAB_EFFECTS, type LabEffect } from "@/features/match/labEffects";
import { PhaseBanner } from "@/features/match/PhaseBanner";
import { ATTACK_TOTAL_MS, type AttackAnimation } from "@/features/match/useAttackPresentation";
import {
  activateQualifications,
  declareCues,
  declareLeadMs,
  qualificationMoment,
  qualificationSteps,
  qualificationVolleyFor,
  scheduleSteps,
  type QualificationFx,
} from "@/features/match/qualificationFx";
import { QUALIFICATION_ORDER, QUALIFICATIONS, type QualificationId } from "@/game";
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

/** Les Navires à l'écran, dans l'ordre du plateau : l'adverse d'abord (en haut), puis celui du joueur. */
function ships(): string[] {
  return Array.from(document.querySelectorAll<HTMLElement>("[data-ship-target]")).flatMap((el) => (el.dataset.shipTarget ? [el.dataset.shipTarget] : []));
}

/**
 * Les VOISINS d'une carte sur son rang, tels qu'à l'écran : la carte juste à
 * gauche et celle juste à droite (une seule au bord, aucune si elle est seule).
 */
function neighboursOf(instanceId: string): string[] {
  const el = findElement("unit", instanceId);
  if (!el) return [];
  const box = el.getBoundingClientRect();
  const row = Array.from(document.querySelectorAll<HTMLElement>("[data-board-unit]"))
    .map((node) => ({ id: node.dataset.boardUnit!, box: node.getBoundingClientRect() }))
    .filter((it) => Math.abs(it.box.top - box.top) < box.height * 0.3)
    .sort((a, b) => a.box.left - b.box.left);
  const at = row.findIndex((it) => it.id === instanceId);
  return [row[at - 1], row[at + 1]].flatMap((it) => (it ? [it.id] : []));
}

/** Le halo d'attaque qui se rallume (Carnage) : en partie, c'est l'état qui le rallume ; au labo, on le montre. */
function rearmAttacker(el: HTMLElement) {
  el.animate(
    [
      { filter: "none" },
      { filter: "drop-shadow(0 0 10px rgba(248,113,113,0.95)) brightness(1.12)", offset: 0.25 },
      { filter: "drop-shadow(0 0 4px rgba(248,113,113,0.7))", offset: 0.5 },
      { filter: "drop-shadow(0 0 12px rgba(248,113,113,0.95)) brightness(1.12)", offset: 0.75 },
      { filter: "none" },
    ],
    { duration: 1200 }
  );
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
  // Un jeton est ovale : son liseré de sélection aussi.
  if (el && el.dataset.token !== undefined) el.style.borderRadius = color ? "50%" : "";
}

/**
 * `cardEffects` : la section « États et effets », qui écrit l'état RÉEL de
 * la partie — seulement là où le plateau l'accepte (`MatchBoard
 * labPatchable`, labo des Landes).
 */
export function FxLabPanel({ cardEffects = false }: { cardEffects?: boolean } = {}) {
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

  /** Dégâts d'environnement : l'orbe pourpre de la Marée, ou les bulles de la maladie — sans lanceur. */
  function environment(look: "tide" | "sickness") {
    const { to } = resolve();
    if (to.length === 0) return;
    const castMs = look === "tide" ? ORB_CHARGE_MS : 0;
    const volley: EffectVolley = {
      id: nextId.current++,
      delayMs: 0,
      awakens: [],
      castMs,
      shots: to.map((target) => ({ from: target, originPlayerId: anyShip() ?? "p1", to: target, amount: 1, look })),
      heals: [],
      buffs: [],
      reason: [],
    };
    setVolleys((current) => [...current, volley]);
    window.setTimeout(playMagicImpact, castMs + SHOT_FLIGHT_MS);
    window.setTimeout(() => setVolleys((current) => current.filter((it) => it.id !== volley.id)), castMs + SHOT_FLIGHT_MS + 2200);
  }

  /**
   * EFFET ACTIVÉ par la source (une carte en jeu) : elle s'illumine de la
   * couleur de l'effet, et l'effet se pose sur ses cibles — sans orbe ni
   * projectile, ce qui le distingue d'un sort lancé.
   */
  function activated(kind: "attack" | "heal") {
    const { from, to } = resolve();
    if (!from || from.kind !== "unit" || to.length === 0) return;
    const sourceRef = { from, originPlayerId: anyShip() ?? "p1", glow: true as const };
    const volley: EffectVolley = {
      id: nextId.current++,
      delayMs: 0,
      awakens: [from.id],
      awakenTones: { [from.id]: kind },
      castMs: 0,
      shots: kind === "attack" ? to.map((target) => ({ from, originPlayerId: sourceRef.originPlayerId, to: target, amount: 2, look: "glow" as const })) : [],
      heals: kind === "heal" ? to.map((target) => ({ to: target, amount: 2, source: sourceRef })) : [],
      buffs: [],
      reason: [],
    };
    setVolleys((current) => [...current, volley]);
    window.setTimeout(() => (kind === "attack" ? playMagicImpact() : playSpellImpact(kind)), GLOW_LAND_MS);
    window.setTimeout(() => setVolleys((current) => current.filter((it) => it.id !== volley.id)), GLOW_LAND_MS + 2200);
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

  function attack() {
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
    };
    setAttacks((current) => [...current, animation]);
    window.setTimeout(() => setAttacks((current) => current.filter((it) => it.id !== animation.id)), ATTACK_TOTAL_MS + 900);
  }

  /**
   * Une attaque de la source sur la 1re cible, avec les QUALIFICATIONS
   * demandées, mise en scène comme en partie : les spé. de déclaration
   * s'activent sur l'attaquant avant qu'il ne parte ; les autres, une fois
   * l'attaque jouée, s'activent (comme la Garde) puis lancent leur sort.
   * Éclaboussure vise les VOISINS de la cible sur le plateau (à droite
   * seulement si elle est au bord gauche ; seule, elle ne s'active pas) ;
   * Salve, les autres cibles désignées ; Brèche le Navire adverse ; Ponction
   * attaque le Navire adverse lui-même ; Sangsue soigne le Navire du joueur.
   */
  function qualifiedAttack(ids: QualificationId[]) {
    const { from, to } = resolve();
    if (!from || from.kind !== "unit" || !to[0]) return;
    const [enemyShip, ownShip] = [ships()[0], ships()[ships().length - 1]];
    // Ponction seule : « lors de l'attaque sur le Navire » — l'attaque vise le Navire adverse.
    const target: FxTarget = ids.length === 1 && ids[0] === "ponction" && enemyShip ? { kind: "ship", id: enemyShip } : to[0];
    const defenderShip = target.kind === "ship" ? target.id : enemyShip;
    const fx: QualificationFx[] = ids.flatMap((qualification): QualificationFx[] => {
      const base = { qualification, sourceInstanceId: from.id };
      switch (qualification) {
        case "eclaboussure":
          return target.kind === "unit" ? neighboursOf(target.id).map((id) => ({ ...base, targetInstanceId: id, amount: 2 })) : [];
        case "salve":
          return to
            .slice(1)
            .filter((t) => t.kind === "unit")
            .map((t) => ({ ...base, targetInstanceId: t.id, amount: 1 }));
        case "breche":
        case "ponction":
          return defenderShip ? [{ ...base, targetPlayerId: defenderShip, amount: 2 }] : [];
        case "sangsue":
          return ownShip ? [{ ...base, targetPlayerId: ownShip, amount: 3 }] : [];
        case "coup-de-grace":
        case "entaille":
        case "carnage":
          return [{ ...base, ...(target.kind === "unit" ? { targetInstanceId: target.id } : {}), amount: qualification === "entaille" ? 2 : undefined }];
        default:
          return [base];
      }
    });
    const leadMs = declareLeadMs(fx);
    // Comme en partie : une spé. à la fois, son sort, puis la suivante.
    const steps = scheduleSteps(qualificationSteps(fx, "after"), leadMs + ATTACK_TOTAL_MS, (step, spellAtMs) =>
      qualificationVolleyFor(step.fx, { ownerOf: () => ownShip ?? "p1", stillOnBoard: () => true }, nextId.current++, spellAtMs)
    );
    const animation: AttackAnimation = {
      id: nextId.current++,
      attackerInstanceId: from.id,
      ...(target.kind === "unit" ? { defenderInstanceId: target.id } : { defenderPlayerId: target.id }),
      amount: 2,
      defenderDies: false,
      attackerDies: false,
      qualifications: fx,
      leadMs,
      qualificationCues: [...declareCues(fx), ...steps.map((step) => ({ sourceInstanceId: step.sourceInstanceId, qualification: step.qualification, atMs: step.atMs }))],
    };
    setAttacks((current) => [...current, animation]);
    // Carnage : une fois la spé. activée, le halo d'attaque se rallume — il peut attaquer encore.
    const carnage = steps.find((step) => step.qualification === "carnage");
    if (carnage) window.setTimeout(() => { const el = elementOf(from); if (el) rearmAttacker(el); }, carnage.doneMs);
    const spells = steps.flatMap((step) => (step.volley ? [step.volley] : []));
    setVolleys((current) => [...current, ...spells]);
    const endMs = steps.length > 0 ? steps[steps.length - 1]!.doneMs : leadMs + ATTACK_TOTAL_MS;
    window.setTimeout(() => {
      const ids = new Set(spells.map((v) => v.id));
      setVolleys((current) => current.filter((it) => !ids.has(it.id)));
      setAttacks((current) => current.filter((it) => it.id !== animation.id));
    }, endMs + 1500);
  }

  /** La spé. qui s'active sur chaque cible, seule — comme « Garde qui s'interpose ». */
  function activateOnTargets(id: QualificationId) {
    const { to } = resolve();
    to.forEach((t) => {
      const el = elementOf(t);
      if (el) activateQualifications(el, [id]);
    });
  }

  /** Un effet de carte sur les cibles (à défaut, la dernière carte du plateau) — sur l'état réel de la partie du labo. */
  function cardEffect(effect: LabEffect) {
    const { to } = resolve();
    const ids = to.flatMap((t) => (t.kind === "unit" ? [t.id] : []));
    if (ids.length === 0) return;
    applyLabPatch((state) => applyLabEffect(state, effect, ids));
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
            <button type="button" style={button} onClick={() => attack()}>
              Attaque (source → 1re cible)
            </button>
            {/* La Garde qui refuse une attaque visée à côté d'elle : la carte se lève, son badge scintille, elle se repose. */}
            <button type="button" style={button} onClick={() => to.forEach((t) => { const el = elementOf(t); if (el) showGuard(el); })}>
              Garde qui s&apos;interpose (cibles)
            </button>
            <button type="button" style={button} onClick={() => to.forEach((t) => { const el = elementOf(t); if (el) dropToken(el); })}>
              Jeton qui tombe (cibles)
            </button>
            <button type="button" style={button} onClick={() => to.forEach((t) => { const el = elementOf(t); if (el) flipCard(el); })}>
              Structure révélée (cibles)
            </button>

            {cardEffects && <div style={section}>États et effets (cibles)</div>}
            <div style={section}>Spé. qui s&apos;active (cibles)</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
              {QUALIFICATION_ORDER.map((id) => (
                <button key={id} type="button" style={{ ...button, flex: "1 1 auto" }} title={`${QUALIFICATIONS[id].name} s'active sur les cibles, comme la Garde`} onClick={() => activateOnTargets(id)}>
                  {QUALIFICATIONS[id].name}
                </button>
              ))}
            </div>
            <div style={section}>Attaque avec une spé. (source → cibles)</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
              {QUALIFICATION_ORDER.map((id) => (
                <button
                  key={id}
                  type="button"
                  style={{ ...button, flex: "1 1 auto" }}
                  title={`Attaque avec ${QUALIFICATIONS[id].name} — la spé. s'active ${qualificationMoment(id) === "declare" ? "avant que l'attaquant ne parte" : "après l'attaque, puis son sort part"}`}
                  onClick={() => qualifiedAttack([id])}
                >
                  {QUALIFICATIONS[id].name}
                </button>
              ))}
            </div>
            <button type="button" style={button} onClick={() => qualifiedAttack(["rafale", "coup-de-grace", "breche", "ponction", "sangsue", "carnage"])}>
              Enchaînement (Rafale, Coup de grâce, Brèche, Ponction, Sangsue, Carnage)
            </button>
            <button type="button" style={button} onClick={() => qualifiedAttack(["eclaboussure", "entaille", "sangsue"])}>
              Enchaînement (Éclaboussure, Entaille, Sangsue)
            </button>

            {cardEffects && (["États", "Mots-clés", "Qualifications", "Statistiques", "Entraves", "Marqueurs"] as const).map((group) => (
              <div key={group} style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                {LAB_EFFECTS.filter((effect) => effect.group === group).map((effect) => (
                  <button key={effect.id} type="button" style={{ ...button, flex: "1 1 auto" }} title={`${group} — appliqué (ou retiré) sur les cibles`} onClick={() => cardEffect(effect)}>
                    {effect.label}
                  </button>
                ))}
              </div>
            ))}
            <div style={section}>Effet activé (source en jeu → cibles)</div>
            <button type="button" style={button} onClick={() => activated("attack")}>
              Effet activé — dégâts (lueur bleue)
            </button>
            <button type="button" style={button} onClick={() => activated("heal")}>
              Effet activé — soin (lueur dorée)
            </button>
            <div style={section}>Sorts lancés (source → cibles)</div>
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
            <button type="button" style={button} onClick={() => environment("tide")}>
              La Marée frappe (cibles)
            </button>
            <button type="button" style={button} onClick={() => environment("sickness")}>
              Maladie en début de tour (cibles)
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
