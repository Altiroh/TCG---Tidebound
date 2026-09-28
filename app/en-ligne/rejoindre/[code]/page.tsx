import { redirect } from "next/navigation";

/**
 * Lien d'invitation à un match amical : `/en-ligne/rejoindre/ABC123`.
 *
 * Ouvre l'écran Partie en mode « En ligne », code déjà saisi : l'invité n'a
 * plus qu'à choisir son deck. Le code est réduit aux caractères de
 * l'alphabet des invitations — il repart dans une URL.
 */
export default function RejoindrePage({ params }: { params: { code: string } }) {
  const code = decodeURIComponent(params.code).toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 12);
  redirect(code ? `/partie?mode=en-ligne&code=${code}` : "/partie?mode=en-ligne");
}
