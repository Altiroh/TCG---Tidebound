import { hasMarker, unitHasSubtype } from "@/game/cards/markers";
import { hasSubtype } from "@/game/cards/subtypes";
import { isTextIgnored } from "@/game/cards/types";
import { countArchetypeUnits } from "@/game/cards/archetypes";
import { getCardDefinition } from "@/game/cards/sets/core";
import { isVisibleDuringTide, UNIT_CARD_TYPES, type CardDefinition, type CardInstance } from "@/game/cards/types";
import { CHROMATIC_TUNING, SENTINELLE_CHROMATIQUE, signalSources } from "@/game/rules/chromatic";
import type { TideStateName } from "@/game/environment/types";
import type { GameState } from "@/game/state/types";

export interface EffectiveStats {
  attack: number;
  health: number;
  /** Vrai si la carte est rendue inactive par la Marée courante (ne peut ni attaquer, ni utiliser ses capacités). */
  inactive: boolean;
  /** Vrai si la Marée courante devrait détruire cette carte (à traiter par `processDeaths`). */
  destroyedByTide: boolean;
}

/**
 * Contexte de plateau nécessaire pour calculer les auras/stats dynamiques
 * (Bernard-l'Ermite d'Acier, Matelot Insomniaque, Lampe de Pont Rouge) :
 * uniquement le plateau et la Raison du CONTRÔLEUR de l'unité évaluée — ces
 * mécanismes ne portent jamais sur le plateau adverse. Optionnel : un appelant qui ne le fournit
 * pas obtient les stats "de base" (modificateurs + Marée), sans les auras —
 * utile pour les affichages qui n'ont pas facilement accès au plateau complet.
 */
export interface AuraContext {
  /** Plateau complet du contrôleur de l'unité évaluée (elle y figure elle-même). */
  controllerBoard: readonly CardInstance[];
  /** Raison actuelle du contrôleur. */
  controllerReason: number;
  /**
   * Sens courant du cycle de Marée — nécessaire aux cartes qui en
   * dépendent (Cra-Poiscail des Bas-Fonds / des Hautes-Eaux). Vit ici
   * plutôt qu'en paramètre séparé pour suivre la même règle que les
   * auras : un appelant qui ne fournit pas de contexte obtient les stats
   * de base, sans elles.
   */
  tideOrientation?: "montante" | "descendante";
  /**
   * Le contrôleur de l'unité est-il le joueur ACTIF ? Lu par le Signal Rouge
   * (« +1 Puissance pendant votre tour », Lot 15). Absent : on ne sait pas,
   * donc aucun bonus « pendant votre tour » — plutôt que d'en donner un à
   * tort sur le tour adverse.
   */
  controllerIsActive?: boolean;
  /** Une Lande est-elle en jeu ? (« Tant qu'une Lande est active », Lot 17.) Absent : non. */
  landeActive?: boolean;
}

/**
 * Contexte d'aura COMPLET du joueur `controllerId` dans cet état : son
 * plateau, sa Raison, le sens de la Marée, et s'il est le joueur actif.
 *
 * Les sites qui construisent le contexte à la main oubliaient
 * immanquablement un champ le jour où il en apparaissait un — c'est ce
 * point d'entrée que le moteur utilise désormais là où la Puissance compte.
 */
export function auraContextOf(state: Pick<GameState, "players" | "activePlayerId" | "environment">, controllerId: string): AuraContext {
  const controller = state.players.find((p) => p.id === controllerId);
  return {
    controllerBoard: controller?.board ?? [],
    controllerReason: controller?.reason ?? 0,
    tideOrientation: state.environment.tideOrientation,
    controllerIsActive: state.activePlayerId === controllerId,
    landeActive: state.environment.lande !== undefined,
  };
}

/**
 * Calcule les statistiques effectives d'une unité en combinant :
 * la définition de base, les modificateurs temporaires/permanents
 * (buffs/debuffs), l'affinité de Marée de la carte pour l'état actuel, et —
 * si `aura` est fourni — les auras/stats dynamiques qui dépendent du reste
 * du plateau de son contrôleur ou de sa Raison. Point d'entrée unique pour
 * "combien vaut vraiment cette unité maintenant" — à utiliser partout plutôt
 * que de relire `def.attack`/`def.health` en direct.
 */
/**
 * Un bonus de statistiques venu du PLATEAU (et non posé sur la carte) :
 * d'où il vient, et ce qu'il vaut. Sert à la fois au calcul des stats
 * effectives et à la fiche de carte, qui doit pouvoir dire au joueur
 * "+1 Puissance — Cra-Poiscail Porte-Étendard" plutôt qu'un chiffre
 * inexpliqué.
 */
