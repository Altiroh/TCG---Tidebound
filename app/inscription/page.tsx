"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { AUTH_LINK_CLASS, AuthGlassPanel } from "@/components/auth/AuthGlassPanel";
import { SignupForm } from "@/components/auth/SignupForm";

export default function InscriptionPage() {
  const router = useRouter();

  return (
    <main
      className="relative flex min-h-screen items-center justify-center overflow-hidden bg-cover bg-center p-4"
      style={{ backgroundImage: "url(/assets/menu/background/menu_background_fixed.png)" }}
    >
      <div className="absolute inset-0 bg-board-background/50" />

      <div className="relative z-10 flex w-full max-w-sm flex-col items-center gap-4">
        <AuthGlassPanel>
          <SignupForm onSuccess={() => router.push("/")} onSwitchToLogin={() => router.push("/connexion")} />
        </AuthGlassPanel>
        <Link href="/" className={`text-sm ${AUTH_LINK_CLASS} hover:underline`}>
          ← Jouer sans compte
        </Link>
      </div>
    </main>
  );
}
