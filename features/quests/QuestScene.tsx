"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Lantern } from "@/features/shell/Lantern";
import styles from "@/features/quests/Quests.module.css";

/** Assets de l'écran Quêtes (maquette du 29/09/2026). */
export const QUEST_SCREEN_ASSETS = "/assets/quests/ecran";

/**
 * L'ÉCRAN QUÊTES — LA TABLE DU PONT (maquette du 29/09/2026) : sur le
 * plancher sous les hublots (décor `pont` de la coquille), la carte de la
 * Traversée, les onglets de catégorie pendus à leurs clous et la planche
 * des deux registres. Le kraken et ses pièces à gauche, la tasse, le
 * couteau et le poisson à droite ; la lanterne posée en haut à gauche
 * éclaire la table — un clic la souffle, la pièce s'assombrit, un autre
 * la rallume (même geste que l'écran Jouer et les Mécènes).
 *
 * Ce qui RESTE d'un état à l'autre (attente, journal, erreur) vit ici :
 * décor et lanterne ne se remontent pas quand le journal arrive.
 *
 * Le contenu (`children`) tient dans une colonne dont la largeur suit la
 * hauteur disponible (tout tient sans défiler sur un écran 16 / 9) ; les
 * cotes de la maquette y sont reprises en unités de colonne (`--u`, un
 * pixel de maquette pour une colonne de 1250). Plus bas qu'un téléphone
 * couché, la colonne prend la largeur et défile.
 */
export function QuestScene({ children }: { children: ReactNode }) {
  const [lit, setLit] = useState(true);
  return (
    <div className={styles.scene} data-lit={lit || undefined}>
      <span className={styles.light} aria-hidden />
      {/* eslint-disable-next-line @next/next/no-img-element -- décor local */}
      <img className={styles.decorLeft} src={`${QUEST_SCREEN_ASSETS}/decor-gauche.webp`} alt="" draggable={false} />
      {/* eslint-disable-next-line @next/next/no-img-element -- décor local */}
      <img className={styles.decorRight} src={`${QUEST_SCREEN_ASSETS}/decor-droite.webp`} alt="" draggable={false} />
      <span className={styles.lanternPool} aria-hidden />
      <Lantern
        standing
        lit={lit}
        onToggle={() => setLit((value) => !value)}
        litSrc={`${QUEST_SCREEN_ASSETS}/lanterne.webp`}
        outSrc={`${QUEST_SCREEN_ASSETS}/lanterne-eteinte.webp`}
        className={styles.lantern}
      />
      <div className={styles.viewport}>
        <div className={styles.column}>{children}</div>
      </div>
    </div>
  );
}

export interface SceneNotice {
  tone: "success" | "error";
  text: string;
}

/**
 * Le mot laissé sur la table après une réclamation ou un échec : un billet
 * de parchemin en bas de la colonne, qui s'efface de lui-même.
 */
export function SceneToast({ notice, onDone }: { notice: SceneNotice | null; onDone: () => void }) {
  useEffect(() => {
    if (!notice) return undefined;
    const id = window.setTimeout(onDone, notice.tone === "error" ? 6000 : 3600);
    return () => window.clearTimeout(id);
  }, [notice, onDone]);
  if (!notice) return null;
  return (
    <p key={notice.text} className={styles.toast} data-tone={notice.tone} role={notice.tone === "error" ? "alert" : "status"}>
      {notice.text}
    </p>
  );
}
