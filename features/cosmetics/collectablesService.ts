import { SHIP_FRAMES, SHIP_FRAME_COSMETIC_KIND, type ShipFrameSkin } from "@/game";
import { progressionView } from "@/game/progression";
import { loadCardBacks, type CardBackCollection } from "@/features/cosmetics/cardBackService";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

/**
 * Collectables — lecture côté SERVEUR. Pas de `"use server"` : ces fonctions
 * prennent un identifiant de joueur, elles ne doivent pas devenir des points
 * d'entrée HTTP (cf. `collectablesActions.ts`, qui déduit le joueur de sa
 * session).
 */

export interface ShipFrameOption extends ShipFrameSkin {
  owned: boolean;
  /** Le seul cadre affiché en partie aujourd'hui : celui d'origine. */
  equipped: boolean;
}

export interface CollectablesView {
  isSignedIn: boolean;
  /** Niveau du joueur, pour dire à combien de niveaux tombe un cadre ou un dos verrouillé. */
  level: number;
  cardBacks: CardBackCollection;
  shipFrames: ShipFrameOption[];
}

function shipFrameOptions(ownedIds: ReadonlySet<string>): ShipFrameOption[] {
  return SHIP_FRAMES.map((frame) => ({ ...frame, owned: frame.free || ownedIds.has(frame.id), equipped: frame.free }));
}

export async function loadCollectables(userId: string | null): Promise<CollectablesView> {
  if (!userId) {
    return { isSignedIn: false, level: 1, cardBacks: await loadCardBacks(null), shipFrames: shipFrameOptions(new Set()) };
  }

  const service = createSupabaseServiceRoleClient();
  const [cardBacks, shipRows, progression] = await Promise.all([
    loadCardBacks(userId),
    service.from("player_cosmetics").select("cosmetic_id").eq("user_id", userId).eq("cosmetic_kind", SHIP_FRAME_COSMETIC_KIND),
    service.from("player_progression").select("xp_total").eq("user_id", userId).maybeSingle(),
  ]);

  if (shipRows.error) console.error("[loadCollectables] Lecture des cadres impossible :", shipRows.error.message);

  return {
    isSignedIn: true,
    level: progressionView(progression.data?.xp_total ?? 0).level,
    cardBacks,
    shipFrames: shipFrameOptions(new Set((shipRows.data ?? []).map((row) => row.cosmetic_id))),
  };
}
