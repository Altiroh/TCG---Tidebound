"use client";

import { useLayoutEffect, useRef, type ReactNode } from "react";
import { getPlayer, getShipDefinition, type CardInstance, type DeckLookChoice, type GameState, type PlayerId } from "@/game";
import { boxOf, DRAW_STAGGER_MS, FLIGHT_MS, reducedMotion, useCardMotion, type Box } from "@/features/match/table/useCardMotion";
import { ARRIVAL_DELAY_MS } from "@/features/match/effectPresentation";
import {
  playAttackImpact,
  playCardDiscarded,
  playCardDraw,
  playCardPlaced,
  playCardShattered,
  playCardToGraveyard,
  playMagicImpact,
  playShipAbility,
  playShipHit,
  playSpellImpact,
  playTideChange,
  playTurnTimedOut,
} from "@/lib/sound";
import { dropToken, flipCard } from "@/features/match/cardFx";

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
 *   regard de pioche    : la carte prise vole de la pioche à la main, face
 *                         visible ; les autres se soulèvent en éventail et
 *                         repassent sous la pioche ;
 *   pioche / Cimetière → plateau ou main : la vraie carte glisse depuis la
 *                         pile d'où elle sort (rappel, invocation depuis la
 *                         pioche) ; une carte adverse ne part de l'éventail
 *                         adverse que si elle sortait de sa main ;
 *   pioche → Cimetière  : (meule) une copie de la carte vole du paquet au crâne ;
 *   plateau / main → pioche : une copie de la carte se fond dans le paquet ;
 *   naissance sur le plateau (jeton, Péon) : la carte TOMBE d'au-dessus de
 *                         sa case et provoque une onde (`dropToken`) ;
 *   Structure révélée   : elle se retourne face visible (`flipCard`) ;
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
const OPPONENT_PLAY_MS = 480;
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

