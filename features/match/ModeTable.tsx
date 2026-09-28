"use client";

import { useState, type ReactNode } from "react";
import { Lantern } from "@/features/shell/Lantern";
import { TableCritter } from "@/features/shell/TableCritter";
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
  // Les cartes s'en vont avant que l'écran suivant n'arrive sur la même table.
  const [leaving, setLeaving] = useState<TableMode | null>(null);
  function choose(mode: TableMode) {
    if (leaving) return;
    setLeaving(mode);
    window.setTimeout(() => onChoose(mode), prefersReducedMotion() ? 0 : LEAVE_MS);
  }
  return (
    <div className={styles.modeScene} data-leaving={leaving ?? undefined}>
      <h1 className={styles.banner}>
        {/* eslint-disable-next-line @next/next/no-img-element -- bandeau peint */}
        <img src={`${ASSETS}/bandeau-choisis-un-mode.webp`} alt="" draggable={false} />
        <span className={styles.srOnly}>Choisis un mode — choisis comment tu veux jouer, puis ton deck.</span>
      </h1>

      <ul className={styles.cards} aria-label="Modes de jeu">
        {MODES.map((mode, index) => (
          <li
            key={mode.id}
            className={styles.card}
            data-chosen={leaving === mode.id || undefined}
            style={{ "--index": index, "--card-art": `url("${ASSETS}/${mode.image}.webp")` } as React.CSSProperties}
          >
            <button type="button" className={styles.cardButton} onClick={() => choose(mode.id)} aria-label={`${mode.label} — ${mode.description}`}>
              {/* eslint-disable-next-line @next/next/no-img-element -- carte peinte */}
              <img src={`${ASSETS}/${mode.image}.webp`} alt="" draggable={false} />
            </button>
          </li>
        ))}
      </ul>

      {notices && <div className={styles.notices}>{notices}</div>}
    </div>
  );
}

/** Durée du départ des éléments d'un écran de la table (`ModeTable.module.css`, `leave`). */
export const LEAVE_MS = 380;

export function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

/**
 * LA TABLE DE L'ÉCRAN JOUER : le fond de bois (décor `table` de la
 * coquille), le décor du coin, et la lanterne qu'on souffle — tout ce qui
 * RESTE quand on passe d'une étape à l'autre. Les éléments de chaque étape
 * (`children`) partent et arrivent par-dessus, sur la scène à ratio fixe.
 */
export function PlayTable({ children }: { children: ReactNode }) {
  const [lit, setLit] = useState(true);
  return (
    <div className={styles.page} data-lit={lit || undefined}>
      <span className={styles.light} aria-hidden />
      {/* Collé au coin bas gauche de l'ÉCRAN, pas de la scène : son ombre ne laisse pas de bande. */}
      {/* eslint-disable-next-line @next/next/no-img-element -- décor local */}
      <img className={styles.decor} src={`${ASSETS}/decor-bas-gauche.webp`} alt="" draggable={false} />
      {/* De temps en temps, la petite bête traverse la table — SOUS les cartes et les feuilles. */}
      <TableCritter behind />
      <div className={styles.stage}>{children}</div>
      {/* Hors de la scène : grande, elle déborde en haut à gauche. POSÉE sur la
          table : son ombre de contact et la flaque de lumière qu'elle jette
          sur le bois l'y ancrent (`lanternPool`). */}
      <span className={styles.lanternPool} aria-hidden />
      <Lantern
        standing
        lit={lit}
        onToggle={() => setLit((value) => !value)}
        litSrc={`${ASSETS}/lanterne.webp`}
        outSrc={`${ASSETS}/lanterne-eteinte.webp`}
        className={styles.lantern}
      />
    </div>
  );
}
