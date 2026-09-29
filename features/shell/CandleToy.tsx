"use client";

import Link from "next/link";
import { useCallback, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { discoverSecret } from "@/features/cosmetics/collectablesActions";
import { ScreenToast, type ScreenToastMessage } from "@/features/shell/ScreenToast";
import styles from "@/features/shell/CandleToy.module.css";

/**
 * LA BOUGIE QU'ON SOUFFLE — un jouet du décor, et un secret.
 *
 * Même famille que le café qui fait des ondes, les pièces qui sautent et
 * les groseilles qu'on écrase (`components/menu/*`) : la bougie luit au
 * survol ; un clic la souffle (la flamme se couche et s'éteint, un filet de
 * fumée monte de la mèche), un autre la rallume. Toujours rejouable.
 *
 * La PREMIÈRE fois qu'on la souffle, elle débloque un Collectable caché
 * (`{ kind: "secret", secret: "bougie" }`, cf. `game/cosmetics/unlock.ts`).
 * Deux fois la même bougie : ce composant pour l'accessoire posé sur les
 * écrans Collection et Decks, et la bougie PEINTE dans le fond du menu, qui
 * n'a pas d'image à elle (`components/menu/MenuBougie.tsx`). Le secret,
 * lui, est commun : `useCandleSecret`.
 */

const BOUGIE_SRC = "/assets/ui/accessoires/bougie.webp";

/** La volute qui monte de la mèche : la même que celles du café du menu. */
export const BOUGIE_FUMEE = { src: "/assets/menu/carte/fumee_variante_2.webp", w: 415, h: 424 } as const;

/** Mémoire locale : le secret est déjà trouvé sur ce navigateur. */
const MEMOIRE_SECRET = "tb-secret-bougie";

/**
 * Une seule demande par chargement de page, quel que soit le nombre de
 * bougies à l'écran ou de souffles : le serveur est idempotent, mais rien
 * ne justifie de le solliciter à chaque clic.
 */
let demandeFaite = false;

/**
 * Le secret de la bougie : `reveal()` au premier souffle ; `toast` est la
 * petite annonce à rendre si un Collectable vient d'être accordé.
 */
export function useCandleSecret(): { reveal: () => void; toast: ReactNode } {
  const [message, setMessage] = useState<ScreenToastMessage | null>(null);

  const reveal = useCallback(() => {
    if (demandeFaite) return;
    try {
      if (window.localStorage.getItem(MEMOIRE_SECRET)) return;
    } catch {
      // Stockage indisponible (navigation privée…) : le verrou de page suffit.
    }
    demandeFaite = true;

    discoverSecret("bougie")
      .then((result) => {
        // Retenu seulement quand le serveur a répondu pour un joueur
        // connecté : hors session, le geste doit pouvoir resservir plus tard.
        if (result.ok) {
          try {
            window.localStorage.setItem(MEMOIRE_SECRET, "1");
          } catch {
            // idem : rien à retenir, le serveur reste idempotent.
          }
        } else if (!result.signedOut) {
          // Échec passager : un prochain souffle retentera.
          demandeFaite = false;
        }
        if (result.granted.length === 0) return;
        setMessage({
          id: Date.now(),
          tone: "reward",
          text: (
            <>
              Collectable caché trouvé : <strong>{result.granted.join(", ")}</strong>
            </>
          ),
          action: <Link href="/collectables">Voir →</Link>,
        });
      })
      .catch(() => {
        demandeFaite = false;
      });
  }, []);

  // Rendu dans `body` : l'annonce est `fixed`, et une bougie posée dans un
  // parent transformé la ferait sinon suivre ce parent.
  const toast = message ? createPortal(<ScreenToast message={message} onDismiss={() => setMessage(null)} />, document.body) : null;
  return { reveal, toast };
}

interface CandleToyProps {
  /** Placement et taille, fournis par l'écran hôte. La boîte doit épouser l'image. */
  className?: string;
  /**
   * Les lueurs propres à l'écran hôte (halo porté sur la table…), posées
   * dans la boîte de la bougie. Elles s'éteignent avec la flamme.
   */
  children?: ReactNode;
}

/** L'accessoire `bougie.webp`, jouet et secret. */
export function CandleToy({ className, children }: CandleToyProps) {
  const [soufflee, setSoufflee] = useState(false);
  /** Compte les souffles : remonte la fumée, pour qu'elle reparte à chaque fois. */
  const [souffles, setSouffles] = useState(0);
  const dejaSoufflee = useRef(false);
  const { reveal, toast } = useCandleSecret();

  return (
    <>
      <button
        type="button"
        className={`${styles.toy} ${className ?? ""}`}
        data-soufflee={soufflee ? "true" : "false"}
        aria-pressed={soufflee}
        aria-label={soufflee ? "Rallumer la bougie" : "Souffler la bougie"}
        onClick={() => {
          const next = !soufflee;
          setSoufflee(next);
          if (!next) return;
          setSouffles((n) => n + 1);
          if (!dejaSoufflee.current) {
            dejaSoufflee.current = true;
            reveal();
          }
        }}
      >
        {children && <span className={styles.lights}>{children}</span>}
        {/*
          Deux fois la même image, découpées l'une par l'autre : la bougie
          SANS sa flamme, et la flamme seule par-dessus. Souffler, c'est
          coucher la seconde — la cire, elle, ne bouge pas.
        */}
        {/* eslint-disable @next/next/no-img-element -- décor peint, à sa taille */}
        <img className={styles.body} src={BOUGIE_SRC} alt="" draggable={false} />
        <img className={styles.flame} src={BOUGIE_SRC} alt="" draggable={false} />
        {/* eslint-enable @next/next/no-img-element */}
        <span className={styles.halo} aria-hidden />
        <span className={styles.ember} aria-hidden />
        {soufflee && (
          // eslint-disable-next-line @next/next/no-img-element -- volute décorative
          <img key={souffles} className={styles.smoke} src={BOUGIE_FUMEE.src} alt="" draggable={false} />
        )}
      </button>
      {toast}
    </>
  );
}
