"use client";

import styles from "@/features/audience/RollingNumber.module.css";

const DIGITS = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"];

/**
 * Un nombre dont les chiffres ROULENT d'une valeur à l'autre, comme un
 * compteur mécanique : chaque chiffre est une bande 0→9 qui glisse jusqu'au
 * bon cran. Les colonnes sont appariées depuis la droite (unités, dizaines…)
 * pour qu'un 999 → 1 004 fasse tourner les bonnes bandes.
 *
 * Accessible : le nombre lisible est porté par `aria-label`, les bandes
 * sont décoratives. Sans animation sous `prefers-reduced-motion`.
 */
export function RollingNumber({ value, className }: { value: number; className?: string }) {
  const text = Math.max(0, Math.round(value)).toLocaleString("fr-FR");
  const chars = Array.from(text);
  return (
    <span className={`${styles.number}${className ? ` ${className}` : ""}`} aria-label={text} role="img">
      {chars.map((char, index) => {
        const fromRight = chars.length - index;
        if (!DIGITS.includes(char)) {
          return (
            <span key={`s${fromRight}`} className={styles.sep} aria-hidden>
              {char}
            </span>
          );
        }
        return (
          <span key={`d${fromRight}`} className={styles.digit} aria-hidden>
            <span className={styles.strip} style={{ transform: `translateY(-${Number(char) * 10}%)` }}>
              {DIGITS.map((digit) => (
                <span key={digit}>{digit}</span>
              ))}
            </span>
          </span>
        );
      })}
    </span>
  );
}
