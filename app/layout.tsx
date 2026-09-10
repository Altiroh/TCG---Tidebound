import type { Metadata } from "next";
import { cardBodyFont, cardTitleFont, menuFont } from "@/lib/fonts";
import { ServiceWorkerRegister } from "@/components/ServiceWorkerRegister";
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
    <html lang="fr" className={`${cardTitleFont.variable} ${cardBodyFont.variable} ${menuFont.variable}`}>
      <body>
        {children}
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
