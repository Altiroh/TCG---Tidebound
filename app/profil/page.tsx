import { fetchProfile } from "@/features/progression/profileActions";
import { ProfileScreen } from "@/features/progression/ProfileScreen";
import { parseProfileTab } from "@/features/progression/profileTabs";

/**
 * Profil joueur — niveau, paliers, connexions, quêtes et Traversées,
 * exploits (Notion « Progression joueur » §12). `?onglet=quetes` ouvre
 * directement un onglet.
 *
 * Rendu dynamiquement : la progression change à chaque partie, et un profil
 * mis en cache afficherait un niveau périmé juste après une victoire.
 */
export const dynamic = "force-dynamic";

export default async function ProfilPage({ searchParams }: { searchParams: { onglet?: string | string[] } }) {
  const profile = await fetchProfile();
  return <ProfileScreen profile={profile} initialTab={parseProfileTab(searchParams.onglet)} />;
}
