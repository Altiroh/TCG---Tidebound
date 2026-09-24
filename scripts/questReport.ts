/**
 * RELEVÉ DES QUÊTES — combien de parties chaque quête demande vraiment.
 *
 * Le cadrage (Notion « Catalogue de quêtes ») fixe une règle chiffrée :
 * une journalière se boucle en 3 à 6 parties. Ce script joue des parties
 * bot contre bot sur les listes préconstruites, passe chaque état final
 * par le VRAI calcul de progression (`computeMatchQuestContribution`), et
 * en déduit, quête par quête, la progression moyenne par partie et le
 * nombre de parties nécessaires. Une ligne « Infinity » est une quête qui
 * n'a jamais progressé : bug de comptage ou objectif hors de portée.
 *
 * Il relève aussi des OBJECTIFS CANDIDATS (capacité de Navire, Déraison,
 * pièges révélés, invocations…) pour calibrer une quête avant de l'écrire.
 *
 * Un bot n'est pas un joueur : il ne cherche pas à remplir ses quêtes. Les
 * chiffres disent ce qu'on obtient « en jouant normalement », ce qui est
 * précisément ce que la règle demande.
 *
 *   npm run quests -- [parties par deck]
 */
import { createGameState } from "@/game/state/createGameState";
import { botHasSomethingToDo } from "@/game/bot/runBotTurn";
import { chooseBotAction } from "@/game/bot/chooseAction";
import { dispatch } from "@/game/engine";
import { createSeededRandom } from "@/game/rng";
import type { GameState } from "@/game/state/types";
import { computeMatchQuestContribution } from "@/game/quests/progress";
import { QUEST_CATALOG, questProgressKind, questLabel } from "@/game/quests/catalog";
import { DECKS } from "@/scripts/decks";
import { getCardDefinition } from "@/game/cards/sets/core";

const N = Number(process.argv[2] ?? 3);
const names = Object.keys(DECKS);
const totals: Record<string, number> = {};
const hits: Record<string, number> = {};
let games = 0, wins = 0, turns = 0;
const cand: Record<string, number[]> = {};
const add = (k: string, v: number) => { (cand[k] ??= []).push(v); };

