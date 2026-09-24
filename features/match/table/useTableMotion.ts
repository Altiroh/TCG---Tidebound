"use client";

import { useLayoutEffect, useRef, type ReactNode } from "react";
import { getPlayer, getShipDefinition, type CardInstance, type GameState, type PlayerId } from "@/game";
import { boxOf, DRAW_STAGGER_MS, reducedMotion, useCardMotion, type Box } from "@/features/match/table/useCardMotion";
import {
  playAttackImpact,
  playCardDiscarded,
  playCardDraw,
  playCardPlaced,
  playCardToGraveyard,
  playMagicImpact,
  playShipAbility,
} from "@/lib/sound";

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
 *                         une carte DÉTRUITE (ou un Objet brisé) se brise
 *                         d'abord sur place, et ce sont ses éclats qui volent ;
 *   plateau → main      : la carte glisse de son emplacement jusqu'à la main.
 *                         Un retour en main repart d'un exemplaire NEUF
 *                         (`instanceId` différent) : l'événement
 *                         `CARD_MOVED.toInstanceId` relie les deux, sans quoi
 *                         la carte paraît se téléporter.
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
 * Les SONS des mêmes mouvements (pose, défausse, Cimetière) et des dégâts
 * d'effet partent d'ici aussi, une fois par lot et par sorte — cinq cartes
 * qui partent ensemble ne font pas cinq bruits. Ils ne dépendent pas de
 * `prefers-reduced-motion` : réduire les animations n'est pas couper le son.
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

/**
 * Pose adverse : l'éventail adverse déborde du bord HAUT de l'écran
 * (`TableOpponentHand`) et le rang adverse commence juste en dessous — la
 * carte n'avait donc qu'une centaine de pixels de trajet, à taille
 * constante. Elle « apparaissait » sur le plateau au lieu de s'y poser.
 * Le trajet ne peut pas s'allonger (il n'y a pas la place), alors c'est la
 * carte qui parle : elle arrive nettement plus GRANDE et rétrécit jusqu'à
 * son emplacement, plus lentement — le même vocabulaire que la pose du
 * joueur, dont le fantôme lâché est lui aussi plus grand que la case.
 */
const OPPONENT_PLAY_MS = 620;
const OPPONENT_PLAY_SCALE = 1.3;

function slide(el: HTMLElement, from: Box, to: Box, durationMs = 420) {
  const dx = from.x + from.width / 2 - (to.x + to.width / 2);
  const dy = from.y + from.height / 2 - (to.y + to.height / 2);
  const scale = to.width ? from.width / to.width : 1;
  el.animate(
    [
      { transform: `translate(${dx}px, ${dy}px) scale(${scale}) rotate(-2deg)`, filter: "drop-shadow(0 18px 22px rgba(0,0,0,.65))" },
      { offset: 0.8, transform: "translate(0, 0) scale(0.97) rotate(0deg)", filter: "drop-shadow(0 4px 6px rgba(0,0,0,.5))" },
      { transform: "none", filter: "none" },
    ],
    { duration: durationMs, easing: "cubic-bezier(.2,.8,.2,1)" }
  );
}

function hideUntil(el: Element | null, ms: number) {
  if (!(el instanceof HTMLElement)) return;
  el.style.visibility = "hidden";
  window.setTimeout(() => {
    el.style.visibility = "";
  }, ms);
}

/** Délai du son de pose : il tombe quand la carte touche sa case, pas quand elle part. */
const PLACED_SOUND_DELAY_MS = 260;

/**
 * Un son par SORTE de mouvement dans le lot, pas un par carte.
 *
 * - main → plateau : carte jouée ;
 * - main → Cimetière : défausse ;
 * - plateau → Cimetière : sabordée, détruite, brisée ou expirée ;
 * - `DAMAGE` sans `combat` : dégâts d'EFFET (capacité, Contrecoup, Marée) —
 *   impact « magique ». Un lot qui contient une attaque s'en abstient :
 *   `AttackImpactLayer` joue déjà l'impact du coup ;
 * - capacité de Navire activée ou tirée : le son de sa famille, et l'impact
 *   d'attaque pour le tir du Canon.
 */
