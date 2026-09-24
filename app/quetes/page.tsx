import { redirect } from "next/navigation";

/**
 * Ancienne route des quêtes. Quêtes et Traversées vivent désormais dans
 * l'onglet « Quêtes » du profil : un lien gardé en favori y mène.
 */
export default function QuetesPage() {
  redirect("/profil?onglet=quetes");
}
