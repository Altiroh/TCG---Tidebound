import { redirect } from "next/navigation";
import { fetchMyShowcase } from "@/features/friends/showcaseActions";
import { ShowcaseEditor } from "@/features/friends/ShowcaseEditor";
import { getOwnedCardIds } from "@/lib/supabase/ownedCards";

export const metadata = { title: "Ma vitrine · Tidebound" };
export const dynamic = "force-dynamic";

/** Vitrine : six cartes possédées, dans l'édition choisie, montrées aux amis et aux adversaires. */
export default async function VitrinePage() {
  const [showcase, collection] = await Promise.all([fetchMyShowcase(), getOwnedCardIds({ withEditions: true })]);
  if (!showcase || !collection.isSignedIn) redirect("/connexion");
  return <ShowcaseEditor initialShowcase={showcase} ownedCounts={collection.ownedCounts} ownedEditions={collection.ownedEditions} />;
}
