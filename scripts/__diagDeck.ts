import { PRECON_DECKS } from "@/game/cards/decks/catalog";
import { getCardDefinition } from "@/game/cards/sets/core";
import { chooseBotAction } from "@/game/bot/chooseAction";
import { botHasSomethingToDo } from "@/game/bot/runBotTurn";
import { dispatch } from "@/game/engine";
import { createGameState } from "@/game/state/createGameState";
import type { GameState } from "@/game/state/types";

function seeded<T>(seed: number, run: () => T): T {
  const o = Math.random; let s = seed >>> 0;
  Math.random = () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return ((s >>> 0) % 100000) / 100000; };
  try { return run(); } finally { Math.random = o; }
}

for (const CIBLE of process.argv.slice(2)) {
  const iC = PRECON_DECKS.findIndex((d) => d.id === CIBLE);
  const jouees = new Map<string, number>();
  const enMain = new Map<string, number>();
  let parties = 0, victoires = 0, tours = 0;

  for (let adv = 0; adv < PRECON_DECKS.length; adv += 1) {
    if (adv === iC) continue;
    for (let seed = 1; seed <= 6; seed += 1) {
      for (const cibleEstA of [true, false]) {
        seeded(20260918 + seed, () => {
          let state: GameState = createGameState({
            gameId: `d-${adv}-${seed}`,
            player1: { id: "A", deck: PRECON_DECKS[cibleEstA ? iC : adv]! },
            player2: { id: "B", deck: PRECON_DECKS[cibleEstA ? adv : iC]! },
            seed,
          });
          const moi = cibleEstA ? "A" : "B";
          for (let g = 0; g < 4000 && state.status === "active"; g += 1) {
            const actor = botHasSomethingToDo(state, "A") ? "A" : botHasSomethingToDo(state, "B") ? "B" : null;
            if (!actor) break;
            const action = chooseBotAction(state, actor, "moyen");
            if (actor === moi && action.type === "playCard") {
              const c = state.players.find((p) => p.id === moi)!.hand.find((h) => h.instanceId === (action as { instanceId: string }).instanceId);
              if (c) jouees.set(c.cardId, (jouees.get(c.cardId) ?? 0) + 1);
            }
            const r = dispatch(state, action);
            if (!r.ok || r.state === state) break;
            state = r.state;
          }
          parties += 1;
          if (state.winnerId === moi) victoires += 1;
          tours += state.turnNumber;
          for (const c of state.players.find((p) => p.id === moi)!.hand) enMain.set(c.cardId, (enMain.get(c.cardId) ?? 0) + 1);
        });
      }
    }
  }

  const liste = PRECON_DECKS[iC]!;
  console.log(`\n===== ${CIBLE} — ${victoires}/${parties} = ${((victoires / parties) * 100).toFixed(1)}%, ${(tours / parties).toFixed(1)} tours =====`);
  console.log("CARTE                                        coût  jouées  finit-en-main");
  for (const id of [...new Set(liste.cardIds)].sort((a, b) => getCardDefinition(a).cost - getCardDefinition(b).cost)) {
    const d = getCardDefinition(id);
    const ex = liste.cardIds.filter((c) => c === id).length;
    console.log(
      `${`${d.name} (×${ex}, ${d.type})`.padEnd(45)}${String(d.cost).padStart(3)}  ${String(jouees.get(id) ?? 0).padStart(6)}  ${String(enMain.get(id) ?? 0).padStart(13)}`
    );
  }
}
