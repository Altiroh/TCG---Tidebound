import { Suspense } from "react";
import { BORROWED_DECKS } from "@/game";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { listPlayerDeckLists } from "@/app/decks/actions";
import { fetchDeckCatalog } from "@/features/decks/catalogActions";
import { PartieScreen } from "@/features/match/PartieScreen";

export default async function PartiePage() {
  // Jouer localement ne demande pas de compte : une config Supabase absente
  // ou une session expirée dégrade simplement vers "non connecté".
  let isSignedIn = false;
  try {
    const supabase = createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    isSignedIn = Boolean(user);
  } catch {
    isSignedIn = false;
  }

  const [personalDecks, catalog] = await Promise.all([isSignedIn ? listPlayerDeckLists() : [], fetchDeckCatalog()]);

  /*
   * Decks proposés à l'écran.
   *
   * Hors connexion, la lecture du catalogue ne débloque RIEN : aucun deck
   * n'était sélectionnable, « Lancer la partie » restait grisé, et les deux
   * modes locaux — pourtant annoncés « sans XP », donc sans compte — étaient
   * des impasses. L'intention était écrite juste au-dessus (« jouer
   * localement ne demande pas de compte »), le verrouillage la contredisait.
   *
   * Sans compte, les decks d'EMPRUNT sont donc ouverts : ce sont les decks
   * d'entrée, gratuits par définition, et une partie locale ne persiste rien
   * ni ne rapporte quoi que ce soit. Les préconstruits, eux, restent
   * verrouillés — ils coûtent un Jeton, et un Jeton demande un compte.
   */
  const unlockedDeckIds = isSignedIn
    ? [...catalog.borrowed, ...catalog.precon].filter((entry) => entry.unlocked).map((entry) => entry.deck.id)
    : BORROWED_DECKS.map((deck) => deck.id);

  // `useSearchParams` (essai d'un préconstruit) impose une frontière de
  // suspense : sans elle, Next rend toute la page en client au build.
  return (
    <Suspense>
      <PartieScreen isSignedIn={isSignedIn} personalDecks={personalDecks} unlockedDeckIds={unlockedDeckIds} />
    </Suspense>
  );
}
