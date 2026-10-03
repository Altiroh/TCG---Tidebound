/**
 * RELEVÉ DES MOTEURS — ce que chaque préconstruit fait VRAIMENT de sa
 * mécanique, partie après partie, sous le bot.
 *
 * Le labo dit qui gagne ; ce relevé dit si le plan du deck a seulement été
 * joué. Un deck de rappel qui ne rappelle rien, ou un deck de Sabordage qui
 * ne saborde jamais, se mesure comme un deck de corps amputé : c'est le
 * pilote qu'il faut regarder avant de toucher aux cartes (29/09/2026).
 *
 *   npx tsx scripts/preconLab/engines.ts [--games 8] [--bot moyen] [--only "Le Théâtre Englouti"]
 *
 * Par deck et par partie : retours du plateau en main, arrivées répétées,
 * Objets brisés, Sabordages, réactions activées, et actions jouées en Phase
 * principale 2 (après le combat). Graines fixes : deux relevés ne diffèrent
 * que par le code.
 */
import { PRECON_DECK_LISTS } from "@/game/cards/decks/precon";
import type { DeckList } from "@/game/cards/decks/types";
import { chooseBotAction } from "@/game/bot/chooseAction";
import { botHasSomethingToDo } from "@/game/bot/runBotTurn";
import type { BotDifficulty } from "@/game/bot/types";
import { dispatch } from "@/game/engine";
import { createSeededRandom } from "@/game/rng";
import { createGameState } from "@/game/state/createGameState";
import type { GameState, PlayerId } from "@/game/state/types";

const arg = (name: string) => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const GAMES = Number(arg("--games") ?? 8);
const BOT = (arg("--bot") ?? "moyen") as BotDifficulty;
const ONLY = arg("--only")?.split(",").map((s) => s.trim());

interface Releve {
  parties: number;
  victoires: number;
  retours: number;
  repetitions: number;
  bris: number;
  sabordages: number;
  reactions: number;
  phase2: number;
}

const vide = (): Releve => ({ parties: 0, victoires: 0, retours: 0, repetitions: 0, bris: 0, sabordages: 0, reactions: 0, phase2: 0 });

function jouer(a: DeckList, b: DeckList, seed: number, releves: Map<string, Releve>) {
  const random = createSeededRandom(seed ^ 0x5eed);
  let state: GameState = createGameState({
    gameId: `moteurs-${seed}`,
    player1: { id: "a", deck: a },
    player2: { id: "b", deck: b },
    seed,
  });
  const nom: Record<PlayerId, string> = { a: a.name, b: b.name };
  const r = (id: PlayerId) => releves.get(nom[id]!)!;

  for (let guard = 0; guard < 1500 && state.status === "active"; guard += 1) {
    const actor = state.players.map((p) => p.id).find((id) => botHasSomethingToDo(state, id));
    if (!actor) break;
    const action = chooseBotAction(state, actor, BOT, random);
    if (state.phase === "mainPhase2" && actor === state.activePlayerId && action.type !== "endTurn") r(actor).phase2 += 1;
    const res = dispatch(state, action);
    if (!res.ok || res.state === state) break;
    for (const e of res.events) {
      if (!e) continue;
      if (e.type === "CARD_MOVED" && e.fromZone === "board" && e.toZone === "hand" && e.ownerId) r(e.ownerId).retours += 1;
      else if (e.type === "ENTER_EFFECTS_REPEATED") r(e.playerId).repetitions += 1;
      else if (e.type === "OBJECT_BROKEN") r(e.playerId).bris += 1;
      else if (e.type === "SABORDED") r(e.playerId).sabordages += 1;
      else if (e.type === "REACTION_ACTIVATED") r(e.playerId).reactions += 1;
    }
    state = res.state;
  }
  for (const id of ["a", "b"] as const) {
    r(id).parties += 1;
    if (state.winnerId === id) r(id).victoires += 1;
  }
}

function main() {
  const decks = [...PRECON_DECK_LISTS];
  const releves = new Map(decks.map((d) => [d.name, vide()]));
  const started = Date.now();
  for (let i = 0; i < decks.length; i += 1) {
    for (let j = i + 1; j < decks.length; j += 1) {
      if (ONLY && !ONLY.includes(decks[i]!.name) && !ONLY.includes(decks[j]!.name)) continue;
      for (let seed = 1; seed <= GAMES; seed += 1) {
        const [x, y] = seed % 2 === 0 ? [decks[i]!, decks[j]!] : [decks[j]!, decks[i]!];
        jouer(x, y, seed, releves);
      }
    }
  }

  const f = (n: number, p: number) => (p ? (n / p).toFixed(2) : "—").padStart(6);
  console.log(`\n# Relevé des moteurs — bot ${BOT}, ${GAMES} parties par paire, ${((Date.now() - started) / 1000).toFixed(0)} s\n`);
  console.log("| Deck | WR | retours main | arrivées répétées | Bris | Sabordages | réactions | actions Phase 2 |");
  console.log("|---|---|---|---|---|---|---|---|");
  for (const d of decks) {
    const r = releves.get(d.name)!;
    if (!r.parties) continue;
    console.log(
      `| ${d.name} | ${((r.victoires / r.parties) * 100).toFixed(1)}% | ${f(r.retours, r.parties)} | ${f(r.repetitions, r.parties)} | ${f(r.bris, r.parties)} | ${f(r.sabordages, r.parties)} | ${f(r.reactions, r.parties)} | ${f(r.phase2, r.parties)} |`
    );
  }
}

main();