function playBatchSounds(
  before: Map<string, Located>,
  now: Map<string, Located>,
  rebornFrom: Map<string, string>,
  events: GameState["eventLog"],
  state: GameState
) {
  let placed = false;
  let discarded = false;
  let toGraveyard = false;
  for (const [id, located] of now) {
    const was = before.get(before.has(id) ? id : (rebornFrom.get(id) ?? id));
    if (!was || was.zone === located.zone) continue;
    if (was.zone === "hand" && located.zone === "board") placed = true;
    else if (was.zone === "hand" && located.zone === "graveyard") discarded = true;
    else if (was.zone === "board" && located.zone === "graveyard") toGraveyard = true;
  }
  if (placed) window.setTimeout(playCardPlaced, PLACED_SOUND_DELAY_MS);
  if (discarded) playCardDiscarded();
  if (toGraveyard) playCardToGraveyard();

  // Capacité de Navire activée : le son que SA définition nomme
  // (`activationSound`). Une capacité qui ne fait qu'armer n'en porte pas —
  // découvrir le canon est silencieux, c'est le tir qu'on entend.
  for (const event of events) {
    if (event.type !== "SHIP_ABILITY_ACTIVATED") continue;
    const sound = getShipDefinition(getPlayer(state, event.playerId).shipId).activatableAbility?.activationSound;
    if (sound) playShipAbility(sound);
  }

  // Le tir du Canon sonne comme un coup porté, pas comme un effet : c'est
  // un boulet qui arrive. (L'animation du tir viendra plus tard.)
  const fired = events.some((event) => event.type === "SHIP_ABILITY_FIRED");
  if (fired) playAttackImpact();

  const hasAttack = events.some((event) => event.type === "ATTACK");
  if (!hasAttack && !fired && events.some((event) => event.type === "DAMAGE" && !event.combat)) playMagicImpact();
}

