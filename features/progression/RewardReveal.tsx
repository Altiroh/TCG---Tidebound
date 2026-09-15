"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { getCardDefinition, type CardInstance } from "@/game";
import { levelRewardLabel, loginRewardLabel, type LevelRewardItem, type LoginRewardItem } from "@/game/progression";
import { CardTile } from "@/features/match/CardTile";
import { chooseRewardCard, type PendingCardChoice } from "@/features/progression/profileActions";
import { RewardIcon, type RewardItem } from "@/features/progression/RewardIcon";
import styles from "@/features/progression/RewardReveal.module.css";
import { playButtonClick } from "@/lib/sound";

export interface RevealedLevel {
  level: number;
  items: readonly LevelRewardItem[];
}

interface RewardRevealProps {
  /** Paliers qui viennent d'être réclamés — vide si l'on ne vient que trancher des cartes au choix. */
  levels: readonly RevealedLevel[];
  /** Cartes au choix à trancher, l'une après l'autre. */
  choices: readonly PendingCardChoice[];
  /** Gains hors paliers (quêtes, exploits, escale du jour) : Tides, XP, boosters. */
  extraItems?: readonly RewardItem[];
  /** Titre imposé — sinon déduit des paliers. */
  title?: string;
  onDone: () => void;
}

function itemLabel(item: RewardItem): string {
  if (item.kind === "xp" || item.kind === "card") return loginRewardLabel(item as LoginRewardItem);
  return levelRewardLabel(item as LevelRewardItem);
}

function choiceInstance(choiceId: string, cardId: string): CardInstance {
  return {
    instanceId: `choice_${choiceId}_${cardId}`,
    cardId,
    ownerId: "reward",
    damageMarked: 0,
    modifiers: [],
    summoningSick: false,
    hasAttackedThisTurn: false,
  };
}

/**
 * La RÉVÉLATION d'une récompense réclamée — le moment qu'on vient chercher.
 *
 * Les récompenses surgissent une à une, chacune avec son éclat, sur un fond
 * de lumière qui tourne ; les Tides d'un « tout réclamer » sont additionnés
 * en une seule pièce. Puis, s'il y a des cartes au choix, les propositions
 * se présentent face visible : on en garde une, et elle rejoint la
 * collection (`resolve_card_choice`, vérifiée côté serveur).
 */