export interface AuraContribution {
  /** Carte qui accorde le bonus — elle-même pour un bonus conditionnel sur soi. */
  sourceCardId: string;
  /** Exemplaire précis de cette carte sur le plateau, quand il est identifiable. */
  sourceInstanceId?: string;
  attack: number;
  health: number;
}

/**
 * Détaille tous les bonus de plateau qui s'appliquent à `unit` : auras
 * reçues d'autres cartes, bonus conditionnels sur soi (taille du banc,
 * Raison, orientation de Marée, carte nommée en jeu) et bonus d'Équipement.
 *
 * `computeEffectiveStats` en fait la somme ; l'interface, elle, en affiche
 * le détail. Une seule source de vérité pour les deux — sinon l'affichage
 * finit toujours par diverger du calcul réel.
 */
export function collectAuraContributions(
  unit: CardInstance,
  tideState: TideStateName,
  aura: AuraContext
): AuraContribution[] {
  const def = getCardDefinition(unit.cardId);
  const { controllerBoard, controllerReason, tideOrientation } = aura;
  const contributions: AuraContribution[] = [];

  const addSelf = (spec: { attackAmount?: number; healthAmount?: number }) => {
    contributions.push({
      sourceCardId: unit.cardId,
      sourceInstanceId: unit.instanceId,
      attack: spec.attackAmount ?? 0,
      health: spec.healthAmount ?? 0,
    });
  };

  // Bernard-l'Ermite d'Acier : bonus sur soi tant qu'une Structure VISIBLE est contrôlée.
  const visibleStructureBuff = def.selfBuffWhileControllingVisibleStructure;
  if (
    visibleStructureBuff &&
    controllerBoard.some((other) => {
      const otherDef = getCardDefinition(other.cardId);
      return otherDef.type === "structure" && isVisibleDuringTide(otherDef, tideState);
    })
  ) {
    addSelf(visibleStructureBuff);
  }

  // Gardien des Balises (Lot 17) : bonus sur soi tant qu'une Lande est active.
  if (def.selfBuffWhileLandeActive && aura.landeActive) addSelf(def.selfBuffWhileLandeActive);

  // Matelot Insomniaque : bonus sur soi tant que la Raison du contrôleur est sous le seuil.
  const reasonSelfBuff = def.selfBuffWhileControllerReasonAtMost;
  if (reasonSelfBuff && controllerReason <= reasonSelfBuff.reasonAtMost) addSelf(reasonSelfBuff);

  // Chevalier Cra-Poiscail : bonus tant qu'une carte nommée est en jeu.
  const namedSelfBuff = def.selfBuffWhileControllingCardIds;
  if (namedSelfBuff && controllerBoard.some((other) => namedSelfBuff.cardIds.includes(other.cardId))) {
    addSelf(namedSelfBuff);
  }

  // Cra-Poiscail des Bas-Fonds / des Hautes-Eaux : bonus selon le sens du cycle.
  const orientationBuff = def.selfBuffWhileTideOrientation;
  if (orientationBuff && tideOrientation === orientationBuff.orientation) addSelf(orientationBuff);

  // Banc de Cra-Poiscail : bonus sur soi tant que le banc atteint une
  // certaine taille (Marins et Créatures uniquement, cf. `countArchetypeUnits`).
  const archetypeSelfBuff = def.selfBuffWhileControllingArchetype;
  if (
    archetypeSelfBuff &&
    countArchetypeUnits(controllerBoard, archetypeSelfBuff.archetype, {
      excludeInstanceId: archetypeSelfBuff.excludeSelf ? unit.instanceId : undefined,
    }) >= archetypeSelfBuff.atLeast
  ) {
    addSelf(archetypeSelfBuff);
  }

  // Duelliste de Verre : bonus tant qu'il porte des dégâts.
  if (def.selfBuffWhileDamaged && unit.damageMarked > 0) addSelf(def.selfBuffWhileDamaged);

  // Le Gardien des Jouets (Lot 18) : bonus tant qu'assez d'unités alliées portent le marqueur.
  const markedSelfBuff = def.selfBuffWhileMarkedUnitsAtLeast;
  if (
    markedSelfBuff &&
    controllerBoard.filter((other) => UNIT_CARD_TYPES.includes(getCardDefinition(other.cardId).type) && hasMarker(other, markedSelfBuff.marker))
      .length >= markedSelfBuff.atLeast
  ) {
    addSelf(markedSelfBuff);
  }

  // Le Grand Frère (Lot 18) : « vos unités qui portent un marqueur Mort » —
  // la source comprise, d'où ce passage hors de la boucle des auras, qui
  // l'écarte.
  if (UNIT_CARD_TYPES.includes(def.type)) {
    for (const source of controllerBoard) {
      const markedAura = getCardDefinition(source.cardId).auraBuffMarkedUnits;
      if (!markedAura || !hasMarker(unit, markedAura.marker)) continue;
      contributions.push({
        sourceCardId: source.cardId,
        sourceInstanceId: source.instanceId,
        attack: markedAura.attackAmount ?? 0,
        health: markedAura.healthAmount ?? 0,
      });
    }
  }

  // Destrier du Ressac : bonus tant qu'il est la SEULE unité de son camp.
  const onlyUnitBuff = def.selfBuffWhileOnlyUnit;
  if (
    onlyUnitBuff &&
    controllerBoard.filter((other) => UNIT_CARD_TYPES.includes(getCardDefinition(other.cardId).type)).length === 1
  ) {
    addSelf(onlyUnitBuff);
  }

  // Signaux Chromatiques (Lot 15) : chaque Rouge prête +1 Puissance pendant
  // le tour de son contrôleur, chaque Jaune +1 Résistance maximale, à toutes
  // les AUTRES Sentinelles — même couleur comprise, et en cumul. Une
  // contribution par émetteur, pour que la fiche dise d'où vient chaque +1.
  const addSignal = (color: "rouge" | "jaune", spec: { attackAmount?: number; healthAmount?: number }) => {
    // Plafond éventuel du cumul (`CHROMATIC_TUNING`, aucun par défaut).
    for (const emitter of signalSources(unit, color, controllerBoard).slice(0, CHROMATIC_TUNING.staticSignalCap)) {
      contributions.push({
        sourceCardId: emitter.cardId,
        sourceInstanceId: emitter.instanceId,
        attack: spec.attackAmount ?? 0,
        health: spec.healthAmount ?? 0,
      });
    }
  };
  if (aura.controllerIsActive) addSignal("rouge", { attackAmount: 1 });
  addSignal("jaune", { healthAmount: 1 });

  for (const source of controllerBoard) {
    if (source.instanceId === unit.instanceId) continue;
    const sourceDef = getCardDefinition(source.cardId);
    const add = (spec: { attackAmount?: number; healthAmount?: number }) => {
      contributions.push({
        sourceCardId: source.cardId,
        sourceInstanceId: source.instanceId,
        attack: spec.attackAmount ?? 0,
        health: spec.healthAmount ?? 0,
      });
    };

    // Écuyer / Destrier : aura reçue d'une autre carte qui nomme celle-ci.
    const named = sourceDef.auraBuffCardIds;
    if (named && named.cardIds.includes(unit.cardId)) add(named);

    // Porte-Étendard / Roi / Trône de Bouchon : aura réservée à une
    // famille, et seulement à ses UNITÉS — une Structure ou un Objet de la
    // famille ne "gagne pas de Puissance", il n'en a pas (même règle que
    // le comptage, cf. `countArchetypeUnits`).
    const archetypeAura = sourceDef.auraBuffOtherArchetypeUnits;
    if (
      archetypeAura &&
      def.archetype === archetypeAura.archetype &&
      (UNIT_CARD_TYPES as readonly string[]).includes(def.type) &&
      (archetypeAura.requiresArchetypeCountAtLeast === undefined ||
        countArchetypeUnits(controllerBoard, archetypeAura.archetype) >= archetypeAura.requiresArchetypeCountAtLeast)
    ) {
      add(archetypeAura);
    }

    // Filet de Sauvetage / Cloison Étanche : aura par type de carte, portée
    // tant que la source est visible. Un BUFF de Résistance maximale, pas
    // un soin — cf. `auraBuffControllerCardTypes`.
    const typeAura = sourceDef.auraBuffControllerCardTypes;
    if (
      typeAura &&
      typeAura.targetTypes.includes(def.type) &&
      (typeAura.targetSubtype === undefined || unitHasSubtype(def, unit, typeAura.targetSubtype)) &&
      (!typeAura.whileSelfVisible || isVisibleDuringTide(sourceDef, tideState))
    ) {
      add(typeAura);
    }

    // Lampe de Pont Rouge : bonus d'Équipement conditionnel à la Marée.
    if (source.attachedToInstanceId === unit.instanceId) {
      const equipBuff = sourceDef.equipGrantsBuffWhileTideStateIn;
      if (equipBuff && equipBuff.tideStateIn.includes(tideState)) add(equipBuff);
      // Harpon de Pont, Treuil Rouillé… : bonus inconditionnel du porteur,
      // relu en direct pour qu'il disparaisse avec l'Équipement.
      if (sourceDef.equipGrantsBuff) add(sourceDef.equipGrantsBuff);
      // Selle de Guerre : un supplément réservé aux porteurs assez lourds.
      const heavyBuff = sourceDef.equipGrantsBuffIfBearerCostAtLeast;
      if (heavyBuff && def.cost >= heavyBuff.cost) add(heavyBuff);
    }
  }

  return contributions.filter((c) => c.attack !== 0 || c.health !== 0);
}

