import { redirect } from "next/navigation";
import { fetchRecentOpponents, fetchSocial } from "@/features/friends/actions";
import { fetchTrades } from "@/features/friends/tradeActions";
import { FriendsScreen } from "@/features/friends/FriendsScreen";

export const metadata = { title: "Mes amis · Tidebound" };

/**
 * Amis : code ami, demandes, présence, défis (migration `20261018120000_amis.sql`),
 * échanges de cartes et adversaires récents (`20261112120000_social_vitrine_echanges.sql`).
 */
export default async function AmisPage() {
  const [social, trades, recentOpponents] = await Promise.all([fetchSocial(), fetchTrades(), fetchRecentOpponents()]);
  if (!social) redirect("/connexion");
  return <FriendsScreen social={social} trades={trades ?? undefined} recentOpponents={recentOpponents} />;
}
