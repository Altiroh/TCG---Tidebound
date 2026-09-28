import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { safeInternalPath } from "@/lib/safeRedirect";

/**
 * Cible de redirection commune à tous les emails d'auth Supabase (confirmation
 * d'inscription, réinitialisation de mot de passe) : échange le `code` PKCE
 * contre une session, puis redirige vers `next` (par défaut le menu). La
 * réinitialisation de mot de passe passe `next=/reinitialiser-mot-de-passe`
 * pour atterrir directement sur le formulaire de nouveau mot de passe une
 * fois la session (temporaire, de type "recovery") posée.
 *
 * `next` ne peut désigner qu'une page du site (`safeInternalPath`) : ce
 * lien, servi par notre domaine, ne doit jamais renvoyer ailleurs.
 */
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const next = safeInternalPath(request.nextUrl.searchParams.get("next"));

  if (code) {
    const supabase = createSupabaseServerClient();
    await supabase.auth.exchangeCodeForSession(code);
  }

  return NextResponse.redirect(new URL(next, request.nextUrl.origin));
}
