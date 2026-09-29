"use client";

import { useRef, useState } from "react";
import { BOUGIE_FUMEE, useCandleSecret } from "@/features/shell/CandleToy";
import styles from "@/components/menu/MenuCarte.module.css";

/**
 * LA BOUGIE DU MENU — un jouet de la table, et un secret.
 *
 * Elle est PEINTE dans le fond (`ui/fonds/carte-marine.webp`), devant la
 * lanterne du coin droit : pas d'image à découper, donc tout se joue par
 * calques posés dessus, en pourcentages du fond comme le reste du décor.
 *   - au survol, un halo chaud respire autour de la flamme ;
 *   - au clic, elle est soufflée : un voile dissout la flamme peinte dans
 *     le verre de la lanterne, un autre assombrit la cire, la lumière du
 *     coin droit (`.lumiere::before`) retombe, et un filet de fumée monte
 *     de la mèche ;
 *   - un second clic la rallume.
 *
 * La première fois qu'on la souffle, elle débloque le Collectable caché
 * de la bougie — le même secret que la bougie des écrans Collection et
 * Decks (`useCandleSecret`).
 */
type EtatBougie = "allumee" | "soufflee" | "rallumee";

export function MenuBougie() {
  const [etat, setEtat] = useState<EtatBougie>("allumee");
  /** Compte les souffles : remonte la fumée, pour qu'elle reparte à chaque fois. */
  const [souffles, setSouffles] = useState(0);
  const dejaSoufflee = useRef(false);
  const { reveal, toast } = useCandleSecret();
  const soufflee = etat === "soufflee";

  return (
    <>
      <span className={styles.bougieOmbre} data-bougie={etat} aria-hidden />
      <span className={styles.bougieEteinte} data-bougie={etat} aria-hidden />
      <span className={styles.bougieBraise} data-bougie={etat} aria-hidden key={`braise-${souffles}`} />
      {soufflee && (
        // eslint-disable-next-line @next/next/no-img-element -- volute décorative
        <img key={souffles} className={styles.bougieFumee} src={BOUGIE_FUMEE.src} alt="" draggable={false} />
      )}
      <span className={styles.bougieHalo} data-bougie={etat} aria-hidden />
      <button
        type="button"
        className={styles.bougieClic}
        data-bougie={etat}
        aria-pressed={soufflee}
        aria-label={soufflee ? "Rallumer la bougie" : "Souffler la bougie"}
        onClick={() => {
          if (soufflee) {
            setEtat("rallumee");
            return;
          }
          setEtat("soufflee");
          setSouffles((n) => n + 1);
          if (!dejaSoufflee.current) {
            dejaSoufflee.current = true;
            reveal();
          }
        }}
      />
      {toast}
    </>
  );
}
