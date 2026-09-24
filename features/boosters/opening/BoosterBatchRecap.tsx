"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { getCardDefinition, type CardInstance } from "@/game";
import { RARITY_ORDER } from "@/game/boosters";
import { CardTile } from "@/features/match/CardTile";
import { CARD_RARITY_LABELS, CARD_TYPE_LABELS } from "@/features/match/cardDisplay";
import { cardIllustrationThumbUrl } from "@/features/decks/cardArtUrl";
import { CardDetailModal } from "@/features/collection/card-detail/CardDetailModal";
import { playButtonClick } from "@/lib/sound";
import game from "@/features/shell/GameScreen.module.css";
import styles from "@/features/boosters/opening/BoosterBatch.module.css";
import type { BoosterOpeningCard } from "@/features/boosters/opening/types";

export interface BoosterBatchLine {
  cardId: string;
  /** Exemplaires obtenus dans le lot, doublons compris. */
  count: number;
  /** Au moins un exemplaire complétait la collection. */
  isNew: boolean;
  rarity: BoosterOpeningCard["rarity"];
}

interface BoosterBatchRecapProps {
  packs: number;
  lines: readonly BoosterBatchLine[];
  onClose: () => void;
}

function displayInstance(cardId: string): CardInstance {
  return {
    instanceId: `recap_${cardId}`,
    cardId,
    ownerId: "booster",
    damageMarked: 0,
    modifiers: [],
    summoningSick: false,
    hasAttackedThisTurn: false,
  };
}

/**
 * Ce qu'un LOT de boosters a rapporté, en UN écran (audit du 24/09).
 *
 * Il y en avait deux : une rangée de dix cartes qui se posaient une à une,
 * puis, derrière un bouton, la liste complète. Le joueur passait donc
 * toujours par le premier pour atteindre le second — c'est lui qu'il
 * venait chercher. Il ne reste que la liste, et ce que la rangée apportait
 * (VOIR les cartes) passe dans un aperçu à droite :
 *
 *   - à GAUCHE, la liste : une ligne par carte, nom, type, rareté et
 *     nombre d'exemplaires alignés en colonnes. Nouveautés d'abord, puis
 *     par rareté décroissante — c'est ce qu'on vient vérifier ;
 *   - à DROITE, la carte sélectionnée, en grand. Toucher une ligne la
 *     montre ; les flèches ↑/↓ parcourent la liste sans quitter le clavier.
 *     La fiche complète (texte détaillé, mots-clés, revente) reste à un
 *     bouton.
 *
 * La première ligne est sélectionnée d'emblée : l'aperçu n'est jamais vide,
 * et c'est la meilleure carte du lot qui s'y trouve en arrivant.
 */
