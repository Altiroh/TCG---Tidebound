"use client";

import { useRouter } from "next/navigation";
import { AuthScreen } from "@/components/auth/AuthScreen";
import { SignupForm } from "@/components/auth/SignupForm";

export default function InscriptionPage() {
  const router = useRouter();

  return (
    <AuthScreen>
      <SignupForm onSuccess={() => router.push("/")} onSwitchToLogin={() => router.push("/connexion")} />
    </AuthScreen>
  );
}
