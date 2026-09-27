import type { Metadata } from "next";
import { cardBodyFont, cardTitleFont, uiFont } from "@/lib/fonts";
import { ServiceWorkerRegister } from "@/components/ServiceWorkerRegister";
import { CardBackProvider } from "@/features/cosmetics/CardBackProvider";
import { ShipFrameProvider } from "@/features/cosmetics/ShipFrameProvider";
import "./tokens.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "Tidebound",
  description: "Un jeu de cartes à collectionner multijoueur, jouable dans le navigateur.",
  manifest: "/manifest.webmanifest",
  // Icône de l'application. Le favicon (`app/favicon.ico`) est détecté par
  // convention ; l'icône iOS est aplatie sur le fond de l'app, car l'écran
  // d'accueil remplit la transparence en noir.
  icons: {
    icon: [{ url: "/icons/tidebound-icon-192.png", sizes: "192x192", type: "image/png" }],
    apple: [{ url: "/icons/tidebound-icon-apple.png", sizes: "180x180", type: "image/png" }],
  },
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
        {/* Cosmétiques équipés — dos de carte et cadre de Navire. Montés
            ici, et SANS lecture serveur : les fournisseurs s'hydratent depuis
            le miroir local, ce qui garde cette mise en page statique — une
            requête Supabase ici rendrait tout le site dynamique pour un
            cosmétique. L'autorité reste la base, relue et réalignée à chaque
            passage par Collectables. */}
        <CardBackProvider>
          <ShipFrameProvider>
            {children}
            <ServiceWorkerRegister />
          </ShipFrameProvider>
        </CardBackProvider>
      </body>
    </html>
  );
}
