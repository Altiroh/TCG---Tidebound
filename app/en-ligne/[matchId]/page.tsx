import { redirect } from "next/navigation";
import { loadSnapshot } from "@/features/matches/matchStore";
import { OnlineMatch } from "@/features/online/OnlineMatch";
import { getSessionUser } from "@/lib/supabase/sessionUser";

/** Partie arbitrée côté serveur — PvP (invitation, matchmaking) ou contre bot. */
export default async function OnlineMatchPage({ params }: { params: { matchId: string } }) {
  const user = await getSessionUser();
  if (!user) redirect("/connexion");

  const snapshot = await loadSnapshot(params.matchId, user.id);
  if (!snapshot) redirect("/en-ligne");

  return (
    <OnlineMatch
      matchId={params.matchId}
      initialMatch={snapshot.match}
      initialView={snapshot.view}
      myUserId={user.id}
    />
  );
}