export function useTableMotion(state: GameState, viewerId: PlayerId, renderFace: (instance: CardInstance) => ReactNode) {
  const motion = useCardMotion();
  const previous = useRef<{ where: Map<string, Located>; boxes: Map<string, Box>; opponentHand: number; logLength: number } | null>(null);
  /** Où le joueur a lâché une carte (pose) : elle en repartira pour glisser jusqu'à sa place. */
  const dropBoxes = useRef(new Map<string, Box>());
  const renderFaceRef = useRef(renderFace);
  renderFaceRef.current = renderFace;

  useLayoutEffect(() => {
    const where = locate(state);
    const opponent = state.players.find((p) => p.id !== viewerId);
    const opponentHand = opponent?.hand.length ?? 0;
    const boxesNow = measureCards();

    // Un déplacement qui recrée la carte (retour en main) donne son ancien
    // exemplaire dans le journal : c'est le seul lien entre les deux ids.
    const rebornFrom = new Map<string, string>();
    for (const event of state.eventLog.slice(previous.current?.logLength ?? state.eventLog.length)) {
      if (event.type === "CARD_MOVED" && event.toInstanceId) rebornFrom.set(event.toInstanceId, event.instanceId);
    }

    let before = previous.current;
    if (!before) {
      // Partie qui commence : les mains de départ n'ont pas d'événement de pioche, on les distribue.
      const starting = !state.eventLog.some((event) => event.type === "END_TURN");
      if (!starting) {
        previous.current = { where, boxes: boxesNow, opponentHand, logLength: state.eventLog.length };
        return;
      }
      const dealt = new Map(where);
      for (const [id, located] of dealt) if (located.zone === "hand") dealt.set(id, { ...located, zone: "deck" });
      before = { where: dealt, boxes: new Map(), opponentHand: 0, logLength: 0 };
    }

    playBatchSounds(before.where, where, rebornFrom, state.eventLog.slice(before.logLength), state);

    if (!reducedMotion()) {
      const sideOf = (ownerId: PlayerId) => (ownerId === viewerId ? "player" : "opponent");
      let viewerDraws = 0;
      // Cartes détruites ou brisées dans ce lot — pas celles sabordées ou expirées, qui partent entières.
      const destroyed = new Set<string>();
      for (const event of state.eventLog.slice(before.logLength)) {
        if (event.type === "DESTROY" || event.type === "OBJECT_BROKEN") destroyed.add(event.instanceId);
      }

      // Détruite sans rejoindre de Cimetière (jeton) : elle se brise sur place et ses éclats s'éteignent là.
      for (const [id, was] of before.where) {
        if (was.zone !== "board" || where.has(id) || !destroyed.has(id)) continue;
        const from = before.boxes.get(id);
        if (from) motion.launch({ look: { kind: "face", node: renderFaceRef.current(was.instance) }, from, to: from, ending: "shatter" });
      }

      for (const [id, now] of where) {
        // L'exemplaire d'où la carte vient : lui-même, ou celui qu'un retour
        // en main a remplacé.
        const originId = before.where.has(id) ? id : (rebornFrom.get(id) ?? id);
        const was = before.where.get(originId);
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
            motion.launch({ look: { kind: "back", ownerId: viewerId }, from, to, ending: "land", delayMs });
            window.setTimeout(playCardDraw, delayMs);
          }
          continue;
        }

        // Vers une défausse : copie de la carte depuis sa dernière position
        // visible. Une carte DÉTRUITE (ou un Objet brisé) se brise d'abord
        // sur place, puis ses éclats rejoignent le Cimetière.
        if (now.zone === "graveyard") {
          const from = before.boxes.get(originId);
          const to = boxOf(document.querySelector(`[data-graveyard="${sideOf(now.ownerId)}"]`));
          const ending = was.zone === "board" && destroyed.has(originId) ? "shatter" : "vanish";
          if (from && to) motion.launch({ look: { kind: "face", node: renderFaceRef.current(was.instance) }, from, to, ending });
          continue;
        }

        // Arrivée sur un plateau ou en main (depuis une zone visible) : la vraie carte glisse.
        if (el && (now.zone === "board" || now.zone === "hand")) {
          const to = boxesNow.get(id);
          let from = dropBoxes.current.get(id) ?? before.boxes.get(originId);
          let posed = false;
          if (!from && now.ownerId !== viewerId && to) {
            // Carte adverse jouée depuis sa main (cachée) : elle part de
            // l'éventail adverse, plus grande qu'elle n'arrivera
            // (cf. `OPPONENT_PLAY_SCALE`).
            const hand = document.querySelector('[data-zone="OpponentHand"]')?.getBoundingClientRect();
            if (hand) {
              const width = to.width * OPPONENT_PLAY_SCALE;
              const height = to.height * OPPONENT_PLAY_SCALE;
              from = { x: hand.left + hand.width / 2 - width / 2, y: hand.top, width, height };
              posed = true;
            }
          }
          dropBoxes.current.delete(id);
          if (from && to) slide(el, from, to, posed ? OPPONENT_PLAY_MS : undefined);
        }
      }

      // Pioches adverses : la main adverse n'est qu'un nombre de dos de cartes.
      //
      // Le dos VOLANT est celui de l'adversaire, pas le mien. Sans
      // `ownerId`, `useCardBackSrcFor` retombait sur le fournisseur local
      // — celui du joueur de cet appareil : l'adversaire piochait mes
      // cartes sous mes yeux, puis elles se posaient dans sa main avec son
      // dos à lui (`TableOpponentHand`). Le dos changeait en plein vol.
      if (opponentHand > before.opponentHand) {
        const from = boxOf(document.querySelector('[data-deck="opponent"]'));
        for (let index = before.opponentHand; index < opponentHand; index++) {
          const target = document.querySelector(`[data-opp-hand-index="${index}"]`);
          const to = boxOf(target);
          if (!from || !to) continue;
          const delayMs = (index - before.opponentHand) * DRAW_STAGGER_MS + (previous.current ? 0 : 380);
          hideUntil(target, delayMs + 650);
          motion.launch({ look: { kind: "back", ownerId: opponent?.id }, from, to, ending: "land", delayMs });
        }
      }
    }

    previous.current = { where, boxes: boxesNow, opponentHand, logLength: state.eventLog.length };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- ne réagit qu'à un nouvel état affiché.
  }, [state]);

  return {
    flights: motion.flights,
    /** À appeler au lâcher d'une carte de main sur le plateau, AVANT d'envoyer l'action. */
    rememberDrop: (instanceId: string, box: Box) => dropBoxes.current.set(instanceId, box),
  };
}
