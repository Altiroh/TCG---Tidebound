import { redirect } from "next/navigation";
import { fetchSocial } from "@/features/friends/actions";
import { FriendsScreen } from "@/features/friends/FriendsScreen";

export const metadata = { title: "Mes amis · Tidebound" };

/** Amis : code ami, demandes, présence, défis (migration `20261018120000_amis.sql`). */
export default async function AmisPage() {
  const social = await fetchSocial();
  if (!social) redirect("/connexion");
  return <FriendsScreen social={social} />;
}
