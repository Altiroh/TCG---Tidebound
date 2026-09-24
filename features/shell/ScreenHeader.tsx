"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import styles from "@/features/shell/ScreenShell.module.css";
import { NavigationTab } from "@/features/shell/NavigationTab";
import { HeaderPlayer } from "@/features/shell/HeaderPlayer";
import { navigateWithTransition } from "@/features/shell/pageTransitionBus";
import { playButtonClick } from "@/lib/sound";

export type ScreenSection = "collection" | "collectables" | "decks" | "market" | "boosters" | "quetes" | "partie";

/**
 * Les onglets de la COLLECTION, dans l'ordre de lecture.
 *
 * Ce bandeau appartient à la collection du joueur — ce qu'il possède et ce
 * qu'il en fait — et à rien d'autre. Deux destinations en sont donc
 * volontairement absentes :
 *
 *   - JOUER (`/partie`) : lancer une partie est un autre moment du jeu, on
 *     y va depuis le menu principal ;
 *   - MARKET (`/market`) : dépenser des Tides est une boutique, pas une
 *     vitrine de sa propre collection.
 *
 * Les deux se rejoignent depuis le menu principal (le coffret) et depuis
 * les liens croisés du bas de page ; ils se rendent avec `nav="minimal"`,
 * dont le bandeau n'a plus que le retour au menu et le logo.
 */
/*
 * Onglets du bandeau. « Quêtes » n'y est plus : l'accès se fait par le
 * tiroir du bloc de compte, à droite, qui montre la même chose sans quitter
 * l'écran en cours. La route `/quetes` reste servie — elle porte ce que le
 * tiroir laisse de côté (filtres, échéances, remplacements) et le tiroir y
 * mène.
 */
const TABS: Array<{ section: ScreenSection; label: string; href: string }> = [
  // « Cartes » plutôt que « Collection » : la collection du joueur, c'est
  // aussi ses decks et ses boosters. Cet onglet-ci ne montre que les
  // cartes, autant que son nom le dise.
  { section: "collection", label: "Cartes", href: "/collection" },
  // Ce que la collection compte d'autre que des cartes : dos de carte,
  // cadres de navire… Rangé à côté des cartes, comme une autre étagère.
  { section: "collectables", label: "Collectables", href: "/collectables" },
  { section: "decks", label: "Decks", href: "/decks" },
  { section: "boosters", label: "Mes boosters", href: "/boosters" },
];

export interface ScreenHeaderProps {
  /** Section en cours — reçoit le filet turquoise et le halo. `null` : aucun onglet actif (authentification). */
  active: ScreenSection | null;
  /** Contrôles propres à l'écran, posés à droite de la navigation (recherche…). */
  actions?: ReactNode;
  /**
   * Filtre de navigation de l'écran : rendre `true` pour DÉCLINER le
   * déplacement (l'écran s'en charge lui-même — typiquement un dialogue de
   * modifications non sauvegardées). Toute la navigation du bandeau passe
   * par là, logo compris.
   */
  onNavigate?: (href: string) => boolean;
  /**
   * `collection` (défaut) : les onglets de la collection. `minimal` : le
   * retour au menu et le logo, rien d'autre — pour les écrans qui ne font
   * pas partie de la collection (Jouer, Market). `home` : le menu
   * principal — les onglets, sans retour ni logo (le coffret porte déjà
   * l'enseigne, et il n'y a nulle part où revenir). `menu` : RIEN que le
   * compte et les options, à droite — pour un menu qui porte lui-même sa
   * navigation (la carte marine : ses parchemins SONT les onglets, une
   * barre par-dessus ne ferait que les doubler).
   */
  nav?: "collection" | "minimal" | "home" | "menu";
}

/**
 * Bandeau du haut, commun à tous les écrans hors plateau (`GameScreen`) :
 * fin, sans fond propre — il se fond dans le décor de l'écran.
 *
 * TROIS ZONES, toutes dans le flux : à gauche le retour au menu et les
 * onglets, au centre le logo, à droite le profil du joueur et les
 * options. Le logo a d'abord été posé hors du flux pour être centré sur
 * l'écran — il passait alors PAR-DESSUS le dernier onglet. Les deux
 * colonnes latérales partagent désormais la place restante à parts égales
 * (`1fr` chacune), ce qui centre le logo sans le superposer à rien.
 *
 * Le logo déborde sous le filet du bandeau, comme une enseigne accrochée
 * au-dessus de l'écran plutôt qu'un élément de barre d'outils.
 */
export function ScreenHeader({ active, actions, onNavigate, nav = "collection" }: ScreenHeaderProps) {
  const router = useRouter();
  const tabs = nav === "collection" || nav === "home" ? TABS : [];

  // Onglets et retour au menu passent par `router.push`, que Next ne
  // précharge pas : chaque clic attendait alors le rendu serveur complet de
  // l'écran visé. Préchargés, ils affichent au moins son écran de
  // chargement (`loading.tsx`) dès le clic.
  useEffect(() => {
    for (const href of ["/", "/profil", ...TABS.map((tab) => tab.href)]) router.prefetch(href);
  }, [router]);

  /** Un seul chemin pour tout déplacement du bandeau : l'écran peut le décliner. */
  function go(href: string) {
    if (onNavigate?.(href)) return;
    if (!navigateWithTransition(href)) router.push(href);
  }

  return (
    <header className={styles.header} data-nav={nav}>
      <div className={styles.headerLeft}>
        {/* Retour au menu : une flèche, sans libellé. Le geste est assez
            courant dans un client de jeu pour se passer du mot, et le mot
            prenait la place d'un onglet. */}
        {(nav === "collection" || nav === "minimal") && (
          <button
            type="button"
            className={styles.backButton}
            aria-label="Retour au menu"
            title="Retour au menu"
            onClick={() => {
              playButtonClick();
              go("/");
            }}
          >
            <svg viewBox="0 0 24 24" fill="none" width="20" height="20" aria-hidden>
              <path d="M19 12H5M5 12l6-6M5 12l6 6" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        )}

        {tabs.map((tab) => (
          <NavigationTab
            key={tab.section}
            active={active === tab.section}
            onClick={() => {
              if (active !== tab.section) go(tab.href);
            }}
          >
            {tab.label}
          </NavigationTab>
        ))}
      </div>

      <div className={styles.headerBrand}>
        {(nav === "collection" || nav === "minimal") && (
          <Link
            href="/"
            className={styles.brand}
            aria-label="Retour au menu"
            // La navigation passe par `go`, qui consulte d'abord `onNavigate`
            // (modifications non enregistrées) : l'ombre ne doit pas la court-circuiter.
            data-no-transition
            onClick={(event) => {
              if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
              event.preventDefault();
              go("/");
            }}
          >
            <Image
              src="/assets/menu/logo/tidebound-logo.webp"
              alt="Tidebound"
              width={1600}
              height={631}
              // Affiché à 62 px de haut au plus (≈ 160 px de large) : sans
              // `sizes`, Next servait la source entière (1600 px) à chaque écran.
              sizes="160px"
              priority
              className={styles.brandLogo}
            />
          </Link>
        )}
      </div>

      {/* Actions de l'écran + profil du joueur (avatar, pseudo, niveau,
          Tides) + options : la zone du compte, toujours au même endroit. */}
      <div className={styles.headerRight}>
        {actions}
        <HeaderPlayer />
      </div>
    </header>
  );
}
