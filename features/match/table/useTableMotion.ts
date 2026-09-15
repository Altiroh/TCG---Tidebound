"use client";

import { useLayoutEffect, useRef, type ReactNode } from "react";
import type { CardInstance, GameState, PlayerId } from "@/game";
import { boxOf, DRAW_STAGGER_MS, reducedMotion, useCardMotion, type Box } from "@/features/match/table/useCardMotion";
import { playCardDraw } from "@/lib/sound";

/**
 * Mouvements des cartes du VRAI plateau, pour les deux camps.
 *
 * Plutôt que de décoder chaque type d'événement du moteur, on compare où
 * étaient les cartes au rendu précédent et où elles sont maintenant :
 *
 *   pioche → main       : un dos de carte vole de la pioche jusqu'à sa place
 *                         (la vraie carte reste invisible jusqu'à l'arrivée) ;
 *   main  → plateau     : la vraie carte glisse depuis là où on l'a lâchée,
 *                         ou depuis sa place dans la main ; une carte adverse
 *                         part de la main adverse ;
 *   plateau / main → défausse : une copie de la carte vole jusqu'au crâne ;
 *   toute autre sortie de zone visible (retour en main…) : la carte glisse.
 *
 * Ça marche pareil pour une action du joueur, du bot ou d'un adversaire en
 * ligne, et pour un effet qui déplace des cartes — sans jamais dupliquer la
 * logique du moteur. Au montage d'une partie qui commence (aucune fin de tour),
 * les deux mains de départ sont distribuées carte par carte.
 *
 * Les attaques restent animées par `AttackImpactLayer` : l'état affiché est
 * retenu pendant le coup (`useAttackPresentation`), une carte détruite ne
 * quitte donc le plateau — et ne vole vers la défausse — qu'après le choc.
 *
 * Repères DOM : `data-card-id` (cartes visibles), `data-deck`,
 * `data-graveyard` (`player` = le joueur qui regarde, `opponent`),
 * `data-opp-hand-index`, `data-zone="OpponentHand"`.
 */

type Zone = "deck" | "hand" | "board" | "graveyard";

interface Located {
  zone: Zone;
  ownerId: PlayerId;
  instance: CardInstance;
}

function locate(state: GameState): Map<string, Located> {
  const map = new Map<string, Located>();
  for (const player of state.players) {
    const put = (zone: Zone, cards: CardInstance[]) => cards.forEach((instance) => map.set(instance.instanceId, { zone, ownerId: player.id, instance }));
    put("deck", player.deck);
    put("hand", player.hand);
    put("board", player.board);
    put("graveyard", player.graveyard);
  }
  return map;
}

function measureCards(): Map<string, Box> {
  const boxes = new Map<string, Box>();
  document.querySelectorAll<HTMLElement>("[data-card-id]").forEach((el) => {
    const box = boxOf(el);
    if (box && el.dataset.cardId) boxes.set(el.dataset.cardId, box);
  });
  return boxes;
}

function slide(el: HTMLElement, from: Box, to: Box) {
  const dx = from.x + from.width / 2 - (to.x + to.width / 2);
  const dy = from.y + from.height / 2 - (to.y + to.height / 2);
  const scale = to.width ? from.width / to.width : 1;
  el.animate(
    [
      { transform: `translate(${dx}px, ${dy}px) scale(${scale}) rotate(-2deg)`, filter: "drop-shadow(0 18px 22px rgba(0,0,0,.65))" },
      { offset: 0.8, transform: "translate(0, 0) scale(0.97) rotate(0deg)", filter: "drop-shadow(0 4px 6px rgba(0,0,0,.5))" },
      { transform: "none", filter: "none" },
    ],
    { duration: 420, easing: "cubic-bezier(.2,.8,.2,1)" }
  );
}

function hideUntil(el: Element | null, ms: number) {
  if (!(el instanceof HTMLElement)) return;
  el.style.visibility = "hidden";
  window.setTimeout(() => {
    el.style.visibility = "";
  }, ms);
}

