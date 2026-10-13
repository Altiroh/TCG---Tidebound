/**
 * AUDIT DE MISE EN SCÈNE DES EFFETS (13/10/2026).
 *
 * Question : chaque effet de carte résolu en partie se VOIT-il à l'écran,
 * comme au labo ? Le moteur peut résoudre un effet correctement sans que
 * rien ne le montre (L'Amiral sans Pavillon : la cible disparaissait sans
 * que rien ne la touche).
 *
 * Des parties bot contre bot sont jouées avec des decks qui font tourner
 * TOUT le catalogue. À chaque coup, les faits produits par un effet de
 * carte sont confrontés à ce que l'interface en met en scène
 * (`deriveEffectVolley`, et les animations du plateau : pose, pioche,
 * invocation, déplacement, dé, révélation). Ce qui reste est listé, par
 * carte et par fait.
 *
 *   npx tsx scripts/effectFxAudit.ts [parties]
 */
import { CORE_SET, getCardDefinition } from "@/game/cards/sets/core";
import { createGameState } from "@/game/state/createGameState";
import { dispatch } from "@/game/engine";
import { botHasSomethingToDo } from "@/game/bot/runBotTurn";
import { chooseBotAction } from "@/game/bot/chooseAction";
import { createSeededRandom } from "@/game/rng";
import type { GameEvent } from "@/game/events/types";
import type { GameState } from "@/game/state/types";
import type { DeckList } from "@/game/cards/decks/types";
import { deriveEffectVolley, type EffectVolley } from "@/features/match/effectPresentation";

const N = Number(process.argv[2] ?? 60);

/** Faits que le plateau anime par lui-même (`useTableMotion`, dés, Marée, révélations) ou qui ne se voient pas. */
const MIS_EN_SCENE_AILLEURS = new Set<GameEvent["type"]>([
  "PLAY_CARD", "SUMMON", "DRAW_CARD", "DIE_RESOLVED", "STRUCTURE_REVEALED", "STRUCTURE_REHIDDEN", "TIDE_ADVANCED", "TIDE_MODIFIED",
  "TIDE_ORIENTATION_CHANGED", "PHASE_CHANGED", "TURN_STARTED", "END_TURN", "GAME_STARTED", "GAME_ENDED", "REACTION_WINDOW_OPENED",
  "REACTION_ACTIVATED", "REACTION_PASSED", "ABILITY_RESOLVED", "UNIT_TARGETED", "ATTACK", "ATTACK_INTERCEPTED", "QUALIFICATION_TRIGGERED",
  "SHIP_ABILITY_ACTIVATED", "SHIP_ABILITY_FIRED", "OBJECT_BROKEN", "SABORDED", "EVEIL", "ENTER_EFFECTS_REPEATED", "TURN_TIMED_OUT",
  "OCEAN_JUDGMENT", "DERAISON_SETTLED", "HAND_CARD_REVEALED",
]);

/** Ce fait est-il couvert par la volée dérivée ? */
function couvert(event: GameEvent, volley: EffectVolley | null): boolean {
  if (MIS_EN_SCENE_AILLEURS.has(event.type)) return true;
  if (!volley) return false;
  const surUnite = (id: string | undefined) => (to: { kind: string; id: string }) => to.kind === "unit" && to.id === id;
  switch (event.type) {
    case "DAMAGE":
      return Boolean(event.combat) || volley.shots.some((s) => (event.targetInstanceId ? surUnite(event.targetInstanceId)(s.to) : s.to.id === event.targetPlayerId));
    case "HEAL":
      return volley.heals.length > 0;
    case "BUFF_APPLIED":
    case "DEBUFF_APPLIED":
      return (
        volley.buffs.some((b) => b.targetInstanceId === event.targetInstanceId) ||
        (volley.touches ?? []).some((t) => surUnite(event.targetInstanceId)(t.to))
      );
    case "REASON_CHANGED":
      return volley.reason.length > 0;
    case "DESTROY":
    case "CARD_MOVED":
      return (volley.touches ?? []).some((t) => surUnite(event.instanceId)(t.to));
    case "STATUS_CHANGED":
      return (volley.touches ?? []).some((t) => surUnite(event.targetInstanceId)(t.to));
    case "ARMOR_CHANGED":
      return event.delta < 0 || (volley.touches ?? []).some((t) => t.kind === "armor" && t.to.id === event.playerId);
    default:
      return false;
  }
}