const NO_AURA = { attack: 0, health: 0 } as const;

/**
 * Somme des bonus de plateau d'une unité, MÉMORISÉE.
 *
 * `computeEffectiveStats` est la fonction la plus appelée du moteur : chaque
 * `dispatch` relit la Puissance de toutes les unités plusieurs fois (morts,
 * pouvoirs, déclencheurs), et la recherche du bot « difficile » enchaîne des
 * milliers de `dispatch` par décision. Chaque appel rebalayait tout le
 * plateau pour y chercher des auras — la moitié du temps de réflexion du
 * bot, mesuré au profileur.
 *
 * L'état de partie ne se modifie jamais en place (chaque changement produit
 * de nouveaux objets) : un plateau et une unité IDENTIQUES en mémoire, avec
 * la même Marée et le même contexte, donnent forcément le même total. La clé
 * est donc l'identité des objets ; `WeakMap` laisse partir les états que
 * plus personne ne tient.
 *
 * Le reste du contexte (Marée, Raison, sens, joueur actif, Lande) se range
 * sous une clé NUMÉRIQUE (`auraContextKey`) : la clé en chaîne recomposée à
 * chaque appel coûtait à elle seule une bonne part du temps de la fonction
 * (3,3 millions d'appels pour une partie du bot difficile, 10/10/2026).
 */
