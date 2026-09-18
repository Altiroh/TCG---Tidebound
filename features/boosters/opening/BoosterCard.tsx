"use client";

import { memo, useState, type CSSProperties, type KeyboardEvent, type MouseEvent, type PointerEvent } from "react";
import { getCardDefinition } from "@/game";
import { CardTile } from "@/features/match/CardTile";
import styles from "@/features/boosters/opening/BoosterOpening.module.css";
import { useCardBackSrc } from "@/features/cosmetics/CardBackProvider";
import type { BoosterCardRevealState } from "@/features/boosters/opening/boosterOpeningMachine";
import { BoosterParticles } from "@/features/boosters/opening/BoosterParticles";
import { OPENING_RARITY_LABEL, type BoosterOpeningCard } from "@/features/boosters/opening/types";

export type BoosterCardStyle = CSSProperties & Record<`--${string}`, string | number>;

/** Orbes d'une Abyssale : période, déphasage et taille propres, pour qu'ils ne tournent pas en file indienne. */
const ORBS: BoosterCardStyle[] = [
  { "--orbit": "3.6s", "--delay": "0s", "--orb-size": 1.6 },
  { "--orbit": "3.6s", "--delay": "-1.2s", "--orb-size": 1.1 },
  { "--orbit": "3.6s", "--delay": "-2.4s", "--orb-size": 1.3 },
  { "--orbit": "5.2s", "--delay": "-0.8s", "--orb-size": 0.8 },
];

/** Gros plan d'une Abyssale : la carte vole au centre (`in`), puis rejoint sa place (`out`). */
export type BoosterCardShowcase = "in" | "out" | "done";

interface BoosterCardProps {
  card: BoosterOpeningCard;
  index: number;
  count: number;
  state: BoosterCardRevealState;
  interactive: boolean;
  cardBackAvailable: boolean;
  /** Variables de placement et de rythme — objet stable, calculé une fois par `BoosterCards`. */
  cardStyle: BoosterCardStyle;
  showcase?: BoosterCardShowcase;
  onReveal: (index: number) => void;
  /** Carte révélée qu'on veut lire : sa fiche détaillée. */
  onInspect: (cardId: string) => void;
  /** Clic sur la carte en gros plan : elle rejoint la rangée. */
  onShowcaseDismiss: () => void;
}

/**
 * Une carte du booster. Trois couches de mouvement, chacune sur son propre
 * élément pour ne jamais se marcher dessus :
 *   `.card`      sortie du sachet, puis gros plan (translation, rotation, z-index animé)
 *   `.cardLift`  survol et agrandissement au retournement
 *   `.cardFlip`  anticipation + retournement 3D (rotateY)
 *
 * Trois façons de la retourner : la survoler à la souris, la toucher (ou
 * faire glisser le doigt dessus — cf. `BoosterOpeningScene`), ou
 * Entrée/Espace au clavier. Une fois retournée, un simple clic ou une tape
 * ouvre sa fiche (le clic droit aussi, pour qui a gardé l'habitude : au
 * doigt il n'existe pas).
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
  showcase,
  onReveal,
  onInspect,
  onShowcaseDismiss,
}: BoosterCardProps) {
  // Si le PNG du dos échoue malgré le préchargement, on retombe sur le dos CSS.
  const [backFailed, setBackFailed] = useState(false);
  const revealed = state === "revealed";
  const rarityLabel = OPENING_RARITY_LABEL[card.rarity];
  const cardName = card.cardId ? getCardDefinition(card.cardId).name : "Carte test";
  const cardBack = useCardBackSrc();
  const showBackImage = cardBackAvailable && !backFailed;
  const highRarity = card.rarity === "rare" || card.rarity === "epic" || card.rarity === "legendary" || card.rarity === "abyssal";

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "Enter" && event.key !== " ") return;
    if (!interactive && !(revealed && card.cardId)) return;
    event.preventDefault();
    if (interactive) onReveal(index);
    else if (card.cardId) onInspect(card.cardId);
  }

  /** Survol à la souris : la carte se retourne d'elle-même. Au doigt, c'est le toucher qui le fait. */
  function handlePointerEnter(event: PointerEvent<HTMLDivElement>) {
    if (interactive && event.pointerType === "mouse") onReveal(index);
  }

  function handleClick() {
    if (showcase === "in") {
      onShowcaseDismiss();
      return;
    }
    if (interactive) {
      onReveal(index);
      return;
    }
    // Retournée : on veut la LIRE. Le clic droit restait le seul chemin, et
    // il n'existe pas au doigt (retour de test iOS du 18/09).
    if (revealed && card.cardId) onInspect(card.cardId);
  }

  function handleContextMenu(event: MouseEvent<HTMLDivElement>) {
    event.preventDefault();
    if (revealed && card.cardId) onInspect(card.cardId);
  }

  return (
    <div
      role="button"
      tabIndex={interactive || revealed ? 0 : -1}
      aria-disabled={!interactive && !revealed}
      className={styles.card}
      style={cardStyle}
      // Lu par la scène pour savoir quelle carte le doigt survole en
      // glissant : au toucher, l'événement reste capté par la carte où le
      // doigt s'est posé, donc seule la position compte.
      data-card-index={index}
      data-state={state}
      data-rarity={card.rarity}
      data-interactive={interactive || undefined}
      data-showcase={showcase}
      onPointerEnter={handlePointerEnter}
      onClick={handleClick}
      onContextMenu={handleContextMenu}
      onKeyDown={handleKeyDown}
      title={revealed && card.cardId ? "Voir la fiche de la carte" : undefined}
      aria-label={
        revealed
          ? `Carte ${index + 1} sur ${count} : ${cardName}, ${rarityLabel} — voir sa fiche`
          : `Carte ${index + 1} sur ${count}, face cachée — révéler`
      }
    >
      <span className={styles.cardLift}>
        <span className={styles.cardAura} aria-hidden />
        {card.rarity === "abyssal" && state !== "hidden" && <span className={styles.cardMist} aria-hidden />}
        {/* Halo de rareté : il s'allume au retournement et reste, à la
            couleur de la rareté — c'est lui qu'on lit d'un coup d'œil sur la
            rangée une fois tout retourné. */}
        <span className={styles.cardGlow} aria-hidden />

        <span className={styles.cardTilt}>
          <span className={styles.cardFlip}>
            <span className={`${styles.cardFace} ${styles.cardBack}`} aria-hidden>
              {showBackImage ? (
                // eslint-disable-next-line @next/next/no-img-element -- asset préchargé, retourné en 3D
                <img
                  className={styles.cardBackImage}
                  src={cardBack}
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
        {revealed && card.rarity === "legendary" && <span className={`${styles.cardRing} ${styles.cardRingGold}`} aria-hidden />}
        {revealed && highRarity && card.rarity !== "abyssal" && <BoosterParticles variant={card.rarity === "rare" ? "rare" : card.rarity === "epic" ? "epic" : "legendary"} />}
        {revealed && card.rarity === "abyssal" && <BoosterParticles variant="abyssal" />}
        {revealed && card.rarity === "abyssal" && (
          <span className={styles.cardOrbs} aria-hidden>
            {ORBS.map((orb, index) => (
              <span key={index} className={styles.orbCarrier} style={orb}>
                <span className={styles.orb} />
              </span>
            ))}
          </span>
        )}
        {revealed && card.isNew && <span className={styles.newBadge}>Nouveau</span>}
        {revealed && card.rarity === "legendary" && <BoosterParticles variant="sparks" />}
      </span>
    </div>
  );
});
