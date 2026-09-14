import { AuthScreen } from "@/components/auth/AuthScreen";
import { ResetPasswordForm } from "@/components/auth/ResetPasswordForm";

/** Atterrissage du lien "mot de passe oublié" (via `/auth/callback?next=/reinitialiser-mot-de-passe`). */
export default function ReinitialiserMotDePassePage() {
  return (
    <AuthScreen escape={null}>
      <ResetPasswordForm />
    </AuthScreen>
  );
}
