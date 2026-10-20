import { redirect } from "next/navigation";
import { fetchPlayerCard } from "@/features/friends/actions";
import { fetchTradeTable } from "@/features/friends/tradeActions";
import { TradeComposer } from "@/features/friends/TradeComposer";

export const metadata = { title: "Proposer un échange · Tidebound" };
export const dynamic = "force-dynamic";

/** Proposer un échange de cartes à un ami (migration `20261112120000`). */
export default async function TradePage({ params }: { params: { id: string } }) {
  const [player, table] = await Promise.all([fetchPlayerCard(params.id), fetchTradeTable(params.id)]);
  if (!player || player.relation !== "friend" || !table) redirect("/amis");
  return <TradeComposer friend={{ userId: player.userId, name: player.name }} mine={table.mine} theirs={table.theirs} />;
}
