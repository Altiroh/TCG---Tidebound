"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { AuthGlassPanel } from "@/components/auth/AuthGlassPanel";
import { ForgotPasswordForm } from "@/components/auth/ForgotPasswordForm";

export default function MotDePasseOubliePage() {
  const router = useRouter();

  return (
    <main
      className="relative flex min-h-screen items-center justify-center overflow-hidden bg-cover bg-center p-4"
      style={{ backgroundImage: "url(/assets/menu/background/menu_background_fixed.png)" }}
    >
      <div className="absolute inset-0 bg-board-background/50" />

      <div className="relative z-10 flex w-full max-w-sm flex-col items-center gap-4">
        <AuthGlassPanel>
          <ForgotPasswordForm onBackToLogin={() => router.push("/connexion")} />
        </AuthGlassPanel>
        <Link href="/" className="text-sm text-slate-300 hover:text-board-accent hover:underline">
          ← Jouer sans compte
        </Link>
      </div>
    </main>
  );
}
