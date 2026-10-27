"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { getCardDefinition, type CardInstance } from "@/game";
import { levelRewardLabel, loginRewardLabel, type LevelRewardItem, type LoginRewardItem } from "@/game/progression";
import { CardDetailModal } from "@/features/collection/card-detail/CardDetailModal";
import { CardTile } from "@/features/match/CardTile";
import { useLongPress } from "@/features/match/useLongPress";
import { chooseRewardCard, type PendingCardChoice } from "@/features/progression/profileActions";
import { RewardIcon, type RewardItem } from "@/features/progression/RewardIcon";
import styles from "@/features/progression/RewardReveal.module.css";
import banner from "@/features/shell/BlackBanner.module.css";
import { playButtonClick, playExploitClaimed, playRewardObtained } from "@/lib/sound";

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
  /**
   * Son de l'ouverture. Un exploit a le sien (`playExploitClaimed`) : il
   * REMPLACE celui de la récompense, jouer les deux les ferait se chevaucher.
   */
  sound?: "reward" | "exploit";
  /**
   * Les gains EN GRAND, posés seuls sans médaillon — le colis d'un mécène
   * (retour du 13/10/2026) : on veut voir ce qu'il contenait, pas une
   * pastille.
   */
  showcase?: boolean;
  onDone: () => void;
}

function itemLabel(item: RewardItem): string {
  if (item.kind === "xp" || item.kind === "card") return loginRewardLabel(item as LoginRewardItem);
  return levelRewardLabel(item as LevelRewardItem);
}

/** Une carte que le jeu sait encore dessiner (une carte retirée ferait tomber tout l'écran). */
function knownCard(cardId: string): boolean {
  try {
    getCardDefinition(cardId);
    return true;
  } catch {
    return false;
  }
}

