import { fetchProfile } from "@/features/progression/profileActions";
import { ProfileScreen } from "@/features/progression/ProfileScreen";

/**
 * Profil joueur — niveau, paliers, connexions, exploits
 * (Notion « Progression joueur » §12).
 *
 * Rendu dynamiquement : la progression change à chaque partie, et un profil
 * mis en cache afficherait un niveau périmé juste après une victoire.
 */
export const dynamic = "force-dynamic";

export default async function ProfilPage() {
  const profile = await fetchProfile();
  return <ProfileScreen profile={profile} />;
}
