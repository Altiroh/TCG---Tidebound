"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PITY } from "@/game/boosters";
import { GameScreen } from "@/features/shell/GameScreen";
import game from "@/features/shell/GameScreen.module.css";
import styles from "@/features/boosters/Boosters.module.css";
import { openBooster, type BoosterInventory, type BoosterInventoryEntry } from "@/features/boosters/actions";
import { BoosterOpeningScene } from "@/features/boosters/opening/BoosterOpeningScene";
import { preloadBoosterOpeningAssets } from "@/features/boosters/opening/boosterOpeningAssets";
import { closedPackVariables, getBoosterPackVisual } from "@/features/boosters/opening/boosterPackVisuals";
import { toOpeningRarity, type BoosterOpeningCard } from "@/features/boosters/opening/types";
import { playButtonClick } from "@/lib/sound";

/** Type MIME du glisser-déposer d'un booster vers le plan d'ouverture. */
const DRAG_MIME = "text/tidebound-booster-id";

interface BoostersScreenProps {
  inventory: BoosterInventory;
}

/**
 * MES BOOSTERS — l'inventaire et son plan d'ouverture, rien d'autre.
 * L'achat vit dans le Market (`/market`), écran séparé : acheter et ouvrir
 * sont deux gestes différents, à deux moments différents.
 *
 * À gauche, les boosters possédés, un par type, avec leur nombre
 * d'exemplaires. À droite, LE plan d'ouverture : on y dépose un booster
 * (glisser-déposer depuis la colonne de gauche, ou simple clic pour qui ne
 * peut pas glisser), puis on l'ouvre.
 *
 * L'ouverture est RÉELLE : `openBooster` consomme l'exemplaire, tire les
 * cartes côté serveur et crédite la collection avant que la scène ne
 * commence. Le client n'a jamais la main sur le contenu — il ne fait que
 * l'afficher (cf. l'en-tête de `features/boosters/actions.ts`).
 */
