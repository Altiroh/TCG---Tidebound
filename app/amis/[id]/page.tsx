import { redirect } from "next/navigation";
import { fetchPlayerCard } from "@/features/friends/actions";
import { PlayerProfileScreen } from "@/features/friends/PlayerProfileScreen";

export const metadata = { title: "Fiche de capitaine · Tidebound" };
export const dynamic = "force-dynamic";

/** Fiche d'un ami, d'une demande ou d'un adversaire croisé en ligne — rien pour un inconnu. */
export default async function PlayerPage({ params }: { params: { id: string } }) {
  const player = await fetchPlayerCard(params.id);
  if (!player) redirect("/amis");
  return <PlayerProfileScreen player={player} />;
}
