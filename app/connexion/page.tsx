"use client";

import { useRouter } from "next/navigation";
import { AuthScreen } from "@/components/auth/AuthScreen";
import { LoginForm } from "@/components/auth/LoginForm";
import { currentSearch, redirectTarget } from "@/components/auth/redirectTarget";

export default function ConnexionPage() {
  const router = useRouter();

  return (
    <AuthScreen>
      <LoginForm
        onSuccess={() => {
          // Retour à la page demandée ; `refresh` fait relire la nouvelle session aux pages serveur.
          router.replace(redirectTarget());
          router.refresh();
        }}
        onForgotPassword={() => router.push("/connexion/mot-de-passe-oublie")}
        onSwitchToSignup={() => router.push(`/inscription${currentSearch()}`)}
      />
    </AuthScreen>
  );
}
