import { getCardDefinition } from "@/game/cards/sets/core";
import { deckLookRefusal } from "@/game/rules/deckLook";
import { UNIT_CARD_TYPES } from "@/game/cards/types";
import { chromaticColorsOf } from "@/game/rules/chromatic";
import { closeAndResolveDieRoll, closeDieRollIfIdle, resolveEffectSequence } from "@/game/effects/resolveSequence";
import { adjustPending, keepCandidate, landeReroll } from "@/game/rules/dice";
import { discardFromHand } from "@/game/state/discard";
import { processGraveyardEntryTriggers, processGraveyardRecoveryTriggers, processTrigger } from "@/game/triggers/triggerBus";
import { finirTour } from "@/game/actions/endTurn";
import type { GameEvent } from "@/game/events/types";
import { assertGameActive, assertPlayerInGame, combine } from "@/game/rules/validation";
import { reasonAfterLoss } from "@/game/state/reason";
import { consumeReasonLossShield } from "@/game/state/shields";
import { getPlayer, type GameState, type PlayerState } from "@/game/state/types";
import type { ActionResult, ResolveChoiceAction } from "@/game/actions/types";

function validate(state: GameState, action: ResolveChoiceAction) {
  const generalChecks = combine(assertGameActive(state), assertPlayerInGame(state, action.playerId));
  if (!generalChecks.ok) return generalChecks;

  if (!state.pendingChoice) {
    return { ok: false as const, error: "Aucun choix n'est en attente." };
  }
  if (state.pendingChoice.playerId !== action.playerId) {
    return { ok: false as const, error: "Ce choix n'attend pas ce joueur." };
  }

  return { ok: true as const };
}

/**
 * Résout un choix binaire forcé (ex: Le Fond Vous Regarde) : perdre de la
 * Raison (soumise aux boucliers "1ère fois par tour" comme toute autre
 * perte de Raison, `consumeReasonLossShield`), ou infliger des dégâts
 * d'Ancrage à son PROPRE Navire (jamais intercepté par un bouclier —
 * l'auto-infliction n'est ni une attaque ni un dégât de Marée).
 */
