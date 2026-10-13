import type { ReactNode } from "react";
import styles from "@/features/shell/StatusTag.module.css";

export type StatusTone = "new" | "owned";

/**
 * LE TAG D'ÉTAT d'un objet de la collection — « Nouveau », « Possédé » —,
 * le même partout (ouverture de boosters, contenu d'un booster, Market) :
 * une petite plaque de nuit à losange, à cheval sur le bord HAUT de
 * l'objet (retour du 13/10/2026).
 *
 * Il transmet un HALO à l'objet : la lueur sort de la plaque à gauche et
 * à droite, longe le bord du haut jusqu'aux coins, puis descend les côtés
 * en s'éteignant vers le MILIEU de l'objet — elle ne l'entoure pas en
 * entier. Vert pour ce qu'on possède, or pour ce qui est nouveau.
 *
 * Le parent doit être positionné (`position: relative`) et avoir la forme
 * de l'objet : le halo en épouse la boîte et ses coins (`border-radius:
 * inherit`). `halo={false}` : la plaque seule. `inline` : la plaque dans
 * le flux du texte (une ligne de liste), sans halo.
 */
export function StatusTag({
  tone,
  children,
  halo = true,
  inline = false,
  className,
}: {
  tone: StatusTone;
  children?: ReactNode;
  halo?: boolean;
  inline?: boolean;
  className?: string;
}) {
  return (
    <>
      {halo && !inline && <span className={styles.halo} data-tone={tone} aria-hidden />}
      <span className={className ? `${styles.tag} ${className}` : styles.tag} data-tone={tone} data-inline={inline || undefined}>
        {children ?? (tone === "new" ? "Nouveau" : "Possédé")}
      </span>
    </>
  );
}