export function BoostersScreen({ inventory }: BoostersScreenProps) {
  const router = useRouter();
  const owned = useMemo(() => inventory.boosters.filter((booster) => booster.owned > 0), [inventory.boosters]);

  /** Booster posé sur le plan, prêt à être ouvert. */
  const [dockedId, setDockedId] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isOver, setIsOver] = useState(false);
  const [isOpening, setIsOpening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Cartes de l'ouverture en cours — fixées une fois pour toutes par le serveur, jamais retirées en cours de scène. */
  const [opening, setOpening] = useState<{ boosterId: string; cards: BoosterOpeningCard[] } | null>(null);

  const docked = owned.find((booster) => booster.boosterId === dockedId) ?? null;

  // Le plan garde un booster tant qu'on en possède : un exemplaire consommé
  // en laisse d'autres, mais le dernier ouvert vide le plan de lui-même.
  useEffect(() => {
    setDockedId((current) => {
      if (current && owned.some((booster) => booster.boosterId === current)) return current;
      return owned[0]?.boosterId ?? null;
    });
  }, [owned]);

  // Images de la scène chargées et décodées en avance : l'ouverture démarre sans flash.
  const ownedIdsKey = owned.map((booster) => booster.boosterId).join(",");
  useEffect(() => {
    if (!ownedIdsKey) return;
    for (const boosterId of ownedIdsKey.split(",")) {
      void preloadBoosterOpeningAssets(getBoosterPackVisual(boosterId));
    }
  }, [ownedIdsKey]);

  function dock(boosterId: string) {
    playButtonClick();
    setError(null);
    setDockedId(boosterId);
  }

  async function handleOpen(boosterId: string) {
    if (isOpening || opening) return;
    playButtonClick();
    setError(null);
    setIsOpening(true);

    const result = await openBooster(boosterId);
    setIsOpening(false);

    if (!result.ok || !result.data) {
      setError(result.error ?? "Ouverture impossible.");
      return;
    }

    setOpening({
      boosterId,
      cards: result.data.cards.map((card) => ({
        // Une même carte peut sortir deux fois du même booster : c'est le
        // slot qui rend la clé unique, pas l'identifiant de carte.
        id: `${card.slotIndex}-${card.cardId}`,
        cardId: card.cardId,
        rarity: toOpeningRarity(card.rarity),
      })),
    });
  }

  function handleOpeningClosed() {
    setOpening(null);
    // L'exemplaire est consommé et la collection créditée côté base : on
    // relit l'inventaire plutôt que de deviner le nouvel état ici.
    router.refresh();
  }

  if (!inventory.isSignedIn) {
    return (
      <GameScreen active="boosters">
        <div className={game.content}>
          <div className={game.contentWide}>
            <div className={game.pageHead}>
              <div>
                <p className={game.eyebrow}>Réserve</p>
                <h1 className={game.title}>Mes boosters</h1>
              </div>
            </div>
            <div className={`${game.panel} ${game.empty}`}>
              <p className={game.emptyTitle}>Connecte-toi pour ouvrir des boosters</p>
              <p className={game.muted}>Tes boosters, tes Tides et ta collection sont enregistrés sur ton compte.</p>
              <Link href="/connexion" className={game.primary} onClick={() => playButtonClick()} style={{ marginTop: 6 }}>
                Se connecter
              </Link>
            </div>
          </div>
        </div>
      </GameScreen>
    );
  }

  return (
    <GameScreen active="boosters">
      <div className={game.content}>
        <div className={game.contentWide}>
          <div className={game.pageHead}>
            <div>
              <p className={game.eyebrow}>Réserve</p>
              <h1 className={game.title}>Mes boosters</h1>
            </div>
            <span className={styles.balance} aria-label={`Solde : ${inventory.balance} Tides`}>
              {inventory.balance}
              <span className={styles.balanceLabel}>Tides</span>
            </span>
          </div>

          {error && <p className={game.error}>{error}</p>}

          <div className={styles.workbench} data-dragging={isDragging ? "true" : "false"}>
            <section className={`${game.panel} ${styles.stock}`} aria-label="Boosters possédés">
              <p className={styles.panelTitle}>
                Possédés
                <span className={styles.panelTitleCount}>{owned.reduce((sum, booster) => sum + booster.owned, 0)}</span>
              </p>

              {owned.length === 0 ? (
                <div className={styles.stockEmpty}>
                  <p className={game.muted}>Tu n&apos;as aucun booster en réserve.</p>
                  <Link href="/market" className={game.primary} onClick={() => playButtonClick()}>
                    Aller au Market
                  </Link>
                </div>
              ) : (
                <div className={styles.stockList}>
                  {owned.map((booster) => (
                    <StockPack
                      key={booster.boosterId}
                      booster={booster}
                      selected={booster.boosterId === dockedId}
                      disabled={isOpening || opening !== null}
                      onSelect={() => dock(booster.boosterId)}
                      onDragStart={(event) => {
                        event.dataTransfer.setData(DRAG_MIME, booster.boosterId);
                        event.dataTransfer.effectAllowed = "move";
                        setIsDragging(true);
                      }}
                      onDragEnd={() => {
                        setIsDragging(false);
                        setIsOver(false);
                      }}
                    />
                  ))}
                </div>
              )}
            </section>

            {/* LE plan d'ouverture : une seule zone, toujours à la même place,
                qu'on vise à la souris comme on poserait le sachet sur la table. */}
            <section
              className={styles.dock}
              data-state={isOver ? "over" : docked ? "loaded" : "empty"}
              aria-label="Plan d'ouverture"
              onDragOver={(event) => {
                if (!event.dataTransfer.types.includes(DRAG_MIME)) return;
                event.preventDefault();
                event.dataTransfer.dropEffect = "move";
                setIsOver(true);
              }}
              onDragLeave={(event) => {
                // Le survol des enfants déclenche `dragleave` sur le parent :
                // on ne l'écoute que lorsqu'on sort vraiment de la zone.
                if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
                setIsOver(false);
              }}
              onDrop={(event) => {
                event.preventDefault();
                setIsOver(false);
                setIsDragging(false);
                const boosterId = event.dataTransfer.getData(DRAG_MIME);
                if (boosterId) dock(boosterId);
              }}
            >
              {docked ? (
                <>
                  <span
                    className={styles.dockPack}
                    style={closedPackVariables(getBoosterPackVisual(docked.boosterId))}
                    aria-hidden
                  />
                  <p className={styles.dockName}>{docked.name}</p>
                  <p className={styles.dockMeta}>
                    {docked.cardCount} cartes · {docked.owned} en réserve
                  </p>
                  {docked.packsSinceAbyssal >= PITY.rampStartsAfterPacks && (
                    <p className={styles.dockPity}>
                      {docked.packsSinceAbyssal} sans Abyssale
                      {docked.packsSinceAbyssal >= PITY.guaranteeAtPack - 1 ? " · garantie au prochain" : " · chance renforcée"}
                    </p>
                  )}
                  <button
                    type="button"
                    className={game.primary}
                    onClick={() => void handleOpen(docked.boosterId)}
                    disabled={isOpening || opening !== null}
                  >
                    {isOpening ? "Ouverture…" : "Ouvrir"}
                  </button>
                </>
              ) : (
                <>
                  <span className={styles.dockGhost} aria-hidden />
                  <p className={styles.dockHint}>
                    {owned.length > 0
                      ? "Dépose ici le booster à ouvrir"
                      : "Aucun booster à ouvrir — passe par le Market"}
                  </p>
                </>
              )}
            </section>
          </div>

          <div className={styles.testRow}>
            <Link href="/market" className={game.link} onClick={() => playButtonClick()}>
              Acheter des boosters →
            </Link>
            <Link href="/collection" className={game.link} onClick={() => playButtonClick()} style={{ marginLeft: "auto" }}>
              Voir la collection →
            </Link>
          </div>
        </div>
      </div>

      {opening && (
        <BoosterOpeningScene
          cards={opening.cards}
          visual={getBoosterPackVisual(opening.boosterId)}
          onClose={handleOpeningClosed}
        />
      )}
    </GameScreen>
  );
}

/**
 * Un type de booster en réserve. Glissable vers le plan, ET cliquable :
 * le glisser-déposer est le geste naturel, jamais le seul — au clavier ou
 * sur écran tactile, un clic pose le même booster sur le plan.
 */
function StockPack({
  booster,
  selected,
  disabled,
  onSelect,
  onDragStart,
  onDragEnd,
}: {
  booster: BoosterInventoryEntry;
  selected: boolean;
  disabled: boolean;
  onSelect: () => void;
  onDragStart: (event: React.DragEvent<HTMLButtonElement>) => void;
  onDragEnd: () => void;
}) {
  return (
    <button
      type="button"
      className={`${styles.stockPack} ${selected ? styles.stockPackSelected : ""}`}
      draggable={!disabled}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onClick={onSelect}
      disabled={disabled}
      aria-pressed={selected}
      aria-label={`${booster.name} — ${booster.owned} en réserve`}
      title="Glisse-le sur le plan, ou clique pour l'y poser"
    >
      <span className={styles.stockPackArt} style={closedPackVariables(getBoosterPackVisual(booster.boosterId))} aria-hidden />
      <span className={styles.stockPackText}>
        <span className={styles.stockPackName}>{booster.name}</span>
        <span className={styles.stockPackMeta}>{booster.cardCount} cartes</span>
      </span>
      <span className={styles.stockPackCount}>×{booster.owned}</span>
    </button>
  );
}
