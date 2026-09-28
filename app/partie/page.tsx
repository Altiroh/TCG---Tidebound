import { Suspense } from "react";
import { PRECON_DECKS } from "@/game";
import { listPlayerDeckLists } from "@/app/decks/actions";
import { fetchDeckCatalog } from "@/features/decks/catalogActions";
import { PartieScreen } from "@/features/match/PartieScreen";
import { findResumableMatch, type ResumableMatch } from "@/features/online/actions";
import { fetchSocial } from "@/features/friends/actions";
import { PRESENCE_LABEL } from "@/features/friends/presence";
import { getSessionUser } from "@/lib/supabase/sessionUser";

export default async function PartiePage() {
  // Jouer localement ne demande pas de compte : une config Supabase absente
  // ou une session expirée dégrade simplement vers "non connecté".
  let isSignedIn = false;
  try {
    const user = await getSessionUser();
    isSignedIn = Boolean(user);
  } catch {
    isSignedIn = false;
  }

  const [personalDecks, catalog, resumable, social] = await Promise.all([
    isSignedIn ? listPlayerDeckLists() : [],
    fetchDeckCatalog(),
    isSignedIn ? findResumableMatch() : null,
    // Amis et défis reçus. Sans la migration des amis, simplement vides.
    isSignedIn ? fetchSocial() : null,
  ]);

  /*
   * Decks proposés à l'écran.
   *
   * Hors connexion, la lecture du catalogue ne débloque RIEN : aucun deck
   * n'était sélectionnable, « Lancer la partie » restait grisé, et les deux
   * modes locaux — pourtant annoncés « sans XP », donc sans compte — étaient
   * des impasses. L'intention était écrite juste au-dessus (« jouer
   * localement ne demande pas de compte »), le verrouillage la contredisait.
   *
   * Sans compte, TOUT le rayon est donc ouvert : une partie locale ne
   * persiste rien ni ne rapporte quoi que ce soit, et aucun Jeton n'est
   * dépensé puisqu'il n'y a pas de compte pour en tenir le compte.
   *
   * Avec un compte, seuls les préconstruits réellement débloqués sont
   * jouables — par le choix gratuit ou par un Jeton, la base ne distingue
   * que ça depuis la fusion des deux rayons (22/09/2026).
   */
  const unlockedDeckIds = isSignedIn
    ? catalog.decks.filter((entry) => entry.unlocked).map((entry) => entry.deck.id)
    : PRECON_DECKS.map((deck) => deck.id);

  // `useSearchParams` (essai d'un préconstruit) impose une frontière de
  // suspense : sans elle, Next rend toute la page en client au build.
  return (
    <Suspense>
      <PartieScreen
        isSignedIn={isSignedIn}
        personalDecks={personalDecks}
        unlockedDeckIds={unlockedDeckIds}
        resumable={resumable ? { matchId: resumable.matchId, label: resumableLabel(resumable) } : null}
        friends={(social?.friends ?? []).map((friend) => ({
          userId: friend.userId,
          name: friend.name,
          presenceLabel: PRESENCE_LABEL[friend.presence],
        }))}
        challenges={(social?.challenges ?? []).map((challenge) => ({
          id: challenge.id,
          fromName: challenge.fromName,
          inviteCode: challenge.inviteCode,
        }))}
      />
    </Suspense>
  );
}

/** Ce que la bannière de reprise dit de la partie laissée ouverte. */
function resumableLabel(match: ResumableMatch): string {
  if (match.mode === "bot") return "Ta partie contre le bot est toujours en cours.";
  if (match.mode === "matchmaking") return "Ta partie en ligne est toujours en cours — ton adversaire t'attend.";
  return match.status === "waiting"
    ? "Ton match amical attend toujours ton invité."
    : "Ton match amical est toujours en cours — ton ami t'attend.";
}
