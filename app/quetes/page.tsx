import { fetchQuestBoard } from "@/features/quests/actions";
import { fetchVoyageBoard } from "@/features/quests/voyageActions";
import { QuestsScreen } from "@/features/quests/QuestsScreen";

/**
 * Quêtes quotidiennes et hebdomadaires, et la Traversée en cours.
 * L'attribution et la lecture se font côté serveur ; la réclamation passe
 * par des Server Actions autoritaires (`claimQuestReward`,
 * `claimVoyageTier`), les montants étant relus côté serveur.
 */
export default async function QuetesPage() {
  const [board, voyages] = await Promise.all([fetchQuestBoard(), fetchVoyageBoard()]);
  return <QuestsScreen board={board} voyages={voyages} />;
}
