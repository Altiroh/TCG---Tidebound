"use client";

import { useRouter } from "next/navigation";
import { AuthScreen } from "@/components/auth/AuthScreen";
import { ForgotPasswordForm } from "@/components/auth/ForgotPasswordForm";

export default function MotDePasseOubliePage() {
  const router = useRouter();

  return (
    <AuthScreen>
      <ForgotPasswordForm onBackToLogin={() => router.push("/connexion")} />
    </AuthScreen>
  );
}
