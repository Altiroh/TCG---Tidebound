import { redirect } from "next/navigation";

/**
 * Ancienne entrée du jeu en ligne. Le mode « En ligne » vit désormais dans
 * l'écran Partie, avec le même choix de deck que les autres modes.
 */
export default function EnLignePage() {
  redirect("/partie?mode=en-ligne");
}