/** Départ d'une pose adverse : au-dessus de l'éventail adverse, plus grande qu'à l'arrivée. */
function opponentFanBox(to: Box): Box | null {
  const hand = document.querySelector('[data-zone="OpponentHand"]')?.getBoundingClientRect();
  if (!hand) return null;
  const width = to.width * OPPONENT_PLAY_SCALE;
  const height = to.height * OPPONENT_PLAY_SCALE;
  return { x: hand.left + hand.width / 2 - width / 2, y: hand.top, width, height };
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
 * - plateau → Cimetière : sabordée ou expirée — DÉTRUITE ou brisée, elle
 *   vole en éclats et c'est le bris qu'on entend (un jeton détruit aussi,
 *   qui ne rejoint aucun Cimetière) ;
 * - le Navire du joueur encaisse hors combat (effet, Marée, Déraison) — un
 *   coup porté en combat sonne au choc, dans `AttackImpactLayer` ;
 * - le chrono du joueur qui regarde arrive au bout ;
 * - la Marée change d'état ;
 * - un sort de soin, de renfort ou de malus a touché sa cible (l'état réel
 *   ne s'affiche qu'à l'arrivée de sa comète, `EffectFxLayer`) ;
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
  state: GameState,
  viewerId: PlayerId,
  destroyed: ReadonlySet<string>
) {
  let placed = false;
  let discarded = false;
  let toGraveyard = false;
  let shattered = false;
  for (const [id, located] of now) {
    const originId = before.has(id) ? id : (rebornFrom.get(id) ?? id);
    const was = before.get(originId);
    if (!was || was.zone === located.zone) continue;
    if (was.zone === "hand" && located.zone === "board") placed = true;
    else if (was.zone === "hand" && located.zone === "graveyard") discarded = true;
    else if (was.zone === "board" && located.zone === "graveyard") {
      if (breaksApart(originId, located, destroyed)) shattered = true;
      else toGraveyard = true;
    }
  }
  // Jeton détruit : il quitte le plateau sans rejoindre de zone, mais se brise sous nos yeux.
  for (const [id, was] of before) if (was.zone === "board" && !now.has(id) && destroyed.has(id)) shattered = true;
  if (placed) window.setTimeout(playCardPlaced, PLACED_SOUND_DELAY_MS);
  if (discarded) playCardDiscarded();
  if (shattered) playCardShattered();
  if (toGraveyard) playCardToGraveyard();

  // Le Navire encaisse hors combat : dégâts d'effet ou de Marée, Ancrage payé pour la Déraison.
  const shipHit = events.some(
    (event) =>
      (event.type === "DAMAGE" && !event.combat && event.targetPlayerId !== undefined && event.amount > 0) ||
      (event.type === "DERAISON_SETTLED" && event.anchorDamage > 0)
  );
  if (shipHit) playShipHit();

  if (events.some((event) => event.type === "TURN_TIMED_OUT" && event.playerId === viewerId)) playTurnTimedOut();

  if (events.some((event) => event.type === "TIDE_ADVANCED" && event.stateChanged)) playTideChange();

  // Une capacité de Navire de soin a déjà son son à l'activation : le soin qu'elle porte ne sonne pas deux fois.
  const shipHeal = events.some((event) => event.type === "SHIP_ABILITY_ACTIVATED");
  if (!shipHeal && events.some((event) => event.type === "HEAL" && event.amount > 0)) playSpellImpact("heal");
  if (events.some((event) => event.type === "BUFF_APPLIED" && (event.attack !== 0 || event.health !== 0 || (event.keywords?.length ?? 0) > 0))) {
    playSpellImpact("buff");
  }
  if (events.some((event) => event.type === "DEBUFF_APPLIED" && (event.attack !== 0 || event.health !== 0))) playSpellImpact("malus");

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

/** Cartes détruites ou brisées dans ce lot — pas celles sabordées ou expirées, qui partent entières. */
function destroyedIn(events: GameState["eventLog"]): Set<string> {
  const destroyed = new Set<string>();
  for (const event of events) if (event.type === "DESTROY" || event.type === "OBJECT_BROKEN") destroyed.add(event.instanceId);
  return destroyed;
}

/**
 * La carte vole-t-elle en éclats en quittant le plateau ? Détruite ou
 * brisée, oui. Une Sentinelle Assemblée (Le Géant Chromatique) aussi : ce
 * n'est pas une destruction pour les règles (elle ne laisse pas d'Éclat),
 * mais elle disparaît dans le colosse.
 */
function breaksApart(originId: string, now: Located, destroyed: ReadonlySet<string>): boolean {
  return destroyed.has(originId) || now.instance.graveyardCause === "assembled";
}

/** Une défausse provoquée par la carte jouée attend qu'elle ait atterri et fait effet. */
const DISCARD_AFTER_PLAY_MS = ARRIVAL_DELAY_MS + 420;
/** Plusieurs cartes défaussées d'un coup : elles partent l'une après l'autre. */
const DISCARD_STAGGER_MS = 160;

export function useTableMotion(state: GameState, viewerId: PlayerId, renderFace: (instance: CardInstance) => ReactNode) {
  const motion = useCardMotion();
  const previous = useRef<{
    where: Map<string, Located>;
    boxes: Map<string, Box>;
    opponentHand: number;
    logLength: number;
    /** Regard de pioche en cours (`DeckLookChoice`) : ses cartes sont hors de toute zone jusqu'à la réponse. */
    looking: DeckLookChoice | null;
  } | null>(null);
  /** Où le joueur a lâché une carte (pose) : elle en repartira pour glisser jusqu'à sa place. */
  const dropBoxes = useRef(new Map<string, Box>());
  const renderFaceRef = useRef(renderFace);
  renderFaceRef.current = renderFace;

  useLayoutEffect(() => {
    const where = locate(state);
    const opponent = state.players.find((p) => p.id !== viewerId);
    const opponentHand = opponent?.hand.length ?? 0;
    const boxesNow = measureCards();
    const looking = state.pendingChoice?.kind === "deckLook" ? state.pendingChoice : null;

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
        previous.current = { where, boxes: boxesNow, opponentHand, logLength: state.eventLog.length, looking };
        return;
      }
      const dealt = new Map(where);
      for (const [id, located] of dealt) if (located.zone === "hand") dealt.set(id, { ...located, zone: "deck" });
      before = { where: dealt, boxes: new Map(), opponentHand: 0, logLength: 0, looking: null };
    }

    const batch = state.eventLog.slice(before.logLength);
    const destroyed = destroyedIn(batch);
    playBatchSounds(before.where, where, rebornFrom, batch, state, viewerId, destroyed);

    if (!reducedMotion()) {
      const sideOf = (ownerId: PlayerId) => (ownerId === viewerId ? "player" : "opponent");
      let viewerDraws = 0;
      // Laisser finir l'action : une carte jouée dans ce lot (posée, ou
      // sort qui se résout) arrive d'abord ; les défausses qu'elle provoque
      // depuis la main partent APRÈS, l'une après l'autre.
      const played = new Set(batch.flatMap((event) => (event.type === "PLAY_CARD" ? [event.instanceId] : [])));
      const discardWait = played.size > 0 ? DISCARD_AFTER_PLAY_MS : 0;
      let discards = 0;

      // Détruite sans rejoindre de Cimetière (jeton) : elle se brise sur place et ses éclats s'éteignent là.
      for (const [id, was] of before.where) {
        if (was.zone !== "board" || where.has(id) || !destroyed.has(id)) continue;
        const from = before.boxes.get(id);
        if (from) motion.launch({ look: { kind: "face", node: renderFaceRef.current(was.instance) }, from, to: from, ending: "shatter" });
      }

      // Boîte d'une pile (pioche, Cimetière) côté de `ownerId` : départ ou arrivée d'une carte qui n'y a pas de place mesurable.
      const pileOf = (zone: "deck" | "graveyard", ownerId: PlayerId) =>
        boxOf(document.querySelector(zone === "deck" ? `[data-deck="${sideOf(ownerId)}"]` : `[data-graveyard="${sideOf(ownerId)}"]`));
      // Les cartes qui rejoignent la main ADVERSE depuis une zone visible (Cimetière, plateau) : elles ne volent pas de la pioche.
      const opponentHandOrigins: Box[] = [];

      for (const [id, now] of where) {
        // L'exemplaire d'où la carte vient : lui-même, ou celui qu'un retour
        // en main a remplacé.
        const originId = before.where.has(id) ? id : (rebornFrom.get(id) ?? id);
        const was = before.where.get(originId);
        if (was && was.zone === now.zone && was.ownerId === now.ownerId) continue;
        const el = document.querySelector<HTMLElement>(`[data-card-id="${id}"]`);

        if (!was) {
          // Carte adverse jouée depuis une main dont on ne connaît pas les exemplaires : comme une pose depuis l'éventail.
          if (el && now.zone === "board" && now.ownerId !== viewerId && played.has(id)) {
            const to = boxesNow.get(id);
            const from = to && opponentFanBox(to);
            if (from && to) slide(el, from, to, OPPONENT_PLAY_MS);
            continue;
          }
          // Carte NÉE sur le plateau (jeton, Péon, colosse assemblé) : elle tombe sur sa case, après la carte qui l'a fait naître.
          if (el && now.zone === "board") dropToken(el, played.size > 0 ? ARRIVAL_DELAY_MS : 0);
          continue;
        }

        // Pioche du joueur qui regarde : dos de carte depuis sa pioche.
        if (now.zone === "hand" && was.zone === "deck" && now.ownerId === viewerId && el) {
          const from = boxOf(document.querySelector('[data-deck="player"]'));
          const to = boxesNow.get(id);
          if (from && to) {
            const delayMs = viewerDraws * DRAW_STAGGER_MS + (previous.current ? 0 : 250);
            viewerDraws += 1;
            hideUntil(el, delayMs + FLIGHT_MS);
            motion.launch({ look: { kind: "back", ownerId: viewerId }, from, to, ending: "land", delayMs });
            window.setTimeout(playCardDraw, delayMs);
          }
          continue;
        }

        // Vers une défausse : copie de la carte depuis sa dernière position
        // visible — ou depuis la pioche quand elle y était (meule). Une carte
        // DÉTRUITE (ou un Objet brisé) se brise d'abord sur place, puis ses
        // éclats rejoignent le Cimetière.
        if (now.zone === "graveyard") {
          const from = before.boxes.get(originId) ?? (was.zone === "deck" ? pileOf("deck", was.ownerId) : null);
          const to = pileOf("graveyard", now.ownerId);
          const ending = was.zone === "board" && breaksApart(originId, now, destroyed) ? "shatter" : "vanish";
          // Défausse depuis la main provoquée par la carte jouée : après elle, en file.
          const fromHandByEffect = was.zone === "hand" && !played.has(originId) && discardWait > 0;
          const delayMs = fromHandByEffect ? discardWait + discards++ * DISCARD_STAGGER_MS : undefined;
          if (from && to) motion.launch({ look: { kind: "face", node: renderFaceRef.current(was.instance) }, from, to, ending, delayMs });
          continue;
        }

        // Remise dans une pioche (« mélangez-la dans votre pioche », « placez-la dessous ») :
        // une copie de la carte quitte sa place et se fond dans le paquet.
        if (now.zone === "deck") {
          const from = before.boxes.get(originId);
          const to = pileOf("deck", now.ownerId);
          if (from && to) motion.launch({ look: { kind: "face", node: renderFaceRef.current(was.instance) }, from, to, ending: "vanish" });
          continue;
        }

        // Vers la main adverse (cachée) depuis une zone visible : son vol part de là, pas de la pioche (plus bas).
        if (now.zone === "hand" && now.ownerId !== viewerId) {
          const from = was.zone === "graveyard" ? pileOf("graveyard", was.ownerId) : was.zone === "board" ? before.boxes.get(originId) : null;
          if (from) opponentHandOrigins.push(from);
          continue;
        }

        // Arrivée sur un plateau ou en main : la vraie carte glisse depuis là
        // où on l'a lâchée, sa place d'avant, ou la pile d'où elle sort
        // (rappel depuis le Cimetière, invocation depuis la pioche).
        if (el && (now.zone === "board" || now.zone === "hand")) {
          const to = boxesNow.get(id);
          let from = dropBoxes.current.get(id) ?? before.boxes.get(originId);
          let posed = false;
          if (!from && (was.zone === "deck" || was.zone === "graveyard")) {
            from = pileOf(was.zone, was.ownerId) ?? undefined;
          } else if (!from && was.zone === "hand" && now.ownerId !== viewerId && to) {
            // Carte adverse jouée depuis sa main (cachée) : elle part de l'éventail adverse.
            from = opponentFanBox(to) ?? undefined;
            posed = Boolean(from);
          }
          dropBoxes.current.delete(id);
          if (from && to) slide(el, from, to, posed ? OPPONENT_PLAY_MS : undefined);
        }
      }

      // Structure révélée (fin de sa période cachée, Marée qui la rend
      // visible) : elle se retourne. L'effet qu'elle déclenche se joue ensuite
      // (réveil, `EffectFxLayer`).
      for (const event of batch) {
        if (event.type !== "STRUCTURE_REVEALED") continue;
        const el = document.querySelector<HTMLElement>(`[data-card-id="${event.instanceId}"]`);
        if (el) flipCard(el);
      }

      // Regard de pioche résolu (« regardez les 4 premières cartes, prenez-en
      // une, placez les autres sous votre pioche ») : les cartes regardées
      // n'étaient dans aucune zone, la boucle ci-dessus ne les voit pas. La
      // carte prise vole FACE VISIBLE de la pioche à la main (pour le
      // joueur qui regarde ; en face, c'est une pioche adverse comme une
      // autre, plus bas) ; les autres se soulèvent en éventail et repassent
      // sous la pioche.
      const looked = before.looking;
      if (looked && looking?.revealed !== looked.revealed) {
        const side = sideOf(looked.playerId);
        const deckBox = boxOf(document.querySelector(`[data-deck="${side}"]`));
        const tucked = looked.revealed.filter((card) => where.get(card.instanceId)?.zone === "deck");
        if (deckBox) {
          tucked.forEach((card, index) => {
            const fan = tucked.length > 1 ? (index / (tucked.length - 1)) * 2 - 1 : 0;
            motion.launch({ look: { kind: "back", ownerId: looked.playerId }, from: deckBox, to: deckBox, ending: "tuck", fan, delayMs: 180 + index * 110 });
          });
          if (looked.playerId === viewerId) {
            for (const card of looked.revealed) {
              if (where.get(card.instanceId)?.zone !== "hand") continue;
              const to = boxesNow.get(card.instanceId);
              if (!to) continue;
              hideUntil(document.querySelector(`[data-card-id="${card.instanceId}"]`), FLIGHT_MS);
              motion.launch({ look: { kind: "face", node: renderFaceRef.current(card) }, from: deckBox, to, ending: "land" });
              playCardDraw();
            }
          }
        }
      }

      // Arrivées dans la main adverse : la main adverse n'est qu'un nombre de
      // dos de cartes. Ce qui vient d'une zone visible (Cimetière, plateau)
      // vole de là ; le reste est une pioche, qui part du paquet adverse.
      // Les places neuves sont en fin d'éventail : pioches d'abord, retours
      // ensuite — l'ordre exact ne se voit pas, le point de départ si.
      //
      // Le dos VOLANT est celui de l'adversaire, pas le mien. Sans
      // `ownerId`, `useCardBackSrcFor` retombait sur le fournisseur local
      // — celui du joueur de cet appareil : l'adversaire piochait mes
      // cartes sous mes yeux, puis elles se posaient dans sa main avec son
      // dos à lui (`TableOpponentHand`). Le dos changeait en plein vol.
      if (opponentHand > before.opponentHand) {
        const deckBox = boxOf(document.querySelector('[data-deck="opponent"]'));
        const arrivals = opponentHand - before.opponentHand;
        const returns = opponentHandOrigins.slice(-arrivals);
        const draws = arrivals - returns.length;
        for (let index = before.opponentHand; index < opponentHand; index++) {
          const target = document.querySelector(`[data-opp-hand-index="${index}"]`);
          const to = boxOf(target);
          const slot = index - before.opponentHand;
          const from = slot < draws ? deckBox : returns[slot - draws];
          if (!from || !to) continue;
          const delayMs = slot * DRAW_STAGGER_MS + (previous.current ? 0 : 380);
          hideUntil(target, delayMs + FLIGHT_MS);
          motion.launch({ look: { kind: "back", ownerId: opponent?.id }, from, to, ending: "land", delayMs });
        }
      }
    }

    previous.current = { where, boxes: boxesNow, opponentHand, logLength: state.eventLog.length, looking };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- ne réagit qu'à un nouvel état affiché.
  }, [state]);

  return {
    flights: motion.flights,
    /** À appeler au lâcher d'une carte de main sur le plateau, AVANT d'envoyer l'action. */
    rememberDrop: (instanceId: string, box: Box) => dropBoxes.current.set(instanceId, box),
  };
}