for (const [i, deckName] of names.entries()) {
  for (let s = 0; s < N; s++) {
    const opp = names[(i + 1 + s * 3) % names.length]!;
    const seed = 7000 + i * 100 + s;
    const rnd = createSeededRandom(seed ^ 0x5eed);
    let state: GameState = createGameState({ gameId: `quetes-${seed}`, player1: { id: "a", deck: DECKS[deckName]! }, player2: { id: "b", deck: DECKS[opp]! }, seed });
    let coups = 0;
    while (state.status === "active" && coups < 900) {
      const acteur = state.players.map((p) => p.id).find((id) => botHasSomethingToDo(state, id));
      if (!acteur) break;
      const r = dispatch(state, chooseBotAction(state, acteur, "moyen", rnd));
      if (!r.ok) break;
      state = r.state; coups++;
    }
    const won = state.winnerId === "a";
    const { progress } = computeMatchQuestContribution({ state, playerId: "a", vsBot: true, won });
    games++; if (won) wins++; turns += Math.ceil(state.turnNumber / 2);
    for (const [k, v] of Object.entries(progress)) { totals[k] = (totals[k] ?? 0) + (v as number); if ((v as number) > 0) hits[k] = (hits[k] ?? 0) + 1; }
    const c = { shipAbil: 0, reactions: 0, ownReveals: 0, summons: 0, deraisonTurns: 0, equips: 0, heal: 0, oppKilled: 0, scuttleAny: 0, anomalies: 0, maxDebt: 0, turnsInTempete: 0, playedInAbysses: 0, bigCards: 0, cardsOneTurn: 0 };
    const owner = new Map<string, string>();
    for (const pl of state.players) for (const card of [...pl.deck, ...pl.hand, ...pl.board, ...pl.graveyard]) owner.set(card.instanceId, pl.id);
    let tide = "calme"; let perTurn = 0; let active = "";
    for (const e of state.eventLog) {
      const p = (e as { playerId?: string }).playerId;
      if (e.type === "TURN_STARTED") { c.cardsOneTurn = Math.max(c.cardsOneTurn, perTurn); perTurn = 0; active = p ?? ""; if (p === "a" && tide === "tempete") c.turnsInTempete++; }
      if (e.type === "TIDE_ADVANCED") tide = (e as any).tideState;
      if (e.type === "SHIP_ABILITY_ACTIVATED" && p === "a") c.shipAbil++;
      if (e.type === "REACTION_ACTIVATED" && p === "a") c.reactions++;
      if (e.type === "STRUCTURE_REVEALED" && owner.get((e as any).instanceId) === "a") c.ownReveals++;
      if (e.type === "SUMMON" && owner.get((e as any).instanceId) === "a") c.summons++;
      if (e.type === "DERAISON_SETTLED" && p === "a") { c.deraisonTurns++; c.maxDebt = Math.max(c.maxDebt, (e as any).debt ?? 0); }
      if (e.type === "HEAL" && ((e as any).targetPlayerId === "a")) c.heal += (e as any).amount ?? 0;
      if (e.type === "DESTROY" && owner.get((e as any).instanceId) === "b") c.oppKilled++;
      if (e.type === "SABORDED" && p === "a") c.scuttleAny++;
      if (e.type === "PLAY_CARD" && p === "a") {
        perTurn++;
        const def = (() => { try { return getCardDefinition((e as any).cardId); } catch { return undefined; } })();
        if (def?.type === "equipement") c.equips++;
        if (def?.type === "anomalie") c.anomalies++;
        if (def && def.cost >= 5) c.bigCards++;
        if (tide === "abysses") c.playedInAbysses++;
      }
    }
    for (const [k, v] of Object.entries(c)) add(k, v);
    add("wonAfterBelow5", won && state.eventLog.some((e) => e.type === "DAMAGE" && (e as any).targetPlayerId === "a" && (e as any).targetAnchorAfter !== undefined && (e as any).targetAnchorAfter <= 5) ? 1 : 0);
    add("neverDeraison", c.deraisonTurns === 0 ? 1 : 0);
    add("wonNoDeraison", won && c.deraisonTurns === 0 ? 1 : 0);
  }
}
console.log(`${games} parties, victoire ${Math.round((wins / games) * 100)} %, ${ (turns / games).toFixed(1)} tours/joueur`);
console.log("CANDIDATS (moyenne / partie · % de parties où > 0) :");
for (const [k, arr] of Object.entries(cand)) { const m = arr.reduce((a, b) => a + b, 0) / arr.length; const pct = Math.round((arr.filter((x) => x > 0).length / arr.length) * 100); console.log(`  ${k.padEnd(16)} ${m.toFixed(2).padStart(6)}  ${String(pct).padStart(3)} %`); }
const rows = QUEST_CATALOG.filter((q) => questProgressKind(q.objectiveKey) === "sum" && q.objectiveKey !== "complete_daily_quests" && q.botProgressAllowed).map((q) => {
  const perMatch = (totals[q.objectiveKey] ?? 0) / games;
  return { type: q.questType, code: q.code, label: questLabel(q), perMatch: +perMatch.toFixed(2), hitRate: Math.round(((hits[q.objectiveKey] ?? 0) / games) * 100), matches: perMatch > 0 ? +(q.targetValue / perMatch).toFixed(1) : Infinity };
});
rows.sort((a, b) => (a.type === b.type ? b.matches - a.matches : a.type.localeCompare(b.type)));
for (const r of rows) console.log(`${r.type.padEnd(6)} ${String(r.matches).padStart(6)} parties  (${r.perMatch}/partie, ${r.hitRate}% des parties)  ${r.label}  [${r.code}]`);
