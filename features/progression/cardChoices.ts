import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import type { CardRarity } from "@/game/boosters/types";
import { getCardDefinition } from "@/game";

/**
 * Paliers « carte au choix parmi 3 » — module SERVEUR (pas de `"use server"`).
 *
 * Un palier de ce type (Notion « Progression joueur » §6) ne crédite rien
 * tout de suite : il OUVRE un choix. Les propositions sont tirées ICI, côté
 * serveur, et figées en base — si elles étaient tirées à l'affichage, un
 * joueur pourrait recharger la page jusqu'à tomber sur les cartes qu'il
 * veut.
 *
 * Le tirage écarte en priorité ce que le joueur possède déjà : une carte au
 * choix doit faire avancer la collection, pas offrir un doublon de plus.
 */

export interface LevelCardChoice {
  level: number;
  rarity: CardRarity;
  choices: number;
}

/** Mélange déterminé par `Math.random` — un tirage de récompense, pas un aléa de moteur. */
function pickRandom<T>(values: readonly T[], count: number): T[] {
  const pool = [...values];
  const picked: T[] = [];
  while (picked.length < count && pool.length > 0) {
    const index = Math.floor(Math.random() * pool.length);
    picked.push(pool.splice(index, 1)[0]!);
  }
  return picked;
}

/**
 * Ouvre les choix de carte des paliers franchis. Idempotent par palier
 * (`player_card_choices` a une contrainte d'unicité sur joueur + source) :
 * rejouer l'octroi ne rouvre pas un choix déjà tranché.
 */
export async function openLevelCardChoices(userId: string, choices: readonly LevelCardChoice[]): Promise<void> {
  if (choices.length === 0) return;
  try {
    const service = createSupabaseServiceRoleClient();

    const { data: owned } = await service.from("player_cards").select("card_id").eq("user_id", userId).gt("quantity", 0);
    const ownedIds = new Set((owned ?? []).map((row) => row.card_id));

    for (const choice of choices) {
      const { data: pool } = await service
        .from("cards")
        .select("id")
        .eq("rarity", choice.rarity)
        .eq("is_collectible", true)
        .eq("is_enabled", true);
      if (!pool || pool.length === 0) continue;

      // Priorité aux cartes manquantes ; on complète avec le reste si le
      // joueur possède déjà presque tout ce palier de rareté.
      const missing = pool.filter((row) => !ownedIds.has(row.id)).map((row) => row.id);
      const rest = pool.filter((row) => ownedIds.has(row.id)).map((row) => row.id);
      const offered = [...pickRandom(missing, choice.choices), ...pickRandom(rest, Math.max(0, choice.choices - missing.length))];
      if (offered.length === 0) continue;

      const { error } = await service.rpc("open_card_choice", {
        p_user_id: userId,
        p_source: "level",
        p_source_ref: String(choice.level),
        p_rarity: choice.rarity,
        p_card_ids: offered,
      });
      if (error) console.error("[openLevelCardChoices] Ouverture refusée :", error.message);
    }
  } catch (error) {
    console.error("[openLevelCardChoices] Échec :", error);
  }
}

/** Nombre de propositions d'un choix de carte (« au choix parmi 3 »). */
const OFFER_SIZE = 3;

/** Une carte que le jeu connaît encore (le catalogue du client sait la dessiner). */
function knownCard(cardId: string): boolean {
  try {
    getCardDefinition(cardId);
    return true;
  } catch {
    return false;
  }
}

export interface StoredCardChoice {
  id: string;
  rarity: string;
  offered_card_ids: string[];
}

/**
 * RÉPARE les choix de carte en attente avant de les montrer (13/10/2026).
 *
 * Un retrait de cartes (migration `retrait_corde_route_lot17`) ôte les
 * cartes retirées des propositions non tranchées SANS les remplacer : une
 * proposition pouvait se vider, et l'écran « Garde une carte » ne montrait
 * plus rien à garder. Ici, une carte retirée, désactivée ou inconnue du jeu
 * est écartée, et la proposition est COMPLÉTÉE jusqu'à trois par une carte
 * active de la même rareté (non possédée de préférence) — puis enregistrée,
 * pour que la proposition reste figée comme avant.
 */
export async function repairCardChoices<T extends StoredCardChoice>(userId: string, rows: readonly T[]): Promise<T[]> {
  if (rows.length === 0) return [...rows];
  const service = createSupabaseServiceRoleClient();
  const { data: catalog } = await service.from("cards").select("id, rarity").eq("is_collectible", true).eq("is_enabled", true);
  const active = new Map((catalog ?? []).filter((row) => knownCard(row.id)).map((row) => [row.id, row.rarity as string]));
  let owned: Set<string> | null = null;

  const repaired: T[] = [];
  for (const row of rows) {
    const valid = row.offered_card_ids.filter((cardId) => active.has(cardId));
    // Intacte (rien d'écarté) et non vide : rien à réparer.
    if (valid.length > 0 && valid.length === row.offered_card_ids.length) {
      repaired.push(row);
      continue;
    }
    if (!owned) {
      const { data } = await service.from("player_cards").select("card_id").eq("user_id", userId).gt("quantity", 0);
      owned = new Set((data ?? []).map((entry) => entry.card_id));
    }
    const pool = [...active].filter(([cardId, rarity]) => rarity === row.rarity && !valid.includes(cardId)).map(([cardId]) => cardId);
    const missing = pool.filter((cardId) => !owned!.has(cardId));
    const rest = pool.filter((cardId) => owned!.has(cardId));
    const need = Math.max(0, OFFER_SIZE - valid.length);
    const added = [...pickRandom(missing, need), ...pickRandom(rest, Math.max(0, need - missing.length))];
    const offered = [...valid, ...added];
    // Écriture directe (clé service_role, serveur seulement) : les types générés ferment la table aux
    // écritures, la seule autre voie étant les RPC — et aucune ne réécrit une proposition.
    const { error } = await service
      .from("player_card_choices")
      .update({ offered_card_ids: offered } as never)
      .eq("id", row.id)
      .is("resolved_at", null);
    if (error) console.error("[repairCardChoices] Proposition non réparée :", error.message);
    repaired.push({ ...row, offered_card_ids: offered });
  }
  return repaired;
}
