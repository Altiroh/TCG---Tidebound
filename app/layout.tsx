import type { Metadata, Viewport } from "next";
import { cardBodyFont, cardTitleFont, uiFont } from "@/lib/fonts";
import { ServiceWorkerRegister } from "@/components/ServiceWorkerRegister";
import { OrientationGate } from "@/features/shell/OrientationGate";
import { PinchZoomGuard } from "@/features/shell/PinchZoomGuard";
import { CardBackProvider } from "@/features/cosmetics/CardBackProvider";
import { ShipFrameProvider } from "@/features/cosmetics/ShipFrameProvider";
import "./tokens.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "Tidebound",
  description: "Un jeu de cartes à collectionner multijoueur, jouable dans le navigateur.",
  manifest: "/manifest.webmanifest",
  applicationName: "Tidebound",
  // Installée sur l'écran d'accueil iOS, l'app se lance en plein écran sans
  // la barre de Safari. `black-translucent` fait passer le décor SOUS la
  // barre d'état : c'est ce qui rend les `env(safe-area-inset-*)` utiles
  // (cf. `app/globals.css`), sans quoi iOS réserve lui-même la bande et le
  // haut de l'écran tombe en noir.
  appleWebApp: { capable: true, title: "Tidebound", statusBarStyle: "black-translucent" },
  // Toutes fabriquées par `npm run icons` depuis l'icône de marque
  // (`public/assets/menu/logo/icon-tidebound.webp`).
  icons: {
    icon: [
      // Onglet : les petites tailles d'abord, un navigateur prend la plus
      // proche de ce qu'il affiche. `/favicon.ico` reste servi à la racine
      // pour les clients qui le demandent sans lire ces balises.
      { url: "/icons/favicon-16.png", sizes: "16x16", type: "image/png" },
      { url: "/icons/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/icons/favicon-48.png", sizes: "48x48", type: "image/png" },
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    shortcut: [{ url: "/favicon.ico", sizes: "any" }],
    // iOS ne lit pas le manifeste pour l'icône d'accueil, et n'accepte pas
    // le WebP ici : ce PNG est la seule icône qu'il utilisera.
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  // Pas de `format-detection` par défaut sur iOS : sans ça, Safari
  // transforme un identifiant de partie en lien téléphonique.
  formatDetection: { telephone: false, date: false, address: false, email: false },
};

/**
 * `viewportFit: "cover"` s'applique à TOUT le site : c'est la seule façon
 * pour `env(safe-area-inset-*)` de renvoyer autre chose que 0 sur un
 * iPhone à encoche ou à Dynamic Island. Les écrans compensent ensuite avec
 * les variables `--tb-safe-*` (`app/globals.css`), posées sur la coquille
 * partagée : rien ne passe sous l'encoche ni sous la barre de gestes.
 *
 * ÉCHELLE VERROUILLÉE (décision du 18/09, retour de test iOS) : un
 * pincement involontaire décalait toute l'interface sans que le joueur
 * comprenne ce qui venait d'arriver. Le jeu tient déjà dans la fenêtre
 * (paysage imposé, tailles en `clamp`, hauteurs en `dvh`) : le zoom n'y
 * ajoutait qu'un décalage. Ces deux clés suffisent à Android ; iOS ignore
 * `user-scalable=no` depuis iOS 10, d'où `PinchZoomGuard`
 * (`features/shell/PinchZoomGuard.tsx`) et le `touch-action` de
 * `app/globals.css` — les trois verrous se complètent, aucun ne suffit.
 */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: "#050e1a",
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
            {/* Paysage imposé sur mobile : le plateau est dessiné en
                largeur. Monté ici, donc valable sur toutes les routes. */}
            <OrientationGate />
            {/* Pincement neutralisé là où le viewport ne suffit pas (iOS). */}
            <PinchZoomGuard />
          </ShipFrameProvider>
        </CardBackProvider>
      </body>
    </html>
  );
}