export function useTableMotion(state: GameState, viewerId: PlayerId, renderFace: (instance: CardInstance) => ReactNode) {
  const motion = useCardMotion();
  const previous = useRef<{ where: Map<string, Located>; boxes: Map<string, Box>; opponentHand: number } | null>(null);
  /** Où le joueur a lâché une carte (pose) : elle en repartira pour glisser jusqu'à sa place. */
  const dropBoxes = useRef(new Map<string, Box>());
  const renderFaceRef = useRef(renderFace);
  renderFaceRef.current = renderFace;

  useLayoutEffect(() => {
    const where = locate(state);
    const opponent = state.players.find((p) => p.id !== viewerId);
    const opponentHand = opponent?.hand.length ?? 0;
    const boxesNow = measureCards();

    let before = previous.current;
    if (!before) {
      // Partie qui commence : les mains de départ n'ont pas d'événement de pioche, on les distribue.
      const starting = !state.eventLog.some((event) => event.type === "END_TURN");
      if (!starting) {
        previous.current = { where, boxes: boxesNow, opponentHand };
        return;
      }
      const dealt = new Map(where);
      for (const [id, located] of dealt) if (located.zone === "hand") dealt.set(id, { ...located, zone: "deck" });
      before = { where: dealt, boxes: new Map(), opponentHand: 0 };
    }

    if (!reducedMotion()) {
      const sideOf = (ownerId: PlayerId) => (ownerId === viewerId ? "player" : "opponent");
      let viewerDraws = 0;

      for (const [id, now] of where) {
        const was = before.where.get(id);
        if (!was || (was.zone === now.zone && was.ownerId === now.ownerId)) continue;
        const el = document.querySelector<HTMLElement>(`[data-card-id="${id}"]`);

        // Pioche du joueur qui regarde : dos de carte depuis sa pioche.
        if (now.zone === "hand" && was.zone === "deck" && now.ownerId === viewerId && el) {
          const from = boxOf(document.querySelector('[data-deck="player"]'));
          const to = boxesNow.get(id);
          if (from && to) {
            const delayMs = viewerDraws * DRAW_STAGGER_MS + (previous.current ? 0 : 250);
            viewerDraws += 1;
            hideUntil(el, delayMs + 650);
            motion.launch({ look: { kind: "back" }, from, to, ending: "land", delayMs });
            window.setTimeout(playCardDraw, delayMs);
          }
          continue;
        }

        // Vers une défausse : copie de la carte depuis sa dernière position visible.
        if (now.zone === "graveyard") {
          const from = before.boxes.get(id);
          const to = boxOf(document.querySelector(`[data-graveyard="${sideOf(now.ownerId)}"]`));
          if (from && to) motion.launch({ look: { kind: "face", node: renderFaceRef.current(was.instance) }, from, to, ending: "vanish" });
          continue;
        }

        // Arrivée sur un plateau ou en main (depuis une zone visible) : la vraie carte glisse.
        if (el && (now.zone === "board" || now.zone === "hand")) {
          const to = boxesNow.get(id);
          let from = dropBoxes.current.get(id) ?? before.boxes.get(id);
          if (!from && now.ownerId !== viewerId && to) {
            // Carte adverse jouée depuis sa main (cachée) : elle part de l'éventail adverse.
            const hand = document.querySelector('[data-zone="OpponentHand"]')?.getBoundingClientRect();
            if (hand) from = { x: hand.left + hand.width / 2 - to.width / 2, y: hand.top, width: to.width, height: to.height };
          }
          dropBoxes.current.delete(id);
          if (from && to) slide(el, from, to);
        }
      }

      // Pioches adverses : la main adverse n'est qu'un nombre de dos de cartes.
      if (opponentHand > before.opponentHand) {
        const from = boxOf(document.querySelector('[data-deck="opponent"]'));
        for (let index = before.opponentHand; index < opponentHand; index++) {
          const target = document.querySelector(`[data-opp-hand-index="${index}"]`);
          const to = boxOf(target);
          if (!from || !to) continue;
          const delayMs = (index - before.opponentHand) * DRAW_STAGGER_MS + (previous.current ? 0 : 380);
          hideUntil(target, delayMs + 650);
          motion.launch({ look: { kind: "back" }, from, to, ending: "land", delayMs });
        }
      }
    }

    previous.current = { where, boxes: boxesNow, opponentHand };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- ne réagit qu'à un nouvel état affiché.
  }, [state]);

  return {
    flights: motion.flights,
    /** À appeler au lâcher d'une carte de main sur le plateau, AVANT d'envoyer l'action. */
    rememberDrop: (instanceId: string, box: Box) => dropBoxes.current.set(instanceId, box),
  };
}
