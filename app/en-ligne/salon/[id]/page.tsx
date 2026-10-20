import { redirect } from "next/navigation";
import { listPlayerDeckLists } from "@/app/decks/actions";
import { fetchDeckCatalog } from "@/features/decks/catalogActions";
import { fetchLobby } from "@/features/friends/lobbyActions";
import { BattleLobby } from "@/features/friends/BattleLobby";

export const metadata = { title: "Salon de combat · Tidebound" };
export const dynamic = "force-dynamic";

/** Salon de combat entre amis (migration `20261113120000`) : deck, « Prêt », compte à rebours, puis la partie. */
export default async function SalonPage({ params }: { params: { id: string } }) {
  const [lobby, personalDecks, catalog] = await Promise.all([fetchLobby(params.id), listPlayerDeckLists(), fetchDeckCatalog()]);
  if (!lobby) redirect("/");
  if (lobby.matchId) redirect(`/en-ligne/${lobby.matchId}`);
  const unlockedDeckIds = catalog.decks.filter((entry) => entry.unlocked).map((entry) => entry.deck.id);
  return <BattleLobby initialLobby={lobby} personalDecks={personalDecks} unlockedDeckIds={unlockedDeckIds} />;
}
