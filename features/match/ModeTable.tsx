"use client";

import { useState, type ReactNode } from "react";
import { Lantern } from "@/features/shell/Lantern";
import styles from "@/features/match/ModeTable.module.css";

const ASSETS = "/assets/play/mode";

export type TableMode = "online" | "amical" | "bot";

/**
 * Les trois cartes de la table, dans l'ordre de la maquette. Titre et badge
 * sont PEINTS sur l'image : le texte ici est pour les lecteurs d'écran.
 * « Match amical » (globe, « aucun gain ») est la partie en ligne contre un
 * ami choisi — le local à deux sur un même écran n'a plus de carte.
 */
const MODES: readonly { id: TableMode; image: string; label: string; description: string }[] = [
  {
    id: "online",
    image: "carte-en-ligne",
    label: "En ligne",
    description: "Recherche rapide contre un adversaire tiré au hasard. XP et quêtes.",
  },
  {
    id: "amical",
    image: "carte-match-amical",
    label: "Match amical",
    description: "Défie un ami, ou partage un code de partie. Pour le plaisir : aucun gain.",
  },
  {
    id: "bot",
    image: "carte-bot",
    label: "Contre un bot",
    description: "Trois niveaux de difficulté. Le deck adverse est tiré au sort au lancement. Rapporte de l'XP.",
  },
];

/**
 * JOUER — LA TABLE DU CHOIX DU MODE (maquette du 28/09/2026) : sur la
 * table de bois, le bandeau « Choisis un mode » et trois cartes épinglées,
 * une par mode. La lanterne, en haut à gauche, éclaire la table ; on la
 * souffle d'un clic, la pièce s'assombrit, un autre clic la rallume.
 *
 * Scène à ratio fixe (16 / 9) : positions en %, relevées sur la maquette.
 * La description des cartes (peinte sur l'image) s'affiche aussi SOUS
 * chacune, lisible et traduisible.
 */
export function ModeTable({ onChoose, notices }: { onChoose: (mode: TableMode) => void; notices?: ReactNode }) {
  const [lit, setLit] = useState(true);
  return (
    <div className={styles.page} data-lit={lit || undefined}>
      <span className={styles.light} aria-hidden />
      {/* Collé au coin bas gauche de l'ÉCRAN, pas de la scène : son ombre ne laisse pas de bande. */}
      {/* eslint-disable-next-line @next/next/no-img-element -- décor local */}
      <img className={styles.decor} src={`${ASSETS}/decor-bas-gauche.webp`} alt="" draggable={false} />
      <div className={styles.stage}>

        <h1 className={styles.banner}>
          {/* eslint-disable-next-line @next/next/no-img-element -- bandeau peint */}
          <img src={`${ASSETS}/bandeau-choisis-un-mode.webp`} alt="" draggable={false} />
          <span className={styles.srOnly}>Choisis un mode — choisis comment tu veux jouer, puis ton deck.</span>
        </h1>

        <ul className={styles.cards} aria-label="Modes de jeu">
          {MODES.map((mode, index) => (
            <li key={mode.id} className={styles.card} style={{ "--index": index } as React.CSSProperties}>
              <button type="button" className={styles.cardButton} onClick={() => onChoose(mode.id)} aria-label={`${mode.label} — ${mode.description}`}>
                {/* eslint-disable-next-line @next/next/no-img-element -- carte peinte */}
                <img src={`${ASSETS}/${mode.image}.webp`} alt="" draggable={false} />
              </button>
            </li>
          ))}
        </ul>

        {notices && <div className={styles.notices}>{notices}</div>}

        <Lantern
          lit={lit}
          onToggle={() => setLit((value) => !value)}
          litSrc={`${ASSETS}/lanterne.webp`}
          outSrc={`${ASSETS}/lanterne-eteinte.webp`}
          className={styles.lantern}
        />
      </div>
    </div>
  );
}