const auraTotalsCache = new WeakMap<readonly CardInstance[], WeakMap<CardInstance, Map<number, { attack: number; health: number }>>>();

const TIDE_KEY: Record<TideStateName, number> = { calme: 0, houle: 1, tempete: 2, abysses: 3 };
/** Trois valeurs : absent, faux, vrai. */
const tri = (value: boolean | undefined) => (value === undefined ? 0 : value ? 1 : 2);

/** Clé numérique du contexte d'aura : un entier distinct par combinaison (Raison bornée à ±10 000). */
function auraContextKey(tideState: TideStateName, aura: AuraContext): number {
  const orientation = aura.tideOrientation === undefined ? 0 : aura.tideOrientation === "montante" ? 1 : 2;
  const flags = TIDE_KEY[tideState] * 27 + orientation * 9 + tri(aura.controllerIsActive) * 3 + tri(aura.landeActive);
  return (aura.controllerReason + 10_000) * 108 + flags;
}

function auraTotals(unit: CardInstance, tideState: TideStateName, aura: AuraContext): { attack: number; health: number } {
  let byUnit = auraTotalsCache.get(aura.controllerBoard);
  if (!byUnit) {
    byUnit = new WeakMap();
    auraTotalsCache.set(aura.controllerBoard, byUnit);
  }
  let byContext = byUnit.get(unit);
  if (!byContext) {
    byContext = new Map();
    byUnit.set(unit, byContext);
  }
  const key = auraContextKey(tideState, aura);
  const cached = byContext.get(key);
  if (cached) return cached;

  // « Son texte est ignoré » (Lot 17) : ni ses bonus sur elle-même, ni ceux
  // qu'elle donne aux autres.
  let muettes: Set<string> | null = null;
  for (const other of aura.controllerBoard) {
    if (isTextIgnored(other)) (muettes ??= new Set()).add(other.instanceId);
  }
  const selfIgnored = isTextIgnored(unit);
  const totals = { attack: 0, health: 0 };
  for (const c of collectAuraContributions(unit, tideState, aura)) {
    if (c.sourceInstanceId && muettes?.has(c.sourceInstanceId)) continue;
    if (c.sourceInstanceId === unit.instanceId && selfIgnored) continue;
    totals.attack += c.attack;
    totals.health += c.health;
  }
  byContext.set(key, totals);
  return totals;
}

