"use client";

import { useRouter } from "next/navigation";
import { AuthScreen } from "@/components/auth/AuthScreen";
import { LoginForm } from "@/components/auth/LoginForm";

export default function ConnexionPage() {
  const router = useRouter();

  return (
    <AuthScreen>
      <LoginForm
        onSuccess={() => router.push("/")}
        onForgotPassword={() => router.push("/connexion/mot-de-passe-oublie")}
        onSwitchToSignup={() => router.push("/inscription")}
      />
    </AuthScreen>
  );
}
