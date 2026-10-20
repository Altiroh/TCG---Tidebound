import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { shownChosenArtwork, type ChosenArtwork } from "@/game/cosmetics/artworks";
import { titleById } from "@/game/titles/catalog";
import { readShowcases } from "@/features/friends/showcaseService";
import type { Showcase } from "@/features/friends/showcaseRules";

/**
 * FICHE D'UN JOUEUR — module SERVEUR, sans directive `"use server"`.
 *
 * Ce qu'un joueur montre aux autres : pseudo, niveau, titre, illustration
 * et vitrine. Lisible par lui-même, ses amis (demandes comprises) et ceux
 * qui l'ont déjà affronté en ligne — jamais par un inconnu : il n'y a pas
 * d'annuaire des comptes (audit du 28/09/2026).
 */

/** Ce qui lie le lecteur au joueur affiché. */
export type PlayerRelation = "self" | "friend" | "request_sent" | "request_received" | "opponent";

export interface PlayerCardView {
  userId: string;
  name: string;
  level: number;
  titleName: string | null;
  avatarCardId: string | null;
  avatarArtwork: ChosenArtwork;
  showcase: Showcase;
  relation: PlayerRelation;
}

function service() {
  return createSupabaseServiceRoleClient();
}

function pairOf(a: string, b: string): { user_a: string; user_b: string } {
  return a < b ? { user_a: a, user_b: b } : { user_a: b, user_b: a };
}

/** Les deux joueurs se sont-ils déjà affrontés en ligne (matchmaking ou match amical) ? */
export async function haveFaced(a: string, b: string): Promise<boolean> {
  const { data, error } = await service()
    .from("matches")
    .select("id")
    .in("mode", ["matchmaking", "private_invite"])
    .or(`and(player1_id.eq.${a},player2_id.eq.${b}),and(player1_id.eq.${b},player2_id.eq.${a})`)
    .limit(1);
  if (error) throw new Error(error.message);
  return (data ?? []).length > 0;
}

/** Lien du lecteur avec `targetId`, ou `null` s'il n'en a aucun. */
export async function relationOf(viewerId: string, targetId: string): Promise<PlayerRelation | null> {
  if (viewerId === targetId) return "self";
  const { data: link } = await service().from("friendships").select("status, requested_by").match(pairOf(viewerId, targetId)).maybeSingle();
  if (link?.status === "accepted") return "friend";
  if (link) return link.requested_by === viewerId ? "request_sent" : "request_received";
  return (await haveFaced(viewerId, targetId)) ? "opponent" : null;
}

/**
 * Fiches de plusieurs joueurs, SANS contrôle d'accès : l'appelant l'a fait
 * (participants d'une même partie, `readPlayerCard`).
 */
export async function readPlayerCards(userIds: string[], relations: Record<string, PlayerRelation>): Promise<Record<string, PlayerCardView>> {
  const ids = [...new Set(userIds)];
  if (ids.length === 0) return {};
  const db = service();
  const [profiles, artworks, progression, titles, showcases] = await Promise.all([
    db.from("profiles").select("id, display_name, avatar_card_id").in("id", ids),
    // À part : colonne de la migration `20261110120000`, peut-être absente (l'avatar reste alors Classique).
    Promise.resolve(db.from("profiles").select("id, avatar_artwork").in("id", ids)),
    db.from("player_progression").select("user_id, level").in("user_id", ids),
    db.from("player_titles").select("user_id, title_id").in("user_id", ids),
    readShowcases(ids),
  ]);
  const artworkOf = new Map((artworks.error ? [] : (artworks.data ?? [])).map((row) => [row.id, row.avatar_artwork]));
  const levelOf = new Map((progression.data ?? []).map((row) => [row.user_id, row.level]));
  const titleOf = new Map((titles.data ?? []).map((row) => [row.user_id, row.title_id]));

  const result: Record<string, PlayerCardView> = {};
  for (const profile of profiles.data ?? []) {
    const avatar = profile.avatar_card_id ?? null;
    result[profile.id] = {
      userId: profile.id,
      name: profile.display_name ?? "Capitaine",
      level: levelOf.get(profile.id) ?? 1,
      titleName: titleById(titleOf.get(profile.id))?.name ?? null,
      avatarCardId: avatar,
      avatarArtwork: avatar ? shownChosenArtwork(avatar, artworkOf.get(profile.id), null) : "classique",
      showcase: showcases[profile.id]!,
      relation: relations[profile.id] ?? "opponent",
    };
  }
  return result;
}

/** Fiche de `targetId` vue par `viewerId` — `null` s'il n'a aucun lien avec lui. */
export async function readPlayerCard(viewerId: string, targetId: string): Promise<PlayerCardView | null> {
  const relation = await relationOf(viewerId, targetId);
  if (!relation) return null;
  return (await readPlayerCards([targetId], { [targetId]: relation }))[targetId] ?? null;
}

export interface RecentOpponent {
  userId: string;
  name: string;
}

/**
 * Derniers adversaires en ligne qui ne sont ni amis ni en demande : de quoi
 * ajouter quelqu'un croisé en matchmaking, sans connaître son code ami.
 */
export async function readRecentOpponents(userId: string, limit = 8): Promise<RecentOpponent[]> {
  const db = service();
  const [{ data: matches }, { data: links }] = await Promise.all([
    db
      .from("matches")
      .select("player1_id, player2_id, created_at")
      .in("mode", ["matchmaking", "private_invite"])
      .or(`player1_id.eq.${userId},player2_id.eq.${userId}`)
      .order("created_at", { ascending: false })
      .limit(40),
    db.from("friendships").select("user_a, user_b").or(`user_a.eq.${userId},user_b.eq.${userId}`),
  ]);
  const linked = new Set((links ?? []).flatMap((row) => [row.user_a, row.user_b]));
  const ids: string[] = [];
  for (const match of matches ?? []) {
    const other = match.player1_id === userId ? match.player2_id : match.player1_id;
    if (!other || other === userId || linked.has(other) || ids.includes(other)) continue;
    ids.push(other);
    if (ids.length >= limit) break;
  }
  if (ids.length === 0) return [];
  const { data: profiles } = await db.from("profiles").select("id, display_name").in("id", ids);
  const names = new Map((profiles ?? []).map((row) => [row.id, row.display_name]));
  return ids.filter((id) => names.has(id)).map((id) => ({ userId: id, name: names.get(id) ?? "Capitaine" }));
}
