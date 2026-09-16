import type { TideStateName } from "@/game";
import styles from "@/features/match/table/Table.module.css";

/**
 * La mer de chaque état, telle qu'on la voit PAR LE HUBLOT — image carrée,
 * cadrée pour tenir dans un disque, et non le fond panoramique du plateau
 * (`BackgroundLayer`, `tide-states/*.webp`), qui est un autre cadrage.
 */
const PORTHOLE_SEAS: Record<TideStateName, string> = {
  calme: "/assets/board/tide-portholes/calme.webp",
  houle: "/assets/board/tide-portholes/houle.webp",
  tempete: "/assets/board/tide-portholes/tempete.webp",
  abysses: "/assets/board/tide-portholes/abysses.webp",
};

/**
 * Hublot de Marée — le cuivre et le verre par lesquels on regarde la mer
 * du moment, dans la colonne des piles, entre les deux joueurs.
 *
 * Il ne remplace pas la piste (`TideIndicator`) : la piste dit OÙ on en est
 * (quel état, combien de tours), le hublot dit à QUOI ça ressemble. C'est
 * le seul endroit du plateau où la Tempête et les Abysses se voient en
 * grand, le fond d'écran étant largement couvert par les cartes.
 *
 * Les quatre mers restent montées et se relaient en fondu, comme le fond :
 * au changement d'état il ne doit y avoir ni chargement ni clignotement —
 * l'eau change, c'est tout.
 */
export function TidePorthole({ state, label }: { state: TideStateName; label: string }) {
  return (
    <div className={styles.porthole} role="img" aria-label={`La mer par le hublot — ${label}`}>
      <span className={styles.portholeWindow} aria-hidden>
        {(Object.keys(PORTHOLE_SEAS) as TideStateName[]).map((name) => (
          // eslint-disable-next-line @next/next/no-img-element -- décor local, jamais responsive au sens Next/Image
          <img
            key={name}
            src={PORTHOLE_SEAS[name]}
            alt=""
            draggable={false}
            className={`${styles.portholeSea} ${name === state ? styles.portholeSeaOn : ""}`}
          />
        ))}
        <span className={styles.portholeGlass} />
      </span>
      {/* eslint-disable-next-line @next/next/no-img-element -- idem */}
      <img src="/assets/board/tide-porthole-frame.webp" alt="" aria-hidden draggable={false} className={styles.portholeFrame} />
    </div>
  );
}