/** La carte précise d'un gain « carte », quand le serveur l'a tirée et qu'elle existe encore. */
function wonCardId(item: RewardItem): string | null {
  return item.kind === "card" && "cardId" in item && item.cardId && knownCard(item.cardId) ? item.cardId : null;
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
/** Les gains surgissent avant qu'un toucher puisse les fermer. */
const ITEMS_MIN_MS = 900;
/** La carte gardée reste levée ce temps-là avant la suite. */
const KEPT_HOLD_MS = 650;

export function RewardReveal({ levels, choices, extraItems = [], title: forcedTitle, sound = "reward", showcase = false, onDone }: RewardRevealProps) {
  const [mounted, setMounted] = useState(false);
  const [choiceIndex, setChoiceIndex] = useState(0);
  const [picked, setPicked] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [kept, setKept] = useState<string[]>([]);
  /** Fiche d'une carte proposée — clic droit ou appui long, comme partout ailleurs (retour du 27/10/2026). */
  const [detailCardId, setDetailCardId] = useState<string | null>(null);
  const longPress = useLongPress<string>(setDetailCardId);
  // Les récompenses d'abord ; s'il n'y en a pas (on vient seulement choisir), directement le choix.
  const [phase, setPhase] = useState<"items" | "choice">(levels.length > 0 || extraItems.length > 0 ? "items" : "choice");

  // La révélation s'ouvre : c'est LE moment de la récompense, il s'entend.
  // Par une minuterie annulée au démontage : le mode strict monte l'effet
  // deux fois en développement, le son ne doit partir qu'une.
  useEffect(() => {
    setMounted(true);
    const timer = window.setTimeout(sound === "exploit" ? playExploitClaimed : playRewardObtained, 0);
    return () => window.clearTimeout(timer);
  }, [sound]);

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

  /**
   * Pas de bouton à valider (13/10/2026) : un toucher n'importe où ferme les
   * gains — une fois qu'ils ont eu le temps de surgir, pour qu'un toucher
   * réflexe n'escamote pas le moment.
   */
  const [readyAt] = useState(() => Date.now() + ITEMS_MIN_MS);
  function finishItems() {
    if (Date.now() < readyAt || detailCardId || longPress.consumeClick()) return;
    playButtonClick();
    if (choices.length > 0) setPhase("choice");
    else onDone();
  }

  /** Toucher une carte la GARDE, tout de suite : pas de second geste « Garder ». */
  async function keepCard(cardId: string) {
    if (!choice || busy) return;
    playButtonClick();
    setPicked(cardId);
    setBusy(true);
    setError(null);
    const result = await chooseRewardCard(choice.id, cardId).catch(() => ({ ok: false, error: "Serveur injoignable — réessaie." }));
    setBusy(false);
    if (!result.ok) {
      setPicked(null);
      setError(result.error ?? "Choix impossible.");
      return;
    }
    setKept((current) => [...current, cardId]);
    // Le temps de voir la carte gardée s'élever avant la suite.
    window.setTimeout(() => {
      setPicked(null);
      if (choiceIndex + 1 < choices.length) setChoiceIndex(choiceIndex + 1);
      else onDone();
    }, KEPT_HOLD_MS);
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

  // « Choisis ta carte » n'annonce QUE des choix de carte : une récompense de Tides, de quête ou de
  // connexion réclamée seule n'a rien à choisir (retour joueur du 27/10/2026).
  const title =
    forcedTitle ??
    (levels.length === 1
      ? `Palier ${levels[0]!.level} réclamé !`
      : levels.length > 1
        ? `${levels.length} paliers réclamés !`
        : shown.length > 0
          ? "Récompense réclamée !"
          : "Choisis ta carte");

  return createPortal(
    <div className={`${banner.veil} ${styles.scene}`} role="dialog" aria-modal aria-label={title} onClick={phase === "items" ? finishItems : undefined} data-tap={phase === "items" ? "" : undefined}>
      {/* Le bandeau noir des présentations (15/10/2026) : la récompense s'y révèle, rayons et éclats compris. */}
      <div className={`${banner.band} ${styles.band}`}>
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
          <ul className={styles.items} data-showcase={showcase || undefined}>
            {shown.map((item, index) => (
              <li key={index} className={styles.item} style={{ ["--i" as string]: index }} data-card={wonCardId(item) ? "" : undefined}>
                {wonCardId(item) ? (
                  // Une carte gagnée se montre elle-même, pas une icône de carte.
                  <span className={styles.wonCard} {...longPress.bind(wonCardId(item)!)}>
                    <CardTile instance={choiceInstance("won", wonCardId(item)!)} tideState="calme" widthClassName="w-full" scaleOnHover={false} />
                  </span>
                ) : (
                  <span className={styles.itemIcon}>
                    <RewardIcon item={item} size={showcase ? 190 : 84} />
                  </span>
                )}
                <span className={styles.itemLabel}>{wonCardId(item) ? getCardDefinition(wonCardId(item)!).name : itemLabel(item)}</span>
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
          <p className={styles.tapHint}>{choices.length > 0 ? "Touche pour choisir ta carte" : "Touche pour continuer"}</p>
        </div>
      ) : choice ? (
        <div className={styles.panel}>
          <p className={styles.eyebrow}>
            {choice.level ? `Palier ${choice.level}` : "Récompense"}
            {choices.length > 1 ? ` · ${choiceIndex + 1} / ${choices.length}` : ""}
          </p>
          <h2 className={styles.title}>Garde une carte</h2>
          {choice.offeredCardIds.length === 0 && (
            // Filet : une proposition vidée (cartes retirées du jeu) ne doit jamais bloquer l'écran.
            <p className={styles.error}>Cette proposition n&apos;a plus de carte disponible — elle sera refaite à ta prochaine visite.</p>
          )}
          <div className={styles.choices}>
            {choice.offeredCardIds.filter(knownCard).map((cardId, index) => (
              <button
                key={cardId}
                type="button"
                className={styles.choice}
                data-picked={picked === cardId ? "true" : undefined}
                style={{ ["--i" as string]: index }}
                {...longPress.bind(cardId)}
                onClick={() => {
                  if (longPress.consumeClick()) return;
                  void keepCard(cardId);
                }}
                disabled={busy || picked !== null}
                aria-label={`Garder ${getCardDefinition(cardId).name}`}
                title="Clic droit : voir la fiche"
              >
                <span className={styles.choiceCard}>
                  <CardTile instance={choiceInstance(choice.id, cardId)} tideState="calme" widthClassName="w-full" scaleOnHover={false} />
                </span>
              </button>
            ))}
          </div>
          {error && <p className={styles.error}>{error}</p>}
          {choice.offeredCardIds.length === 0 ? (
            <button type="button" className={styles.primary} onClick={onDone}>
              Fermer
            </button>
          ) : (
            <p className={styles.tapHint} data-static="">{picked ? `${getCardDefinition(picked).name} rejoint ta collection` : "Touche la carte que tu gardes · appui long ou clic droit : sa fiche"}</p>
          )}
          {kept.length > 0 && <p className={styles.kept}>Déjà gardée{kept.length > 1 ? "s" : ""} : {kept.map((id) => getCardDefinition(id).name).join(", ")}</p>}
        </div>
      ) : null}
      </div>
      {detailCardId && (() => {
        const offered = phase === "choice" ? (choice?.offeredCardIds.filter(knownCard) ?? []) : [];
        const index = offered.indexOf(detailCardId);
        const step = index >= 0 && offered.length > 1 ? (delta: number) => () => setDetailCardId(offered[(index + delta + offered.length) % offered.length]!) : undefined;
        return <CardDetailModal cardId={detailCardId} onPrevious={step?.(-1)} onNext={step?.(1)} onClose={() => setDetailCardId(null)} />;
      })()}
    </div>,
    document.body
  );
}