/** Faits « bruts » qui ne viennent d'aucune carte (mort au combat, régénération, maladie, Marée). */
function horsEffet(event: GameEvent): boolean {
  // Rien ne bouge : rien à montrer.
  if ((event.type === "REASON_CHANGED" || event.type === "ARMOR_CHANGED") && event.delta === 0) return true;
  if (event.type === "HEAL" && event.amount <= 0) return true;
  // Un état posé sans lanceur vient de la mer (maladie de la Marée), pas d'une carte.
  if (event.type === "STATUS_CHANGED") return !event.origin;
  if (event.type === "DESTROY") return !event.origin;
  if (event.type === "DAMAGE") return Boolean(event.combat) || Boolean(event.fx) || !event.origin;
  if (event.type === "REASON_CHANGED") return event.delta > 0 && event.source !== "card";
  if (event.type === "CARD_MOVED") return event.fromZone !== "board" || !event.origin;
  return false;
}

/** La carte d'où part un fait : son lanceur, sinon la capacité ou la carte jouée du même coup. */
function sourceDe(event: GameEvent, coup: GameEvent[], avant: GameState): string | undefined {
  const origin = "origin" in event ? (event as { origin?: { instanceId?: string } }).origin : undefined;
  const id = origin?.instanceId;
  const toutes = [...avant.players.flatMap((p) => [...p.board, ...p.hand, ...p.graveyard])];
  if (id) return toutes.find((c) => c.instanceId === id)?.cardId;
  const capacite = [...coup].reverse().find((e) => e.type === "ABILITY_RESOLVED" || e.type === "PLAY_CARD" || e.type === "OBJECT_BROKEN");
  if (capacite && "cardId" in capacite) return (capacite as { cardId?: string }).cardId;
  return undefined;
}

function decksDuCatalogue(): DeckList[] {
  const cartes = CORE_SET.filter((c) => !c.token && c.type !== "lande").map((c) => c.id);
  const decks: DeckList[] = [];
  for (let i = 0; i < cartes.length; i += 20) {
    const tranche = cartes.slice(i, i + 20);
    while (tranche.length < 20) tranche.push(cartes[tranche.length % cartes.length]!);
    decks.push({ id: `audit-${i}`, name: `Audit ${i}`, shipId: "le-brise-lames", description: "", cardIds: [...tranche, ...tranche] });
  }
  return decks;
}

const manques = new Map<string, Map<string, number>>();
const vues = new Map<string, number>();
const decks = decksDuCatalogue();

for (let partie = 0; partie < N; partie += 1) {
  const a = decks[partie % decks.length]!;
  const b = decks[(partie * 7 + 3) % decks.length]!;
  const hasard = createSeededRandom(partie ^ 0x5eed);
  let state = createGameState({ gameId: `fx-${partie}`, player1: { id: "a", deck: a }, player2: { id: "b", deck: b }, seed: partie + 1 });
  for (let coups = 0; state.status === "active" && coups < 900; coups += 1) {
    const acteur = state.players.map((p) => p.id).find((id) => botHasSomethingToDo(state, id));
    if (!acteur) break;
    const avant = state;
    const res = dispatch(state, chooseBotAction(state, acteur, "moyen", hasard));
    if (!res.ok) break;
    state = res.state;
    const volley = deriveEffectVolley(res.events, avant, state, 0);
    for (const event of res.events) {
      if (horsEffet(event)) continue;
      const carte = sourceDe(event, res.events, avant);
      if (!carte) continue;
      vues.set(carte, (vues.get(carte) ?? 0) + 1);
      if (couvert(event, volley)) continue;
      const parCarte = manques.get(carte) ?? new Map<string, number>();
      const cle = event.type === "CARD_MOVED" ? `CARD_MOVED ${event.fromZone}→${event.toZone}` : event.type;
      parCarte.set(cle, (parCarte.get(cle) ?? 0) + 1);
      if (process.env.DETAIL && (parCarte.get(cle) ?? 0) <= 1) console.log(`    ${carte}`, JSON.stringify(event), JSON.stringify(res.events.map((e) => e.type)));
      manques.set(carte, parCarte);
    }
  }
}

const jamaisVues = CORE_SET.filter((c) => !c.token && c.type !== "lande" && !vues.has(c.id)).map((c) => c.id);
console.log(`\n${N} parties — ${vues.size} cartes ont produit des faits d'effet.\n`);
console.log("FAITS D'EFFET SANS MISE EN SCÈNE, par carte :");
for (const [carte, faits] of [...manques].sort((x, y) => x[0].localeCompare(y[0]))) {
  console.log(`  ${getCardDefinition(carte).name} (${carte}) : ${[...faits].map(([f, n]) => `${f} ×${n}`).join(", ")}`);
}
const parFait = new Map<string, number>();
for (const faits of manques.values()) for (const [f, n] of faits) parFait.set(f, (parFait.get(f) ?? 0) + n);
console.log("\nPAR FAIT :");
for (const [f, n] of [...parFait].sort((x, y) => y[1] - x[1])) console.log(`  ${f} : ${n}`);
console.log(`\nCartes sans effet observé en partie (${jamaisVues.length}) : ${jamaisVues.join(", ")}`);
