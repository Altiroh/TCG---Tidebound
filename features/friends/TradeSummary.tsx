"use client";

import { getCardDefinition } from "@/game";
import { CardThumb } from "@/features/match/CardThumb";
import type { TradeLine } from "@/features/friends/tradeRules";
import styles from "@/features/friends/Social.module.css";

function Side({ title, lines }: { title: string; lines: TradeLine[] }) {
  return (
    <div className={styles.tradeSide}>
      <span className={styles.tradeSideTitle}>{title}</span>
      {lines.length === 0 ? (
        <span className={styles.subtitle}>Rien pour l&apos;instant</span>
      ) : (
        lines.map((line) => (
          <span key={line.cardId} className={styles.tradeCard}>
            <CardThumb cardId={line.cardId} size={32} />
            <span>
              {line.quantity > 1 ? `${line.quantity} × ` : ""}
              {getCardDefinition(line.cardId).name}
            </span>
          </span>
        ))
      )}
    </div>
  );
}

/** Les deux côtés d'un échange : ce qui part, ce qui arrive. */
export function TradeSummary({ offered, requested, giverLabel, receiverLabel }: { offered: TradeLine[]; requested: TradeLine[]; giverLabel: string; receiverLabel: string }) {
  return (
    <div className={styles.tradeSides}>
      <Side title={giverLabel} lines={offered} />
      <span className={styles.tradeArrow} aria-hidden>
        ⇄
      </span>
      <Side title={receiverLabel} lines={requested} />
    </div>
  );
}
