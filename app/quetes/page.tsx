import { fetchQuestBoard } from "@/features/quests/actions";
import { QuestsScreen } from "@/features/quests/QuestsScreen";

/**
 * Quêtes quotidiennes et hebdomadaires. L'attribution et la lecture se font
 * côté serveur ; la réclamation passe par une Server Action autoritaire
 * (`claimQuestReward`), le montant étant relu en base.
 */
export default async function QuetesPage() {
  const board = await fetchQuestBoard();
  return <QuestsScreen board={board} />;
}
