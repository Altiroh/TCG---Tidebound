import { redirect } from "next/navigation";

/**
 * Ancienne route du labo du Pont du Capitaine. Depuis le 09/10/2026, le
 * Pont est le seul plateau : `/game/board-preview` le monte directement.
 */
export default function GamePontPreviewRoute() {
  redirect("/game/board-preview");
}
