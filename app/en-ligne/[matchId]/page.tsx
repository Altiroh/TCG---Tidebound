import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { loadSnapshot } from "@/features/matches/matchStore";
import { OnlineMatch } from "@/features/online/OnlineMatch";

/** Partie arbitrée côté serveur — PvP (invitation, matchmaking) ou contre bot. */
export default async function OnlineMatchPage({ params }: { params: { matchId: string } }) {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
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
