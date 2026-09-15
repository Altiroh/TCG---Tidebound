import type { Metadata } from "next";
import { cardBodyFont, cardTitleFont, uiFont } from "@/lib/fonts";
import { ServiceWorkerRegister } from "@/components/ServiceWorkerRegister";
import { CardBackProvider } from "@/features/cosmetics/CardBackProvider";
import "./globals.css";

export const metadata: Metadata = {
  title: "Tidebound",
  description: "Un jeu de cartes à collectionner multijoueur, jouable dans le navigateur.",
  manifest: "/manifest.webmanifest",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="fr"
      className={`${cardTitleFont.variable} ${cardBodyFont.variable} ${uiFont.variable}`}
      // `--font-menu` : alias de la police de titre (`lib/fonts.ts`), sans seconde déclaration à télécharger.
      style={{ ["--font-menu" as string]: `var(--font-card-title)` }}
    >
      <body>
        {/* Dos de carte équipé. Monté ici, et SANS lecture serveur : le
            fournisseur s'hydrate depuis le miroir local, ce qui garde cette
            mise en page statique — une requête Supabase ici rendrait tout le
            site dynamique pour un cosmétique. L'autorité reste la base, relue
            et réalignée à chaque passage par le profil. */}
        <CardBackProvider>
          {children}
          <ServiceWorkerRegister />
        </CardBackProvider>
      </body>
    </html>
  );
}
