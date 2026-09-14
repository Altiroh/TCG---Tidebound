"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PITY } from "@/game/boosters";
import { GameScreen } from "@/features/shell/GameScreen";
import game from "@/features/shell/GameScreen.module.css";
import styles from "@/features/boosters/Boosters.module.css";
import shelfStyles from "@/features/shell/Shelf.module.css";
import { ScreenToast, type ScreenToastMessage } from "@/features/shell/ScreenToast";
import { openBooster, type BoosterInventory } from "@/features/boosters/actions";
import { ownedPacks, type OwnedPack } from "@/features/boosters/ownedPacks";
import { PACK_SLOT_RATIO, PACKS_PER_SHELF, splitIntoShelves, stackedShelfLayout, useElementSize } from "@/features/boosters/stackedShelf";
import { BoosterOpeningScene } from "@/features/boosters/opening/BoosterOpeningScene";
import { preloadBoosterOpeningAssets } from "@/features/boosters/opening/boosterOpeningAssets";
import { closedPackVariables, getBoosterPackVisual } from "@/features/boosters/opening/boosterPackVisuals";
import { drawTestBoosterCards } from "@/features/boosters/opening/testBoosterCards";
import { toOpeningRarity, type BoosterOpeningCard } from "@/features/boosters/opening/types";
import { playButtonClick } from "@/lib/sound";

/** Type MIME du glisser-déposer d'un paquet vers le plan d'ouverture. */
const DRAG_MIME = "text/tidebound-booster-id";

/**
 * Rejouent la scène d'ouverture sur un tirage LOCAL, sans consommer de
 * booster ni toucher à la collection — pour régler l'animation sans devoir
 * s'acheter un paquet à chaque essai.
 */
const OPENING_TEST_BOOSTERS = [
  { boosterId: "standard", label: "Standard" },
  { boosterId: "welcome_tutorial", label: "Bienvenue" },
] as const;

interface BoostersScreenProps {
  inventory: BoosterInventory;
}

/**
 * MES BOOSTERS — la réserve et son plan d'ouverture. L'achat vit dans le
 * Market (`/market`), écran séparé : acheter et ouvrir sont deux gestes
 * différents, à deux moments différents.
 *
 * À gauche, l'ÉTAGÈRE : un sachet par exemplaire possédé (pas une ligne
 * par type — cf. `ownedPacks`), du plus récent au plus ancien, qui se
 * parcourt horizontalement. À droite, LE plan : on y fait glisser un
 * sachet, et il s'ouvre.
 *
 * L'ouverture est RÉELLE : `openBooster` consomme l'exemplaire, tire les
 * cartes côté serveur et crédite la collection avant que la scène ne
 * commence. Le client n'a jamais la main sur le contenu — il ne fait que
 * l'afficher (cf. l'en-tête de `features/boosters/actions.ts`).
 */