export function RewardReveal({ levels, choices, extraItems = [], title: forcedTitle, onDone }: RewardRevealProps) {
  const [mounted, setMounted] = useState(false);
  const [choiceIndex, setChoiceIndex] = useState(0);
  const [picked, setPicked] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [kept, setKept] = useState<string[]>([]);
  // Les récompenses d'abord ; s'il n'y en a pas (on vient seulement choisir), directement le choix.
  const [phase, setPhase] = useState<"items" | "choice">(levels.length > 0 || extraItems.length > 0 ? "items" : "choice");

  useEffect(() => setMounted(true), []);

  /** Récompenses à montrer : les Tides additionnés, le reste tel quel (les choix de carte ont leur étape). */
  const shown = useMemo(() => {
    let tides = 0;
    let xp = 0;
    const boosters = new Map<string, number>();
    const others: RewardItem[] = [];
    const all: RewardItem[] = [...levels.flatMap((level) => level.items), ...extraItems];
    for (const item of all) {
      if (item.kind === "tides") tides += item.amount;
      else if (item.kind === "xp") xp += item.amount;
      else if (item.kind === "booster") boosters.set(item.boosterId, (boosters.get(item.boosterId) ?? 0) + item.count);
      else if (item.kind !== "cardChoice") others.push(item);
    }
    const merged: RewardItem[] = [];
    if (tides > 0) merged.push({ kind: "tides", amount: tides });
    if (xp > 0) merged.push({ kind: "xp", amount: xp });
    for (const [boosterId, count] of boosters) merged.push({ kind: "booster", boosterId, count });
    return [...merged, ...others];
  }, [levels, extraItems]);

  const choice = choices[choiceIndex];

  function finishItems() {
    playButtonClick();
    if (choices.length > 0) setPhase("choice");
    else onDone();
  }

  async function keepCard() {
    if (!choice || !picked || busy) return;
    playButtonClick();
    setBusy(true);
    setError(null);
    const result = await chooseRewardCard(choice.id, picked).catch(() => ({ ok: false, error: "Serveur injoignable — réessaie." }));
    setBusy(false);
    if (!result.ok) {
      setError(result.error ?? "Choix impossible.");
      return;
    }
    setKept((current) => [...current, picked]);
    setPicked(null);
    if (choiceIndex + 1 < choices.length) setChoiceIndex(choiceIndex + 1);
    else onDone();
  }

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      // On ne ferme pas un choix de carte par erreur : il resterait ouvert, mais le moment serait gâché.
      if (phase === "items") finishItems();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (!mounted) return null;

  const title =
    forcedTitle ??
    (levels.length === 1 ? `Palier ${levels[0]!.level} réclamé !` : levels.length > 1 ? `${levels.length} paliers réclamés !` : "Choisis ta carte");

  return createPortal(
    <div className={styles.scene} role="dialog" aria-modal aria-label={title}>
      <span className={styles.rays} aria-hidden />
      <span className={styles.burst} aria-hidden>
        {Array.from({ length: 18 }, (_, index) => (
          <span key={index} style={{ ["--a" as string]: `${index * 20}deg`, ["--d" as string]: `${(index % 3) * 70}ms` }} />
        ))}
      </span>

      {phase === "items" ? (
        <div className={styles.panel}>
          <p className={styles.eyebrow}>Récompense</p>
          <h2 className={styles.title}>{title}</h2>
          <ul className={styles.items}>
            {shown.map((item, index) => (
              <li key={index} className={styles.item} style={{ ["--i" as string]: index }}>
                <span className={styles.itemIcon}>
                  <RewardIcon item={item} size={84} />
                </span>
                <span className={styles.itemLabel}>{itemLabel(item)}</span>
              </li>
            ))}
            {choices.length > 0 && (
              <li className={styles.item} style={{ ["--i" as string]: shown.length }}>
                <span className={styles.itemIcon}>
                  <RewardIcon item={{ kind: "cardChoice", rarity: choices[0]!.rarity, choices: choices[0]!.offeredCardIds.length }} size={84} />
                </span>
                <span className={styles.itemLabel}>
                  {choices.length > 1 ? `${choices.length} cartes au choix` : "Une carte au choix"}
                </span>
              </li>
            )}
          </ul>
          <button type="button" className={styles.primary} onClick={finishItems} autoFocus>
            {choices.length > 0 ? "Choisir ma carte →" : "Génial !"}
          </button>
        </div>
      ) : choice ? (
        <div className={styles.panel}>
          <p className={styles.eyebrow}>
            {choice.level ? `Palier ${choice.level}` : "Récompense"}
            {choices.length > 1 ? ` · ${choiceIndex + 1} / ${choices.length}` : ""}
          </p>
          <h2 className={styles.title}>Garde une carte</h2>
          <div className={styles.choices}>
            {choice.offeredCardIds.map((cardId, index) => (
              <button
                key={cardId}
                type="button"
                className={styles.choice}
                data-picked={picked === cardId ? "true" : undefined}
                style={{ ["--i" as string]: index }}
                onClick={() => {
                  playButtonClick();
                  setPicked(cardId);
                }}
                aria-pressed={picked === cardId}
                aria-label={getCardDefinition(cardId).name}
              >
                <span className={styles.choiceCard}>
                  <CardTile instance={choiceInstance(choice.id, cardId)} tideState="calme" widthClassName="w-full" scaleOnHover={false} />
                </span>
              </button>
            ))}
          </div>
          {error && <p className={styles.error}>{error}</p>}
          <button type="button" className={styles.primary} onClick={() => void keepCard()} disabled={!picked || busy}>
            {busy ? "…" : picked ? `Garder ${getCardDefinition(picked).name}` : "Touche une carte"}
          </button>
          {kept.length > 0 && <p className={styles.kept}>Déjà gardée{kept.length > 1 ? "s" : ""} : {kept.map((id) => getCardDefinition(id).name).join(", ")}</p>}
        </div>
      ) : null}
    </div>,
    document.body
  );
}
