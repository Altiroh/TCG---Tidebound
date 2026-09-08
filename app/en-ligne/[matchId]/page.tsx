import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { OnlineMatch } from "@/features/online/OnlineMatch";

export default async function OnlineMatchPage({ params }: { params: { matchId: string } }) {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/connexion");

  const { data: match } = await supabase.from("matches").select("*").eq("id", params.matchId).maybeSingle();
  if (!match || (match.player1_id !== user.id && match.player2_id !== user.id)) {
    redirect("/en-ligne");
  }

  return <OnlineMatch matchId={params.matchId} initialMatch={match} myUserId={user.id} />;
}
