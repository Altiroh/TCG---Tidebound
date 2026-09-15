"use client";

import { CARD_BACKS, cardBackSrc } from "@/game";
import type { LevelRewardItem, LoginRewardItem } from "@/game/progression";
import { getBoosterPackVisual } from "@/features/boosters/opening/boosterPackVisuals";
import { TideCoin } from "@/features/shell/HeaderPlayer";
import styles from "@/features/progression/RewardIcon.module.css";

/** Une récompense, qu'elle vienne d'un palier de niveau ou d'une escale de connexion. */
export type RewardItem = LevelRewardItem | LoginRewardItem;

/** Rareté portée par la récompense (choix de carte, carte aléatoire), pour teinter son halo. */
function rarityOf(item: RewardItem): string | undefined {
  if (item.kind === "cardChoice" || item.kind === "card") return item.rarity;
  return undefined;
}

/**
 * Icône d'une récompense — les VRAIS visuels du jeu, jamais un pictogramme
 * de logiciel : la pièce de Tides du bandeau, le sachet du booster, les
 * icônes peintes des quêtes pour les cartes et les decks, le dos de carte
 * lui-même pour un dos, le cadre du Navire pour un cosmétique de Navire.
 *
 * Seuls l'XP, le titre et l'avatar n'ont pas d'asset : un dessin simple au
 * trait, dans la même encre que le reste.
 */
export function RewardIcon({ item, size = 40 }: { item: RewardItem; size?: number }) {
  const style = { width: size, height: size };

  switch (item.kind) {
    case "tides":
      return (
        <span className={styles.icon} style={style} data-kind="tides">
          <TideCoin size={Math.round(size * 0.78)} />
        </span>
      );
    case "xp":
      return (
        <span className={styles.icon} style={style} data-kind="xp">
          <svg viewBox="0 0 40 40" width="86%" height="86%" aria-hidden>
            <path d="M20 3l4.6 10.6L36 15l-8.6 7.6L30 34l-10-6-10 6 2.6-11.4L4 15l11.4-1.4z" fill="rgba(88,200,216,0.2)" stroke="#8fe3ee" strokeWidth="1.6" strokeLinejoin="round" />
            <text x="20" y="24.5" textAnchor="middle" fontSize="9" fontWeight="700" fill="#e6fbff" fontFamily="var(--font-ui), system-ui, sans-serif">
              XP
            </text>
          </svg>
        </span>
      );
    case "booster":
      return (
        <span className={styles.icon} style={style} data-kind="booster">
          {/* eslint-disable-next-line @next/next/no-img-element -- vignette d'un asset local */}
          <img src={getBoosterPackVisual(item.boosterId).assets.closed} alt="" draggable={false} className={styles.image} />
        </span>
      );
    case "cardChoice":
    case "card":
      return (
        <span className={styles.icon} style={style} data-kind="card" data-rarity={rarityOf(item)}>
          {/* eslint-disable-next-line @next/next/no-img-element -- icône peinte des quêtes */}
          <img src="/assets/quests/icon-cat-card.webp" alt="" draggable={false} className={styles.image} />
        </span>
      );
    case "preconToken":
      return (
        <span className={styles.icon} style={style} data-kind="token">
          {/* eslint-disable-next-line @next/next/no-img-element -- icône peinte des quêtes */}
          <img src="/assets/quests/icon-cat-deck.webp" alt="" draggable={false} className={styles.image} />
        </span>
      );
    case "cosmetic":
      return <CosmeticIcon cosmetic={item.cosmetic} id={item.id} size={size} />;
  }
}

function CosmeticIcon({ cosmetic, id, size }: { cosmetic: Extract<LevelRewardItem, { kind: "cosmetic" }>["cosmetic"]; id: string; size: number }) {
  const style = { width: size, height: size };

  if (cosmetic === "cardBack") {
    // Un dos dont le visuel n'existe pas encore montre le dos d'origine, éteint.
    const known = CARD_BACKS.some((back) => back.id === id);
    return (
      <span className={styles.icon} style={style} data-kind="cardBack" data-pending={known ? undefined : "true"}>
        {/* eslint-disable-next-line @next/next/no-img-element -- dos de carte réel */}
        <img src={cardBackSrc(id)} alt="" draggable={false} className={styles.cardBack} />
      </span>
    );
  }

  if (cosmetic === "shipSkin") {
    return (
      <span className={styles.icon} style={style} data-kind="shipSkin">
        {/* eslint-disable-next-line @next/next/no-img-element -- cadre de Navire réel */}
        <img src="/assets/ships/ship-frame-empty.webp" alt="" draggable={false} className={styles.image} />
      </span>
    );
  }

  if (cosmetic === "frame") {
    return (
      <span className={styles.icon} style={style} data-kind="frame">
        <span className={styles.frame} />
      </span>
    );
  }

  return (
    <span className={styles.icon} style={style} data-kind={cosmetic}>
      <svg viewBox="0 0 40 40" width="82%" height="82%" aria-hidden>
        {cosmetic === "title" ? (
          // Titre : un phylactère.
          <path d="M6 12h28v12H6zM6 12l-3 6 3 6M34 12l3 6-3 6M11 18h18" fill="rgba(199,154,78,0.18)" stroke="#e5cf9e" strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" />
        ) : (
          // Avatar : un buste dans un médaillon.
          <>
            <circle cx="20" cy="20" r="16" fill="rgba(199,154,78,0.14)" stroke="#e5cf9e" strokeWidth="1.6" />
            <circle cx="20" cy="16" r="5.5" fill="none" stroke="#e5cf9e" strokeWidth="1.6" />
            <path d="M9.5 31c1.8-5.2 5.6-8 10.5-8s8.7 2.8 10.5 8" fill="none" stroke="#e5cf9e" strokeWidth="1.6" strokeLinecap="round" />
          </>
        )}
      </svg>
    </span>
  );
}
