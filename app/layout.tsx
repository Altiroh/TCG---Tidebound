import type { Metadata } from "next";
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
    <html lang="fr">
      <body>{children}</body>
    </html>
  );
}
