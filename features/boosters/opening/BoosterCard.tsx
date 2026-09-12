"use client";

import { memo, useState, type CSSProperties, type KeyboardEvent } from "react";
import { getCardDefinition } from "@/game";
import { CardTile } from "@/features/match/CardTile";
import styles from "@/features/boosters/opening/BoosterOpening.module.css";
import { CARD_BACK_ASSET } from "@/features/boosters/opening/boosterOpeningAssets";
import type { BoosterCardRevealState } from "@/features/boosters/opening/boosterOpeningMachine";
import { BoosterParticles } from "@/features/boosters/opening/BoosterParticles";
import { OPENING_RARITY_LABEL, type BoosterOpeningCard } from "@/features/boosters/opening/types";

export type BoosterCardStyle = CSSProperties & Record<`--${string}`, string | number>;

interface BoosterCardProps {
  card: BoosterOpeningCard;
  index: number;
  count: number;
  state: BoosterCardRevealState;
  interactive: boolean;
  cardBackAvailable: boolean;
  /** Variables de placement et de rythme — objet stable, calculé une fois par `BoosterCards`. */
  cardStyle: BoosterCardStyle;
  onReveal: (index: number) => void;
}

/**
 * Une carte du booster. Trois couches de mouvement, chacune sur son propre
 * élément pour ne jamais se marcher dessus :
 *   `.card`      sortie du sachet (translation, rotation, z-index animé)
 *   `.cardLift`  survol
 *   `.cardFlip`  anticipation + retournement 3D (rotateY)
 *
 * `.card` est un `div role="button"` et non un `<button>` : la face rendue
 * par `CardTile` est elle-même un bouton, et un bouton ne peut pas en
 * contenir un autre.
 */
export const BoosterCard = memo(function BoosterCard({
  card,
  index,
  count,
  state,
  interactive,
  cardBackAvailable,
  cardStyle,
  onReveal,
}: BoosterCardProps) {
  // Si le PNG du dos échoue malgré le préchargement, on retombe sur le dos CSS.
  const [backFailed, setBackFailed] = useState(false);
  const revealed = state === "revealed";
  const rarityLabel = OPENING_RARITY_LABEL[card.rarity];
  const cardName = card.cardId ? getCardDefinition(card.cardId).name : "Carte test";
  const showBackImage = cardBackAvailable && !backFailed;

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (!interactive || (event.key !== "Enter" && event.key !== " ")) return;
    event.preventDefault();
    onReveal(index);
  }

  return (
    <div
      role="button"
      tabIndex={interactive ? 0 : -1}
      aria-disabled={!interactive}
      className={styles.card}
      style={cardStyle}
      data-state={state}
      data-rarity={card.rarity}
      data-interactive={interactive || undefined}
      onClick={() => interactive && onReveal(index)}
      onKeyDown={handleKeyDown}
      aria-label={
        revealed
          ? `Carte ${index + 1} sur ${count} : ${cardName}, ${rarityLabel}`
          : `Carte ${index + 1} sur ${count}, face cachée — révéler`
      }
    >
      <span className={styles.cardLift}>
        <span className={styles.cardAura} aria-hidden />
        {card.rarity === "abyssal" && state !== "hidden" && <span className={styles.cardMist} aria-hidden />}

        <span className={styles.cardTilt}>
          <span className={styles.cardFlip}>
            <span className={`${styles.cardFace} ${styles.cardBack}`} aria-hidden>
              {showBackImage ? (
                // eslint-disable-next-line @next/next/no-img-element -- asset préchargé, retourné en 3D
                <img
                  className={styles.cardBackImage}
                  src={CARD_BACK_ASSET}
                  alt=""
                  draggable={false}
                  onError={() => setBackFailed(true)}
                />
              ) : (
                <span className={styles.cardBackFallback} />
              )}
            </span>

            {/* Montée dès la sortie du sachet (cachée par le dos) : ses images ont le temps de charger avant le retournement. */}
            <span className={`${styles.cardFace} ${styles.cardFront}`} aria-hidden>
              {card.cardId ? (
                <span className={styles.frontTile}>
                  <CardTile
                    instance={{
                      instanceId: `booster_${card.id}`,
                      cardId: card.cardId,
                      ownerId: "booster",
                      damageMarked: 0,
                      modifiers: [],
                      summoningSick: false,
                      hasAttackedThisTurn: false,
                    }}
                    tideState="calme"
                    widthClassName="w-full"
                    scaleOnHover={false}
                  />
                </span>
              ) : (
                <>
                  <span className={styles.frontFrame} />
                  <span className={styles.frontEmblem} />
                  <span className={styles.frontTitle}>Carte test</span>
                  <span className={styles.frontRarity}>{rarityLabel}</span>
                </>
              )}
              <span className={styles.cardSheen} />
            </span>
          </span>
        </span>

        {revealed && card.rarity === "abyssal" && <span className={styles.cardRing} aria-hidden />}
        {revealed && card.rarity !== "standard" && <BoosterParticles variant={card.rarity} />}
      </span>
    </div>
  );
});
