import { AuthGlassPanel } from "@/components/auth/AuthGlassPanel";
import { ResetPasswordForm } from "@/components/auth/ResetPasswordForm";

/** Atterrissage du lien "mot de passe oublié" (via `/auth/callback?next=/reinitialiser-mot-de-passe`). */
export default function ReinitialiserMotDePassePage() {
  return (
    <main
      className="relative flex min-h-screen items-center justify-center overflow-hidden bg-cover bg-center p-4"
      style={{ backgroundImage: "url(/assets/menu/background/menu_background_fixed.png)" }}
    >
      <div className="absolute inset-0 bg-board-background/50" />

      <div className="relative z-10 w-full max-w-sm">
        <AuthGlassPanel>
          <ResetPasswordForm />
        </AuthGlassPanel>
      </div>
    </main>
  );
}
