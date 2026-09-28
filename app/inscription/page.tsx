"use client";

import { useRouter } from "next/navigation";
import { AuthScreen } from "@/components/auth/AuthScreen";
import { SignupForm } from "@/components/auth/SignupForm";
import { currentSearch, redirectTarget } from "@/components/auth/redirectTarget";

export default function InscriptionPage() {
  const router = useRouter();

  return (
    <AuthScreen>
      <SignupForm
        onSuccess={() => {
          router.replace(redirectTarget());
          router.refresh();
        }}
        onSwitchToLogin={() => router.push(`/connexion${currentSearch()}`)}
      />
    </AuthScreen>
  );
}
