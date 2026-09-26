import { CardShelfProvider } from "@/features/collection/shelf/CardShelfProvider";
import { NotebookWall } from "@/features/collection/shelf/NotebookWall";
import { getSessionUser } from "@/lib/supabase/sessionUser";

/** Le mur des carnets : tous les carnets du joueur en tuiles, ses Favoris en tête. */
export default async function NotebooksPage() {
  const user = await getSessionUser();
  return (
    <CardShelfProvider initialShelf={user ? undefined : null}>
      <NotebookWall isSignedIn={Boolean(user)} />
    </CardShelfProvider>
  );
}