export function BoostersScreen({ inventory }: BoostersScreenProps) {
  const router = useRouter();
  const packs = useMemo(() => ownedPacks(inventory.boosters), [inventory.boosters]);
  const shelfArea = useElementSize<HTMLDivElement>();
  const shelves = useMemo(() => splitIntoShelves(packs), [packs]);
  // Même disposition pour toutes les étagères, calculée pour une étagère
  // PLEINE : un sachet garde sa taille et sa place d'une étagère à l'autre.
  // La hauteur laisse deviner l'étagère suivante sous la première.
  // Hauteur bornée par la largeur aussi : cinq sachets doivent tenir côte à
  // côte, à peine espacés, sans se chevaucher.
  const shelfGap = Math.round(shelfArea.width * 0.02);
  const layout = stackedShelfLayout(
    PACKS_PER_SHELF,
    shelfArea.width,
    Math.min(340, shelfArea.height * 0.7, (shelfArea.width - shelfGap * (PACKS_PER_SHELF - 1)) / PACKS_PER_SHELF / PACK_SLOT_RATIO),
    { gap: shelfGap }
  );

  /** Paquet posé sur le plan, prêt à être ouvert (sa clé d'étagère). */
  const [dockedKey, setDockedKey] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isOver, setIsOver] = useState(false);
  const [isOpening, setIsOpening] = useState(false);
  const [toast, setToast] = useState<ScreenToastMessage | null>(null);
  const setError = (message: string | null) =>
    setToast(message ? { id: Date.now(), tone: "error", text: message } : null);
  /**
   * Ouverture en cours. Les cartes sont fixées une fois pour toutes à
   * l'ouverture, jamais retirées en cours de scène. `real` distingue une
   * vraie ouverture (exemplaire consommé, collection créditée) d'un essai
   * d'animation, qui n'a rien écrit.
   */
  const [opening, setOpening] = useState<{ boosterId: string; cards: BoosterOpeningCard[]; real: boolean } | null>(null);

  const docked = packs.find((pack) => pack.key === dockedKey) ?? null;
  const dockedEntry = docked ? inventory.boosters.find((entry) => entry.boosterId === docked.boosterId) : undefined;

  // AUCUNE sélection par défaut : le plan reste vide tant qu'on n'y a rien
  // posé — c'est ce vide qui dit ce qu'on attend du joueur. On ne fait donc
  // que retirer le paquet qui n'existe plus (celui qu'on vient d'ouvrir).
  useEffect(() => {
    setDockedKey((current) => (current && packs.some((pack) => pack.key === current) ? current : null));
  }, [packs]);

  // Images de la scène chargées et décodées en avance : l'ouverture démarre sans flash.
  const visualIdsKey = Array.from(new Set(packs.map((pack) => pack.boosterId))).join(",");
  useEffect(() => {
    if (!visualIdsKey) return;
    for (const boosterId of visualIdsKey.split(",")) {
      void preloadBoosterOpeningAssets(getBoosterPackVisual(boosterId));
    }
  }, [visualIdsKey]);

  function dock(key: string) {
    playButtonClick();
    setError(null);
    setDockedKey(key);
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
      real: true,
      cards: result.data.cards.map((card) => ({
        // Une même carte peut sortir deux fois du même booster : c'est le
        // slot qui rend la clé unique, pas l'identifiant de carte.
        id: `${card.slotIndex}-${card.cardId}`,
        cardId: card.cardId,
        rarity: toOpeningRarity(card.rarity),
      })),
    });
  }

  /** Ouverture À BLANC : un tirage local, aucun appel serveur, aucun booster consommé. */
  function handleTestOpen(boosterId: string) {
    if (isOpening || opening) return;
    playButtonClick();
    setError(null);
    setOpening({ boosterId, real: false, cards: drawTestBoosterCards(boosterId) });
  }

  function handleOpeningClosed() {
    const wasReal = opening?.real ?? false;
    setOpening(null);
    // Une ouverture réelle a consommé l'exemplaire et crédité la collection
    // côté base : on relit l'inventaire plutôt que de deviner le nouvel
    // état. Un essai d'animation n'a rien écrit — rien à relire.
    if (wasReal) router.refresh();
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
      <div className={styles.layout}>
        <div className={styles.layoutInner}>
          {/* Pas de rappel du solde ici : le bandeau le porte déjà, deux
              pas au-dessus. */}
          <h1 className={game.title}>Mes boosters</h1>

          <div className={styles.workbench} data-dragging={isDragging ? "true" : "false"}>
            <section className={styles.stock} aria-label="Paquets possédés">
              {packs.length === 0 ? (
                <div className={styles.stockEmpty}>
                  <span className={styles.stockEmptyMark} aria-hidden />
                  <p className={styles.stockEmptyTitle}>Aucun booster en réserve</p>
                  <p className={game.muted}>Les boosters achetés au Market atterrissent ici.</p>
                  <Link href="/market" className={game.primary} onClick={() => playButtonClick()}>
                    Aller au Market
                  </Link>
                </div>
              ) : (
                // Zone défilante mesurée : cinq sachets par étagère, une
                // nouvelle étagère en dessous au-delà.
                <div className={styles.shelves} ref={shelfArea.ref} role="listbox" aria-label="Paquets possédés">
                  {shelves.map((shelfPacks, shelfIndex) => (
                    <div key={shelfIndex} className={styles.shelf}>
                      <div className={styles.shelfRow} style={{ height: layout.packHeight }}>
                        {shelfPacks.map((pack, index) => (
                          <ShelfPack
                            key={pack.key}
                            pack={pack}
                            style={{
                              left: layout.offset + index * layout.step,
                              width: layout.slotWidth,
                              // Le plus récent (à gauche) passe devant s'ils se chevauchent.
                              zIndex: PACKS_PER_SHELF - index,
                            }}
                            selected={pack.key === dockedKey}
                            disabled={isOpening || opening !== null}
                            onSelect={() => dock(pack.key)}
                            onDragStart={(event) => {
                              event.dataTransfer.setData(DRAG_MIME, pack.boosterId);
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
                      <div className={shelfStyles.plank} aria-hidden />
                    </div>
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
                if (!boosterId) return;
                const dropped = packs.find((pack) => pack.boosterId === boosterId);
                if (!dropped) return;
                // Déposer OUVRE : c'est le geste de l'écran, et le sachet
                // qu'on lâche sur la zone est déjà un engagement. Le chemin
                // au clic, lui, passe par le bouton « Ouvrir » — un clic
                // est trop facile à donner par erreur.
                setDockedKey(dropped.key);
                void handleOpen(dropped.boosterId);
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
                  {dockedEntry && dockedEntry.packsSinceAbyssal >= PITY.rampStartsAfterPacks && (
                    <p className={styles.dockPity}>
                      {dockedEntry.packsSinceAbyssal} sans Abyssale
                      {dockedEntry.packsSinceAbyssal >= PITY.guaranteeAtPack - 1
                        ? " · garantie au prochain"
                        : " · chance renforcée"}
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
                  {/* Placeholder : trois cartes en attente, pas un cadre
                      vide — la zone montre ce qu'elle rend, pas ce qui lui
                      manque. */}
                  <svg viewBox="0 0 48 44" width="52" height="48" fill="none" className={styles.dockMark} aria-hidden>
                    <rect x="8" y="9" width="21" height="29" rx="3" stroke="currentColor" strokeWidth="1.6" transform="rotate(-11 18 23)" />
                    <rect x="14" y="7" width="21" height="29" rx="3" stroke="currentColor" strokeWidth="1.6" />
                    <rect x="20" y="9" width="21" height="29" rx="3" stroke="currentColor" strokeWidth="1.6" transform="rotate(11 30 23)" />
                  </svg>
                  <p className={styles.dockTitle}>
                    {packs.length > 0 ? "Glisse un booster ici" : "Rien à ouvrir"}
                  </p>
                </>
              )}
            </section>
          </div>

          <div className={styles.footRow}>
            <Link href="/market" className={game.link} onClick={() => playButtonClick()}>
              Acheter des boosters →
            </Link>

            {/* Réglage de l'animation : un tirage local, sans booster ni
                écriture — le seul moyen de la revoir sans en acheter un. */}
            <span className={styles.testGroup} role="group" aria-label="Tester l’animation d’ouverture">
              <span className={styles.testLabel}>Tester l&apos;animation</span>
              {OPENING_TEST_BOOSTERS.map((test) => (
                <button
                  key={test.boosterId}
                  type="button"
                  className={game.link}
                  onClick={() => handleTestOpen(test.boosterId)}
                  disabled={opening !== null || isOpening}
                >
                  {test.label}
                </button>
              ))}
            </span>
          </div>
        </div>
      </div>

      <ScreenToast message={toast} onDismiss={() => setToast(null)} />

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
 * Un sachet sur l'étagère, posé en absolu à la position calculée par
 * l'écran.
 *
 * Une `div` et non un `button` : le glisser-déposer natif d'un `<button>`
 * est capricieux selon les navigateurs (le bouton avale le `dragstart`),
 * et c'est le geste principal de cet écran. Le rôle, le `tabIndex` et la
 * gestion d'Entrée/Espace lui rendent le comportement d'un bouton pour qui
 * ne glisse pas.
 */
function ShelfPack({
  pack,
  style,
  selected,
  disabled,
  onSelect,
  onDragStart,
  onDragEnd,
}: {
  pack: OwnedPack;
  style: React.CSSProperties;
  selected: boolean;
  disabled: boolean;
  onSelect: () => void;
  onDragStart: (event: React.DragEvent<HTMLDivElement>) => void;
  onDragEnd: () => void;
}) {
  return (
    <div
      className={styles.shelfPack}
      style={style}
      data-selected={selected ? "true" : "false"}
      data-disabled={disabled ? "true" : "false"}
      draggable={!disabled}
      onDragStart={disabled ? undefined : onDragStart}
      onDragEnd={onDragEnd}
      onClick={disabled ? undefined : onSelect}
      onKeyDown={(event) => {
        if (disabled) return;
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        onSelect();
      }}
      role="option"
      aria-selected={selected}
      aria-disabled={disabled}
      tabIndex={disabled ? -1 : 0}
      aria-label={pack.name}
      title={pack.name}
    >
      <span className={styles.shelfPackArt} style={closedPackVariables(getBoosterPackVisual(pack.boosterId))} aria-hidden />
    </div>
  );
}