/**
 * CHEMIN RAPIDE DES AURAS (10/10/2026). La plupart des plateaux n'ont aucune
 * carte qui en donne, et la plupart des unités aucun bonus sur elles-mêmes —
 * mais chaque lecture de Puissance payait quand même le cache et ses clés.
 *
 * Toute contribution de `collectAuraContributions` vient de l'une de ces
 * trois sources, et d'aucune autre :
 *   - un champ `selfBuff…` de la carte elle-même ;
 *   - un Signal chromatique, qui ne profite qu'aux Sentinelles ;
 *   - un champ `auraBuff…` ou `equipGrantsBuff…` d'une carte du plateau.
 * Sans aucune des trois, le total est nul et on s'épargne le calcul. Un
 * nouveau bonus de plateau doit donc garder l'un de ces préfixes.
 */
const auraProfileCache = new WeakMap<CardDefinition, { receivesOwn: boolean; grants: boolean }>();

function auraProfile(def: CardDefinition): { receivesOwn: boolean; grants: boolean } {
  let profile = auraProfileCache.get(def);
  if (!profile) {
    const keys = Object.keys(def).filter((key) => def[key as keyof CardDefinition] !== undefined);
    profile = {
      receivesOwn: def.archetype === SENTINELLE_CHROMATIQUE || keys.some((key) => key.startsWith("selfBuff")),
      grants: keys.some((key) => key.startsWith("auraBuff") || key.startsWith("equipGrantsBuff")),
    };
    auraProfileCache.set(def, profile);
  }
  return profile;
}

const boardGrantsCache = new WeakMap<readonly CardInstance[], boolean>();

function boardGrantsAura(board: readonly CardInstance[]): boolean {
  let grants = boardGrantsCache.get(board);
  if (grants === undefined) {
    grants = board.some((card) => auraProfile(getCardDefinition(card.cardId)).grants);
    boardGrantsCache.set(board, grants);
  }
  return grants;
}

function mayReceiveAura(def: CardDefinition, board: readonly CardInstance[]): boolean {
  return auraProfile(def).receivesOwn || boardGrantsAura(board);
}

/**
 * Calcule les statistiques effectives d'une unité en combinant :
 * la définition de base, les modificateurs temporaires/permanents
 * (buffs/debuffs), l'affinité de Marée de la carte pour l'état actuel, et —
 * si `aura` est fourni — les bonus qui dépendent du reste du plateau de son
 * contrôleur (`collectAuraContributions`). Point d'entrée unique pour
 * "combien vaut vraiment cette unité maintenant" — à utiliser partout plutôt
 * que de relire `def.attack`/`def.health` en direct.
 */
export function computeEffectiveStats(unit: CardInstance, tideState: TideStateName, aura?: AuraContext): EffectiveStats {
  const def = getCardDefinition(unit.cardId);
  const tideEntry = def.tideAffinity?.[tideState];

  const baseAttack = tideEntry?.attack ?? def.attack ?? 0;
  const baseHealth = tideEntry?.health ?? def.health ?? 0;

  const modifierAttack = unit.modifiers.reduce((sum, m) => sum + m.attack, 0);
  const modifierHealth = unit.modifiers.reduce((sum, m) => sum + m.health, 0);

  const { attack: auraAttack, health: auraHealth } =
    aura && mayReceiveAura(def, aura.controllerBoard) ? auraTotals(unit, tideState, aura) : NO_AURA;

  return {
    attack: baseAttack + modifierAttack + auraAttack,
    health: baseHealth + modifierHealth + auraHealth,
    // Inactive par la Marée OU entravée par un modificateur (Chaîne de
    // Travers) : les deux disent la même chose au reste du moteur — cette
    // carte ne peut ni attaquer ni activer ses effets.
    inactive: (tideEntry?.inactive ?? false) || unit.modifiers.some((m) => m.silenced),
    destroyedByTide: tideEntry?.destroyed ?? false,
  };
}

/**
 * Isole la contribution des modificateurs (buffs/debuffs) sur la
 * Puissance/Résistance affichée, séparément de l'affinité de Marée —
 * pour la lisibilité visuelle demandée par Notion "Moteur de partie"
 * (valeur au-dessus de la base imprimée en vert, en-dessous en rouge).
 * `0` = valeur de base (imprimée, éventuellement ajustée par la Marée),
 * inchangée par un buff/debuff actif.
 */
export function computeStatModifierDelta(unit: CardInstance): { attack: number; health: number } {
  return {
    attack: unit.modifiers.reduce((sum, m) => sum + m.attack, 0),
    health: unit.modifiers.reduce((sum, m) => sum + m.health, 0),
  };
}