export function resolveChoice(state: GameState, action: ResolveChoiceAction): ActionResult {
  const validation = validate(state, action);
  if (!validation.ok) return { ok: false, error: validation.error };

  const choice = state.pendingChoice!;
  const events: GameEvent[] = [];
  const base = { turnNumber: choice.turnNumber, timestamp: Date.now() };
  let nextState: GameState = { ...state, pendingChoice: undefined };

  // JET DE DÉ EN COURS (Lot 17) : un geste sur le jet, ou la fermeture de la
  // Chaîne. Après un geste, s'il ne reste rien à décider, le jet se résout.
  if (choice.kind === "dieRoll") {
    const reponse = action.choice;
    if (typeof reponse !== "object") return { ok: false, error: "Ce choix attend une décision sur le jet de dé." };
    if ("dieResolve" in reponse) {
      if (choice.candidates !== undefined) return { ok: false, error: "Choisissez d'abord le dé à garder." };
      const ferme = closeAndResolveDieRoll(state, choice);
      return { ok: true, state: ferme.state, events: ferme.events };
    }
    const geste =
      "dieKeep" in reponse
        ? keepCandidate(state, choice, reponse.dieKeep)
        : "dieReroll" in reponse
          ? landeReroll(state, choice)
          : "dieAdjust" in reponse
            ? adjustPending(state, choice, reponse.dieAdjust.sourceInstanceId, reponse.dieAdjust.delta)
            : { ok: false as const, error: "Ce choix attend une décision sur le jet de dé." };
    if (!geste.ok) return geste;
    const suite = closeDieRollIfIdle(geste.state);
    return { ok: true, state: suite.state, events: suite.events };
  }

  // Option d'une capacité (« choisissez : A ou B », ex: Horloge de Marée) :
  // seule la capacité désignée se résout, avec le contexte de la carte source.
  if (choice.kind === "abilityOption") {
    // Refus : la capacité ne se résout pas, et le choix se referme.
    if (action.choice === "pass") return { ok: true, state: nextState, events };
    if (typeof action.choice !== "object" || !("abilityIndex" in action.choice)) {
      return { ok: false, error: "Ce choix attend une option de capacité." };
    }
    const { abilityIndex } = action.choice;
    if (!choice.abilityIndexes.includes(abilityIndex)) return { ok: false, error: "Cette option n'est pas proposée." };
    const ability = getCardDefinition(choice.cardId).abilities?.[abilityIndex];
    if (!ability) return { ok: false, error: "Capacité introuvable." };
    const context = { controllerId: choice.playerId, sourceInstanceId: choice.sourceInstanceId, turnNumber: choice.turnNumber };
    const applied = resolveEffectSequence(nextState, ability.effects, context);
    nextState = applied.state;
    events.push(...applied.events);

    // L'option choisie peut défausser ou repêcher : ses déclencheurs se
    // réveillent comme partout ailleurs.
    const discarded = processGraveyardEntryTriggers(nextState, applied.events, choice.turnNumber);
    nextState = discarded.state;
    events.push(...discarded.events);
    const recovered = processGraveyardRecoveryTriggers(nextState, applied.events, choice.turnNumber);
    nextState = recovered.state;
    events.push(...recovered.events);
    // « Choisissez N effets DIFFÉRENTS » (Lot 17) : la question se repose, sans l'option prise.
    const restantes = choice.abilityIndexes.filter((i) => i !== abilityIndex);
    if ((choice.remainingPicks ?? 0) > 0 && restantes.length > 0) {
      const encore = { ...choice, abilityIndexes: restantes, remainingPicks: (choice.remainingPicks ?? 0) - 1 };
      nextState = nextState.pendingChoice
        ? { ...nextState, pendingChoiceQueue: [encore, ...(nextState.pendingChoiceQueue ?? [])] }
        : { ...nextState, pendingChoice: encore };
    }
    return { ok: true, state: nextState, events };
  }
  // « Choisissez une couleur » (Lot 15) : la suite du texte se résout avec
  // la couleur désignée. Refuser n'est permis que si le texte ne l'impose pas.
  if (choice.kind === "chromaticColor") {
    if (action.choice === "pass") {
      if (!choice.refusable) return { ok: false, error: "Ce texte impose de choisir une couleur." };
      return { ok: true, state: nextState, events };
    }
    if (typeof action.choice !== "object" || !("color" in action.choice)) {
      return { ok: false, error: "Ce choix attend une couleur." };
    }
    const color = action.choice.color;
    if (!choice.options.includes(color)) return { ok: false, error: "Cette couleur n'est pas proposée." };
    const applied = resolveEffectSequence(nextState, choice.effects, { ...choice.context, chosenColor: color });
    nextState = applied.state;
    events.push(...applied.events);
    // La carte qui vient de RECEVOIR sa couleur (Émissaire de Quartz) : ce
    // qui guettait la couleur d'une arrivée (Poste Chromatique) ne pouvait
    // pas la voir avant la réponse — elle n'existait pas encore.
    const porteuse = choice.context.sourceInstanceId
      ? nextState.players
          .flatMap((p) => p.board.map((u) => ({ u, p })))
          .find(({ u }) => u.instanceId === choice.context.sourceInstanceId)
      : undefined;
    if (porteuse && chromaticColorsOf(porteuse.u, porteuse.p.board).includes(color)) {
      const vu = processTrigger(
        nextState,
        {
          trigger: "onChromaticColorChosen",
          playerId: porteuse.p.id,
          cardId: porteuse.u.cardId,
          sourceInstanceId: porteuse.u.instanceId,
          fromSummon: porteuse.u.couleursAvantArrivee === undefined,
        },
        choice.turnNumber
      );
      nextState = vu.state;
      events.push(...vu.events);
    }
    return { ok: true, state: nextState, events };
  }

  // « Regardez la première carte de la pioche adverse. Vous pouvez la placer
  // sous sa pioche. » Laisser la carte dessus est la réponse par défaut.
  if (choice.kind === "deckTopDecision") {
    const decision =
      action.choice === "pass"
        ? "keep"
        : typeof action.choice === "object" && "deckTop" in action.choice
          ? action.choice.deckTop
          : undefined;
    if (decision === undefined) return { ok: false, error: "Ce choix attend « keep » ou « bottom »." };
    if (decision === "bottom") {
      const owner = getPlayer(nextState, choice.deckOwnerId);
      // Elle doit toujours être la carte du dessus : si la pioche a bougé
      // entre-temps, on ne déplace pas une autre carte à sa place.
      if (owner.deck[0]?.instanceId === choice.card.instanceId) {
        nextState = {
          ...nextState,
          players: nextState.players.map((p) =>
            p.id === owner.id ? { ...owner, deck: [...owner.deck.slice(1), owner.deck[0]!] } : p
          ) as [PlayerState, PlayerState],
        };
        events.push({
          ...base,
          type: "CARD_MOVED",
          ownerId: owner.id,
          instanceId: choice.card.instanceId,
          fromZone: "deck",
          toZone: "deck",
          deckPosition: "bottom",
        });
      }
    }
    return { ok: true, state: nextState, events };
  }

  // « Renvoyez jusqu'à N unités […] » : le joueur a désigné lesquelles. Le
  // moteur vérifie qu'elles font bien partie des cibles légales recensées
  // au moment où la question a été posée.
  if (choice.kind === "pickUnits") {
    const designees =
      action.choice === "pass"
        ? []
        : typeof action.choice === "object" && "pickInstanceIds" in action.choice
          ? action.choice.pickInstanceIds
          : undefined;
    if (designees === undefined) return { ok: false, error: "Ce choix attend les unités à désigner." };
    if (new Set(designees).size !== designees.length) return { ok: false, error: "Une même unité ne peut être désignée deux fois." };
    if (designees.length > choice.pick) return { ok: false, error: `Ce choix permet d'en désigner au plus ${choice.pick}.` };
    if (designees.some((id) => !choice.among.includes(id))) {
      return { ok: false, error: "Cette unité n'est pas une cible légale de cet effet." };
    }
    // « de couleurs différentes » (Les Couleurs Répondent) : deux unités
    // désignées ne partagent aucune couleur.
    if (choice.distinctChromaticColors) {
      const vues = new Set<string>();
      for (const id of designees) {
        const owner = nextState.players.find((p) => p.board.some((u) => u.instanceId === id));
        const unit = owner?.board.find((u) => u.instanceId === id);
        const colors = unit && owner ? chromaticColorsOf(unit, owner.board) : [];
        if (colors.length === 0 || colors.some((c) => vues.has(c))) {
          return { ok: false, error: "Ces Sentinelles doivent être de couleurs différentes." };
        }
        colors.forEach((c) => vues.add(c));
      }
    }

    for (const instanceId of designees) {
      // « est ciblée par un effet adverse » (Signal Violet) : désigner une
      // unité adverse ici, c'est la cibler, comme le fait un `chosenUnit`
      // (`resolveEffect`). Sans cet événement, Trinquer Trop Fort visant
      // votre Sentinelle ne réveillait pas la Veilleuse de l'Ombre.
      const proprietaire = nextState.players.find((p) => p.board.some((u) => u.instanceId === instanceId));
      if (proprietaire && proprietaire.id !== choice.controllerId) {
        const ciblee = proprietaire.board.find((u) => u.instanceId === instanceId)!;
        events.push({ ...base, type: "UNIT_TARGETED", instanceId, byPlayerId: choice.controllerId, ownerId: proprietaire.id, cardId: ciblee.cardId });
      }
      // Chaque cible est traitée l'une après l'autre, et les effets y
      // visent `triggerSource` : c'est la cible en cours.
      const applique = resolveEffectSequence(nextState, choice.effects, {
        controllerId: choice.controllerId,
        sourceInstanceId: choice.sourceInstanceId,
        chosenTargetInstanceId: choice.chosenTargetInstanceId,
        triggerSourceInstanceId: instanceId,
        chosenColor: choice.chosenColor,
        turnNumber: choice.turnNumber,
      });
      nextState = applique.state;
      events.push(...applique.events);
    }
    return { ok: true, state: nextState, events };
  }

  // « Chaque joueur choisit jusqu'à N unités qu'il contrôle. Détruisez
  // toutes les autres. » Chacun répond à son tour, et RIEN ne part avant
  // que tout le monde ait répondu : sinon le second choisirait sur un
  // plateau déjà amputé par le premier, ce que le texte ne dit pas.
  if (choice.kind === "keepUnits") {
    const gardees =
      action.choice === "pass"
        ? []
        : typeof action.choice === "object" && "keepInstanceIds" in action.choice
          ? action.choice.keepInstanceIds
          : undefined;
    if (gardees === undefined) return { ok: false, error: "Ce choix attend les unités à garder." };
    if (new Set(gardees).size !== gardees.length) return { ok: false, error: "Une même unité ne peut être gardée deux fois." };
    if (gardees.length > choice.keep) return { ok: false, error: `Ce choix permet d'en garder au plus ${choice.keep}.` };

    const repondant = getPlayer(nextState, choice.playerId);
    const unites = repondant.board.filter((u) => UNIT_CARD_TYPES.includes(getCardDefinition(u.cardId).type));
    if (gardees.some((id) => !unites.some((u) => u.instanceId === id))) {
      return { ok: false, error: "Cette unité n'est pas l'une des vôtres." };
    }

    const cumul = [...choice.kept, ...gardees];
    const [suivant, ...reste] = choice.remainingPlayerIds;
    if (suivant !== undefined) {
      return {
        ok: true,
        state: { ...nextState, pendingChoice: { ...choice, playerId: suivant, remainingPlayerIds: reste, kept: cumul } },
        events,
      };
    }

    // Tout le monde a répondu : ce qui n'a pas été gardé part. `destroy`
    // marque, `processDeaths` emporte — la voie unique de sortie.
    const epargnees = new Set(cumul);
    nextState = {
      ...nextState,
      players: nextState.players.map((p) => ({
        ...p,
        board: p.board.map((u) =>
          UNIT_CARD_TYPES.includes(getCardDefinition(u.cardId).type) && !epargnees.has(u.instanceId)
            ? { ...u, pendingRemoval: "destroyed" as const, ...(choice.controllerId ? { pendingRemovalBy: choice.controllerId } : {}) }
            : u
        ),
      })) as [PlayerState, PlayerState],
    };
    return { ok: true, state: nextState, events };
  }

  // « Restaurez jusqu'à N Résistance répartie » : le joueur a dit combien
  // sur chaque unité. Le moteur vérifie seulement que le total tient dans
  // le budget et que les cibles sont bien les siennes.
  if (choice.kind === "healAllocation") {
    const repartition =
      action.choice === "pass"
        ? []
        : typeof action.choice === "object" && "healAllocation" in action.choice
          ? action.choice.healAllocation
          : undefined;
    if (repartition === undefined) return { ok: false, error: "Ce choix attend une répartition de Résistance." };

    const total = repartition.reduce((somme, part) => somme + part.amount, 0);
    if (repartition.some((part) => part.amount <= 0)) return { ok: false, error: "Une part de soin doit être positive." };
    if (total > choice.budget) return { ok: false, error: `Ce choix ne permet de répartir que ${choice.budget} Résistance.` };
    if (new Set(repartition.map((part) => part.instanceId)).size !== repartition.length) {
      return { ok: false, error: "Une même unité ne peut recevoir deux parts." };
    }

    const player = getPlayer(nextState, choice.playerId);
    if (repartition.some((part) => !player.board.some((u) => u.instanceId === part.instanceId))) {
      return { ok: false, error: "Cette unité n'est pas sur votre plateau." };
    }
    // « répartie entre les UNITÉS que vous contrôlez » (Trousse du Bord,
    // Chirurgien du Bord) : une Structure ou un Équipement blessé n'en est pas.
    if (
      repartition.some((part) => {
        const carte = player.board.find((u) => u.instanceId === part.instanceId)!;
        return !UNIT_CARD_TYPES.includes(getCardDefinition(carte.cardId).type);
      })
    ) {
      return { ok: false, error: "Seule une unité peut recevoir une part de ce soin." };
    }

    const parts = new Map(repartition.map((part) => [part.instanceId, part.amount]));
    nextState = {
      ...nextState,
      players: nextState.players.map((p) =>
        p.id === choice.playerId
          ? {
              ...player,
              board: player.board.map((u) =>
                parts.has(u.instanceId) ? { ...u, damageMarked: Math.max(0, u.damageMarked - parts.get(u.instanceId)!) } : u
              ),
            }
          : p
      ) as [PlayerState, PlayerState],
    };
    for (const part of repartition) {
      events.push({ ...base, type: "HEAL", targetInstanceId: part.instanceId, amount: part.amount });
    }
    return { ok: true, state: nextState, events };
  }

  // « Regardez les N premières cartes de votre pioche » : le joueur dit
  // lesquelles il prend. Les cartes regardées sont déjà SORTIES de la
  // pioche (cf. `lookAtDeckTop`) — quoi qu'il réponde, il faut les y
  // remettre, sous peine de les perdre.
  if (choice.kind === "deckLook") {
    const prises =
      action.choice === "pass"
        ? []
        : typeof action.choice === "object" && "takeInstanceIds" in action.choice
          ? action.choice.takeInstanceIds
          : undefined;
    if (prises === undefined) return { ok: false, error: "Ce choix attend les cartes à prendre en main." };
    // Rien n'est prenable parmi les cartes regardées : ne rien prendre est
    // alors la seule réponse possible, même quand le texte impose d'en prendre.
    if (prises.length === 0 && !choice.refusable && choice.revealed.some((c) => deckLookRefusal(choice, c) === null)) {
      return { ok: false, error: "Ce choix n'est pas refusable : le texte dit d'en prendre une." };
    }
    if (new Set(prises).size !== prises.length) return { ok: false, error: "Une même carte ne peut être prise deux fois." };
    if (prises.length > choice.take) return { ok: false, error: `Ce choix permet d'en prendre au plus ${choice.take}.` };

    const regardees = choice.revealed;
    for (const id of prises) {
      const carte = regardees.find((c) => c.instanceId === id);
      if (!carte) return { ok: false, error: "Cette carte ne fait pas partie de celles que vous regardez." };
      const refus = deckLookRefusal(choice, carte);
      if (refus === "type") return { ok: false, error: "Ce texte ne permet pas de prendre une carte de ce type." };
      if (refus === "archetype") return { ok: false, error: "Ce texte ne permet pas de prendre une carte de cette famille." };
      if (refus === "color") return { ok: false, error: "Ce texte ne permet de prendre qu'une carte de cette couleur." };
      if (refus === "subtype") return { ok: false, error: "Ce texte ne permet pas de prendre une carte de ce sous-type." };
      if (refus === "cost") return { ok: false, error: "Ce texte ne permet pas de prendre une carte aussi chère." };
    }

    const player = getPlayer(nextState, choice.playerId);
    const gardees = regardees.filter((c) => prises.includes(c.instanceId));
    // « Placez les autres SOUS votre pioche », dans l'ordre où elles
    // étaient : le joueur a vu cet ordre, il doit le retrouver.
    let rendues = regardees.filter((c) => !prises.includes(c.instanceId));
    // « Remettez les autres au-dessus dans l'ordre de votre choix » : l'ordre
    // donné doit nommer chacune des cartes rendues, une fois.
    const ordre = typeof action.choice === "object" && "restOrder" in action.choice ? action.choice.restOrder : undefined;
    if (ordre && choice.restTo === "deckTopChosenOrder") {
      const attendues = new Set(rendues.map((c) => c.instanceId));
      if (ordre.length !== attendues.size || new Set(ordre).size !== ordre.length || ordre.some((id) => !attendues.has(id))) {
        return { ok: false, error: "L'ordre donné doit nommer chacune des cartes remises, une seule fois." };
      }
      rendues = ordre.map((id) => rendues.find((c) => c.instanceId === id)!);
    }
    const depuisCimetiere = choice.zone === "graveyard";
    const joueur = depuisCimetiere
      ? { ...player, hand: [...player.hand, ...gardees], graveyard: [...player.graveyard, ...rendues] }
      : {
          ...player,
          hand: [...player.hand, ...gardees],
          deck: choice.restTo === "deckTopChosenOrder" ? [...rendues, ...player.deck] : [...player.deck, ...rendues],
        };
    nextState = {
      ...nextState,
      players: nextState.players.map((p) => (p.id === choice.playerId ? joueur : p)) as [PlayerState, PlayerState],
    };
    for (const carte of gardees) {
      // Repêchée au Cimetière : c'est un déplacement, pas une pioche — les
      // déclencheurs de récupération (Maman revient) doivent la voir.
      events.push(
        depuisCimetiere
          ? { ...base, type: "CARD_MOVED", instanceId: carte.instanceId, cardId: carte.cardId, ownerId: choice.playerId, fromZone: "graveyard", toZone: "hand" }
          : { ...base, type: "DRAW_CARD", playerId: choice.playerId, instanceId: carte.instanceId, viaLook: true }
      );
    }
    // Les cartes regardées qui repartent SOUS la pioche y sont « placées » (Lot 17 — Meraï).
    if (!depuisCimetiere && choice.restTo !== "deckTopChosenOrder") {
      for (const carte of rendues) {
        events.push({ ...base, type: "CARD_MOVED", instanceId: carte.instanceId, cardId: carte.cardId, ownerId: choice.playerId, fromZone: "deck", toZone: "deck", deckPosition: "bottom" });
      }
    }
    // La suite du texte, sur la carte prise (« s'il coûtait 2 ou moins, vous
    // pouvez le jouer pour 1 de moins ce tour »).
    const prise = gardees[0];
    if (prise && choice.continuation) {
      const suite = resolveEffectSequence(nextState, choice.continuation.effects, {
        ...choice.continuation.context,
        chosenGraveyardInstanceId: prise.instanceId,
      });
      nextState = suite.state;
      events.push(...suite.events);
    }
    if (depuisCimetiere && gardees.length > 0) {
      const repechees = processGraveyardRecoveryTriggers(nextState, events, choice.turnNumber);
      nextState = repechees.state;
      events.push(...repechees.events);
    }
    return { ok: true, state: nextState, events };
  }

  // « Défaussez N cartes » : le joueur a désigné lesquelles. Le moteur
  // vérifie seulement qu'elles sont bien dans SA main et qu'il en a nommé
  // le bon nombre — il ne choisit toujours pas à sa place.
  if (choice.kind === "handDiscard") {
    if (action.choice === "pass") {
      if (!choice.refusable) return { ok: false, error: "Cette défausse n'est pas refusable : le texte dit combien, pas si." };
      return { ok: true, state: nextState, events };
    }
    if (typeof action.choice !== "object" || !("discardInstanceIds" in action.choice)) {
      return { ok: false, error: "Ce choix attend les cartes à défausser." };
    }
    const chosen = action.choice.discardInstanceIds;
    if (new Set(chosen).size !== chosen.length) return { ok: false, error: "Une même carte ne peut être défaussée deux fois." };
    // « jusqu'à N » : le compte est un maximum, pas une exigence.
    if (choice.atMost ? chosen.length > choice.count : chosen.length !== choice.count) {
      return {
        ok: false,
        error: choice.atMost
          ? `Ce choix permet d'en désigner au plus ${choice.count}.`
          : `Ce choix attend exactement ${choice.count} carte${choice.count > 1 ? "s" : ""}.`,
      };
    }
    const hand = getPlayer(nextState, choice.playerId).hand;
    if (chosen.some((id) => !hand.some((card) => card.instanceId === id))) {
      return { ok: false, error: "Cette carte n'est pas dans votre main." };
    }
    // « Piochez puis défaussez » : la carte qu'on vient de piocher ne peut
    // pas repartir aussitôt (règle du 05/10/2026).
    const exclues = choice.excludedInstanceIds ?? [];
    if (chosen.some((id) => exclues.includes(id))) {
      return { ok: false, error: "Vous ne pouvez pas défausser la carte que cet effet vient de vous faire piocher." };
    }

    // SOUS LA PIOCHE plutôt qu'au Cimetière (Mauvaise Main) : ce n'est pas
    // une défausse, donc `processGraveyardEntryTriggers` n'a rien à y
    // réveiller et rien ne les repêchera.
    if (choice.destination === "deckBottom") {
      const player = getPlayer(nextState, choice.playerId);
      const rendues = chosen
        .map((id) => player.hand.find((c) => c.instanceId === id))
        .filter((c): c is NonNullable<typeof c> => c !== undefined);
      const restante = player.hand.filter((c) => !chosen.includes(c.instanceId));
      let apres: PlayerState = { ...player, hand: restante, deck: [...player.deck, ...rendues] };
      for (const carte of rendues) {
        events.push({ ...base, type: "CARD_MOVED", ownerId: choice.playerId, instanceId: carte.instanceId, cardId: carte.cardId, fromZone: "hand", toZone: "deck", deckPosition: "bottom" });
      }
      // « puis piochez-en autant » : exactement ce qui vient d'être rendu.
      if (choice.drawBackAfterwards) {
        const piochees = apres.deck.slice(0, rendues.length);
        apres = { ...apres, deck: apres.deck.slice(piochees.length), hand: [...apres.hand, ...piochees] };
        for (const carte of piochees) {
          events.push({ ...base, type: "DRAW_CARD", playerId: choice.playerId, instanceId: carte.instanceId });
        }
      }
      nextState = {
        ...nextState,
        players: nextState.players.map((p) => (p.id === choice.playerId ? apres : p)) as [PlayerState, PlayerState],
      };
      if (choice.continuation) {
        const rest = resolveEffectSequence(nextState, choice.continuation.effects, choice.continuation.context);
        nextState = rest.state;
        events.push(...rest.events);
      }
      return { ok: true, state: nextState, events };
    }

    const discarded = discardFromHand(nextState, choice.playerId, { instanceIds: chosen }, base);
    nextState = discarded.state;

    // LIMITE DE MAIN : une défausse de règle, pas d'effet. Elle réveille les
    // déclencheurs de défausse comme une autre (P'tit Bout rend sa Raison,
    // La Marelle cogne : le texte ne distingue pas la cause), puis la fin
    // du tour reprend là où `endTurn` l'avait suspendue.
    if (choice.handLimit) {
      events.push(...discarded.events);
      const triggered = processGraveyardEntryTriggers(nextState, discarded.events, choice.turnNumber);
      events.push(...triggered.events);
      return finirTour(triggered.state, choice.playerId, events);
    }

    // Une défausse CHOISIE vient toujours d'un effet de carte : c'est ce qui
    // la distingue de la limite de main (Oracle d'Améthyste, Lot 15).
    const defausses = discarded.events.map((event) =>
      event.type === "CARD_MOVED" ? { ...event, discardByEffect: true, ...(choice.afterDraw ? { discardAfterDraw: true } : {}) } : event
    );
    discarded.events.splice(0, discarded.events.length, ...defausses);
    events.push(...discarded.events);

    // La défausse est un fait du jeu : elle réveille ses déclencheurs, où
    // qu'elle ait été décidée (`game/state/discard.ts`).
    const triggered = processGraveyardEntryTriggers(nextState, discarded.events, choice.turnNumber);
    nextState = triggered.state;
    events.push(...triggered.events);

    // Et seulement ensuite, la suite du texte — « si vous le faites… »,
    // « si une carte Un Dead a rejoint votre Cimetière ce tour… ».
    if (choice.continuation) {
      const rest = resolveEffectSequence(nextState, choice.continuation.effects, choice.continuation.context);
      nextState = rest.state;
      events.push(...rest.events);
      const recovered = processGraveyardRecoveryTriggers(nextState, rest.events, choice.turnNumber);
      nextState = recovered.state;
      events.push(...recovered.events);
    }
    return { ok: true, state: nextState, events };
  }

  if (typeof action.choice !== "string" || action.choice === "pass") {
    return { ok: false, error: "Ce choix attend « reasonLoss » ou « anchorDamage » : il n'est pas refusable." };
  }

  if (action.choice === "reasonLoss") {
    const shield = consumeReasonLossShield(nextState, action.playerId, choice.turnNumber);
    nextState = shield.state;
    const finalAmount = Math.max(0, choice.reasonLossAmount - shield.reduction);
    if (finalAmount > 0) {
      const player = getPlayer(nextState, action.playerId);
      events.push({ ...base, type: "REASON_CHANGED", playerId: action.playerId, delta: -finalAmount });
      nextState = {
        ...nextState,
        players: nextState.players.map((p) =>
          p.id === action.playerId ? { ...player, reason: reasonAfterLoss(player, finalAmount) } : p
        ) as [PlayerState, PlayerState],
      };
    }
  } else {
    const player = getPlayer(nextState, action.playerId);
    events.push({
      ...base,
      type: "DAMAGE",
      targetPlayerId: action.playerId,
      amount: choice.anchorDamageAmount,
      targetAnchorAfter: player.anchor - choice.anchorDamageAmount,
    });
    nextState = {
      ...nextState,
      players: nextState.players.map((p) =>
        p.id === action.playerId ? { ...player, anchor: player.anchor - choice.anchorDamageAmount } : p
      ) as [PlayerState, PlayerState],
    };
  }

  return { ok: true, state: nextState, events };
}