export function BoosterBatchRecap({ packs, lines, onClose }: BoosterBatchRecapProps) {
  const [detail, setDetail] = useState<string | null>(null);
  const total = lines.reduce((sum, line) => sum + line.count, 0);
  const newCount = lines.filter((line) => line.isNew).length;

  const sorted = useMemo(() => {
    const rank = (line: BoosterBatchLine) => RARITY_ORDER.indexOf(line.rarity);
    return [...lines].sort((a, b) => {
      if (a.isNew !== b.isNew) return a.isNew ? -1 : 1;
      if (rank(a) !== rank(b)) return rank(b) - rank(a);
      return getCardDefinition(a.cardId).name.localeCompare(getCardDefinition(b.cardId).name, "fr");
    });
  }, [lines]);

  /** Exemplaires par rareté, de la plus haute à la plus basse — le bilan en un coup d'œil. */
  const byRarity = useMemo(() => {
    const counts = new Map<BoosterBatchLine["rarity"], number>();
    for (const line of lines) counts.set(line.rarity, (counts.get(line.rarity) ?? 0) + line.count);
    return [...counts.entries()].sort((a, b) => RARITY_ORDER.indexOf(b[0]) - RARITY_ORDER.indexOf(a[0]));
  }, [lines]);

  const [selectedId, setSelectedId] = useState<string | null>(() => sorted[0]?.cardId ?? null);
  const selected = sorted.find((line) => line.cardId === selectedId) ?? sorted[0] ?? null;
  const selectedDef = selected ? getCardDefinition(selected.cardId) : null;

  const listRef = useRef<HTMLUListElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeRef.current?.focus({ preventScroll: true });
  }, []);

  // Verrouille le défilement de l'arrière-plan, comme les autres fenêtres.
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  useEffect(() => {
    function handleKey(event: KeyboardEvent) {
      // La fiche ouverte gère ses propres touches : Échap ne ferme qu'elle.
      if (detail) return;
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
      event.preventDefault();
      const index = sorted.findIndex((line) => line.cardId === selected?.cardId);
      const next = sorted[Math.min(sorted.length - 1, Math.max(0, index + (event.key === "ArrowDown" ? 1 : -1)))];
      if (!next) return;
      setSelectedId(next.cardId);
      listRef.current
        ?.querySelector<HTMLElement>(`[data-card-id="${CSS.escape(next.cardId)}"]`)
        ?.scrollIntoView({ block: "nearest" });
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [detail, onClose, selected?.cardId, sorted]);

  return (
    <div className={styles.layer} role="dialog" aria-modal="true" aria-label={`${packs} boosters ouverts`}>
      <div className={styles.recap}>
        <header className={styles.recapHead}>
          <div>
            <p className={styles.eyebrow}>
              {packs} booster{packs > 1 ? "s" : ""} ouvert{packs > 1 ? "s" : ""}
            </p>
            <h2 className={styles.title}>
              {total} carte{total > 1 ? "s" : ""} récupérée{total > 1 ? "s" : ""}
            </h2>
            <p className={styles.sub}>
              dont <b>{newCount}</b> nouvelle{newCount > 1 ? "s" : ""} pour la collection
            </p>
          </div>
          <ul className={styles.rarityTally} aria-label="Répartition par rareté">
            {byRarity.map(([rarity, count]) => (
              <li key={rarity} className={styles.lineRarity} data-rarity={rarity}>
                {count} {CARD_RARITY_LABELS[rarity]}
              </li>
            ))}
          </ul>
          <button
            ref={closeRef}
            type="button"
            className={`${game.primary} ${styles.recapClose}`}
            onClick={() => {
              playButtonClick();
              onClose();
            }}
          >
            Fermer
          </button>
        </header>

        <div className={styles.recapBody}>
          <ul ref={listRef} className={styles.list} aria-label="Cartes reçues">
            {sorted.map((line) => {
              const def = getCardDefinition(line.cardId);
              const isSelected = line.cardId === selected?.cardId;
              return (
                <li key={line.cardId}>
                  <button
                    type="button"
                    className={styles.line}
                    data-card-id={line.cardId}
                    data-new={line.isNew || undefined}
                    data-selected={isSelected || undefined}
                    aria-pressed={isSelected}
                    onClick={() => {
                      playButtonClick();
                      // Deuxième toucher sur la carte déjà montrée : la fiche complète.
                      if (isSelected) setDetail(line.cardId);
                      else setSelectedId(line.cardId);
                    }}
                    title={`${def.name} — voir la carte`}
                  >
                    <span
                      className={styles.lineArt}
                      style={{ backgroundImage: `url("${cardIllustrationThumbUrl(line.cardId)}")` }}
                      aria-hidden
                    />
                    <span className={styles.lineName}>
                      <span className={styles.lineNameText}>{def.name}</span>
                      {line.isNew && <span className={styles.lineNew}>Nouveau</span>}
                    </span>
                    <span className={styles.lineType}>{CARD_TYPE_LABELS[def.type]}</span>
                    <span className={styles.lineRarity} data-rarity={line.rarity}>
                      {CARD_RARITY_LABELS[line.rarity]}
                    </span>
                    <span className={styles.lineCount}>×{line.count}</span>
                  </button>
                </li>
              );
            })}
          </ul>

          <aside className={styles.preview} aria-live="polite">
            {selected && selectedDef && (
              <>
                {/* `CardTile` est déjà un bouton : il porte lui-même le geste,
                    un bouton autour ferait un bouton dans un bouton. */}
                <div className={styles.previewCard} data-new={selected.isNew || undefined}>
                  <CardTile
                    key={selected.cardId}
                    instance={displayInstance(selected.cardId)}
                    tideState="calme"
                    widthClassName="w-full"
                    scaleOnHover={false}
                    showStatusBadges={false}
                    onClick={() => {
                      playButtonClick();
                      setDetail(selected.cardId);
                    }}
                  />
                  {selected.isNew && <span className={styles.newMark}>Nouveau</span>}
                </div>
                <p className={styles.previewMeta}>
                  <span className={styles.lineRarity} data-rarity={selected.rarity}>
                    {CARD_RARITY_LABELS[selected.rarity]}
                  </span>
                  <span aria-hidden>·</span>
                  <span>{CARD_TYPE_LABELS[selectedDef.type]}</span>
                  <span aria-hidden>·</span>
                  <span>
                    ×{selected.count} reçue{selected.count > 1 ? "s" : ""}
                  </span>
                </p>
                <button
                  type="button"
                  className={`${game.link} ${styles.previewLink}`}
                  onClick={() => {
                    playButtonClick();
                    setDetail(selected.cardId);
                  }}
                >
                  Fiche complète
                </button>
              </>
            )}
          </aside>
        </div>
      </div>

      {detail && <CardDetailModal cardId={detail} onClose={() => setDetail(null)} />}
    </div>
  );
}
