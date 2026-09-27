"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BOOSTER_EXTENSIONS, PITY, boosterExtensionLabel, type BoosterExtension } from "@/game/boosters";
import { GameScreen } from "@/features/shell/GameScreen";
import game from "@/features/shell/GameScreen.module.css";
import styles from "@/features/boosters/Boosters.module.css";
import { ScreenToast, type ScreenToastMessage } from "@/features/shell/ScreenToast";
import { openBoosters, type BoosterInventory, type BoosterInventoryEntry } from "@/features/boosters/actions";
import { MAX_BATCH_OPEN } from "@/features/boosters/constants";
import { BoosterBatchRecap, type BoosterBatchLine } from "@/features/boosters/opening/BoosterBatchRecap";
import { BoosterOpeningScene, type BoosterOpeningOrigin } from "@/features/boosters/opening/BoosterOpeningScene";
import { preloadBoosterOpeningAssets } from "@/features/boosters/opening/boosterOpeningAssets";
import { useCardBackSrc } from "@/features/cosmetics/CardBackProvider";
import { DEFAULT_SHELF_ROLL, closedPackVariables, getBoosterPackVisual, getBoosterShelfRoll } from "@/features/boosters/opening/boosterPackVisuals";
import { drawTestBoosterCards } from "@/features/boosters/opening/testBoosterCards";
import { toOpeningRarity, type BoosterOpeningCard } from "@/features/boosters/opening/types";
import { BoosterContentsDialog } from "@/features/market/BoosterContentsDialog";
import { playButtonClick } from "@/lib/sound";

/** Type MIME du glisser-déposer d'une extension vers le plan d'ouverture. */
const DRAG_MIME = "text/tidebound-booster-id";

/**
 * Durée MINIMALE de la mise en tension sur le plan (tremblement, rotation,
 * reflet) avant que le sachet ne décolle vers le centre. Le tirage serveur
 * se fait pendant ce temps ; s'il est plus long, la tension dure d'autant.
 */
const DOCK_CHARGE_MS = 900;

/**
 * Rejouent la scène d'ouverture sur un tirage LOCAL, sans consommer de
 * booster ni toucher à la collection — pour régler l'animation sans devoir
 * s'acheter un paquet à chaque essai.
 */
const OPENING_TEST_BOOSTERS = [
  { boosterId: "standard", label: "Standard" },
  { boosterId: "welcome_tutorial", label: "Bienvenue" },
] as const;

/**
 * Rayons de l'étagère peinte (`boosters/etagere.webp`). Au-delà, elle
 * TOURNE : les flèches font descendre chaque rouleau d'un rayon, et celui
 * du bas repasse en haut (retour du 27/09/2026) — jamais de butée.
 */
const SHELF_SLOTS = 6;

/** Une ligne du rayon : l'extension, et ce que le joueur en possède. */
interface ShelfRow {
  extension: BoosterExtension;
  boosterId: string;
  /** Nom commercial, lu en base (`booster_definitions.name`). */
  name: string;
  owned: number;
  entry: BoosterInventoryEntry | null;
}

interface BoostersScreenProps {
  inventory: BoosterInventory;
  /**
   * LABORATOIRE : l'inventaire est fabriqué, l'ouverture doit l'être aussi.
   *
   * Sans ce drapeau, `/game/boosters-preview` affichait des compteurs
   * inventés (« ×7 ») sur un bouton câblé à la VRAIE Server Action : un
   * visiteur connecté y consommait ses propres boosters en croyant régler
   * une mise en page. L'ouverture passe donc par le tirage local, celui du
   * bouton « Tester l'animation » — aucune écriture, aucun exemplaire
   * consommé.
   */
  sandbox?: boolean;
}

/**
 * MES BOOSTERS — le rayon des extensions, et le plan où on les ouvre.
 * L'achat vit dans le Market (`/market`), écran séparé : acheter et ouvrir
 * sont deux gestes différents, à deux moments différents.
 *
 * LA TABLE (maquette du 27/09/2026) : sur la carte marine, l'étagère des
 * rouleaux à gauche, le sachet choisi posé au centre, sa fiche sur un
 * parchemin à droite. Scène à ratio fixe (1672 × 880, comme les Decks et
 * les Collectables) : positions en %, textes en cqw.
 *
 * TROIS ZONES (refonte du 19/09/2026) :
 *
 *   - à GAUCHE, le rayon : une ligne par extension qui EXISTE, possédée ou
 *     non. C'était la lacune de l'écran précédent — il ne montrait que la
 *     réserve, donc un joueur qui n'avait rien ne voyait rien, et personne
 *     ne pouvait savoir ce qui existait sans passer par le Market ;
 *   - au CENTRE, le plan : l'extension choisie y est posée. Grisée si on ne
 *     la possède pas — on peut la regarder sans l'avoir ;
 *   - à DROITE, sa fiche : d'où elle vient, ce qu'elle raconte, et ce qu'on
 *     peut en faire.
 *
 * Deux gestes, deux intentions : CLIQUER une extension la met au centre
 * pour la lire ; la GLISSER sur le plan l'ouvre. Un clic est trop facile à
 * donner par erreur pour consommer un sachet.
 *
 * L'ouverture est RÉELLE : `openBoosters` consomme l'exemplaire, tire les
 * cartes côté serveur et crédite la collection avant que la scène ne
 * commence. Le client n'a jamais la main sur le contenu — il ne fait que
 * l'afficher (cf. l'en-tête de `features/boosters/actions.ts`).
 */
export function BoostersScreen({ inventory, sandbox = false }: BoostersScreenProps) {
  const router = useRouter();

  /*
   * Le rayon vient du CODE (`BOOSTER_EXTENSIONS`), pas de la réserve : son
   * ordre et sa composition ne doivent pas dépendre de ce qu'on possède.
   * La base ne fournit que le nom, le prix et le compte — une extension
   * qu'elle ne connaît pas encore reste affichable, à zéro.
   */
  const rows = useMemo<ShelfRow[]>(
    () =>
      BOOSTER_EXTENSIONS.map((extension) => {
        const entry = inventory.boosters.find((booster) => booster.boosterId === extension.boosterId) ?? null;
        return {
          extension,
          boosterId: extension.boosterId,
          name: entry?.name ?? extension.boosterId,
          owned: entry?.owned ?? 0,
          entry,
        };
      }),
    [inventory.boosters]
  );

  /*
   * L'extension posée au centre. Contrairement à l'écran précédent, le plan
   * n'est JAMAIS vide : il y a toujours quelque chose à lire, même sans
   * rien posséder. On ouvre donc sur la première extension possédée, et à
   * défaut sur la première du rayon.
   */
  const [selectedId, setSelectedId] = useState<string>(
    () => rows.find((row) => row.owned > 0)?.boosterId ?? rows[0]?.boosterId ?? ""
  );
  const selected = rows.find((row) => row.boosterId === selectedId) ?? rows[0] ?? null;
  const ownsSelected = (selected?.owned ?? 0) > 0;

  /** Rotation de l'étagère : quelle extension occupe le premier rayon. */
  const [shelfOffset, setShelfOffset] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [isOver, setIsOver] = useState(false);
  const [isOpening, setIsOpening] = useState(false);
  const [contentsOf, setContentsOf] = useState<BoosterInventoryEntry | null>(null);
  const [toast, setToast] = useState<ScreenToastMessage | null>(null);
  const setError = (message: string | null) =>
    setToast(message ? { id: Date.now(), tone: "error", text: message } : null);
  /**
   * Ouverture en cours. Les cartes sont fixées une fois pour toutes à
   * l'ouverture, jamais retirées en cours de scène. `real` distingue une
   * vraie ouverture (exemplaire consommé, collection créditée) d'un essai
   * d'animation, qui n'a rien écrit.
   */
  const [opening, setOpening] = useState<{
    boosterId: string;
    cards: BoosterOpeningCard[];
    real: boolean;
    /** Où était le sachet sur le plan : la scène l'en fait partir. */
    origin: BoosterOpeningOrigin | null;
  } | null>(null);
  /** Sachet du plan d'ouverture — mesuré au lancement, pour que la scène le fasse décoller de là. */
  const dockPackRef = useRef<HTMLSpanElement>(null);
  /** Sachets à ouvrir d'un seul geste (1 = le geste habituel). */
  const [batchSize, setBatchSize] = useState(1);
  /**
   * Ouverture d'un LOT, en deux temps : le PREMIER sachet s'ouvre pour de
   * bon (`opening`, animation complète, cartes révélées une à une), puis
   * le récapitulatif du lot entier — liste à gauche, carte choisie en
   * grand à droite (`BoosterBatchRecap`).
   *
   * Posé EN MÊME TEMPS que `opening` au tirage, mais rendu seulement une
   * fois la scène du premier sachet refermée.
   */
  const [batch, setBatch] = useState<{
    boosterId: string;
    packs: number;
    lines: BoosterBatchLine[];
  } | null>(null);

  /** On ne peut ouvrir que ce qu'on possède, et jamais plus que la borne du lot. */
  const maxBatch = Math.max(1, Math.min(MAX_BATCH_OPEN, selected?.owned ?? 0));
  /**
   * La réserve dépasse ce qu'une ouverture peut prendre : « Tout » ne veut
   * alors PAS dire tout le stock, et le taire faisait passer la borne pour
   * un bug (retour de test du 18/09). Chaque sachet d'un lot est tiré et
   * écrit séparément (cf. `MAX_BATCH_OPEN`), donc on la dit.
   */
  const batchCapped = (selected?.owned ?? 0) > MAX_BATCH_OPEN;
  const busy = isOpening || opening !== null || batch !== null;
  /** Phrase entière du bouton d'ouverture — abrégée à l'écran sur un téléphone couché. */
  const openLabel = batchSize > 1 ? `Ouvrir ${batchSize} boosters` : "Ouvrir 1 booster";

  // Le rayon ne bouge pas, mais ce qu'on en possède si : après une
  // ouverture, l'extension choisie reste choisie — on veut voir sa réserve
  // descendre, pas se faire déplacer ailleurs.
  useEffect(() => {
    setSelectedId((current) => (rows.some((row) => row.boosterId === current) ? current : (rows[0]?.boosterId ?? "")));
  }, [rows]);

  // Changer d'extension remet la quantité dans ce que la nouvelle pile permet.
  useEffect(() => {
    setBatchSize((current) => Math.min(Math.max(1, current), maxBatch));
  }, [maxBatch]);

  // Images de la scène chargées et décodées en avance : l'ouverture démarre
  // sans flash. Seulement celle qu'on regarde ET qu'on possède (audit du
  // 24/09) : précharger tous les sachets de la réserve coûtait jusqu'à
  // 4 Mo à l'arrivée sur l'écran, pour des scènes qu'on n'ouvrira pas.
  // Changer d'extension précharge la suivante — le glisser-déposer la
  // sélectionne aussi, avant même le lâcher.
  const cardBack = useCardBackSrc();
  const preloadId = ownsSelected ? (selected?.boosterId ?? null) : null;
  useEffect(() => {
    if (!preloadId) return;
    void preloadBoosterOpeningAssets(getBoosterPackVisual(preloadId), cardBack);
  }, [preloadId, cardBack]);

  function select(boosterId: string) {
    playButtonClick();
    setError(null);
    setSelectedId(boosterId);
  }

  async function handleOpen(boosterId: string, quantity = 1) {
    if (busy) return;
    playButtonClick();
    setError(null);

    // LABORATOIRE : tirage local, rien n'est consommé ni écrit. Détourné
    // ICI et non au niveau du bouton, pour que le glisser-déposer — qui
    // ouvre lui aussi — passe par la même porte.
    if (sandbox) {
      const packs = Array.from({ length: quantity }, () => drawTestBoosterCards(boosterId));
      if (packs.length > 1) setBatch({ boosterId, packs: packs.length, lines: batchLines(packs) });
      setOpening({ boosterId, real: false, cards: packs[0] ?? [], origin: null });
      return;
    }

    setIsOpening(true);

    // Le sachet tremble, pivote et s'illumine sur le plan PENDANT que le
    // serveur tire les cartes : l'attente devient la montée en tension, et
    // l'animation dure au moins le temps d'être vue.
    const [result] = await Promise.all([
      openBoosters(boosterId, quantity).catch(() => ({
        ok: false as const,
        error: "Serveur injoignable — réessaie dans un instant.",
        data: undefined,
      })),
      new Promise((resolve) => setTimeout(resolve, DOCK_CHARGE_MS)),
    ]);
    const rect = dockPackRef.current?.getBoundingClientRect();
    setIsOpening(false);

    if (!result.ok || !result.data) {
      setError(result.error ?? "Ouverture impossible.");
      return;
    }

    const opened = result.data.packs;
    const first = opened[0];
    if (!first) {
      setError("Aucun booster n'a pu être ouvert.");
      return;
    }

    /** Les cartes d'un sachet, dans la forme qu'attend la scène d'ouverture. */
    const openingCards = (pack: (typeof opened)[number]): BoosterOpeningCard[] =>
      pack.cards.map((card) => ({
        // Une même carte peut sortir deux fois du même booster : c'est le
        // slot qui rend la clé unique, pas l'identifiant de carte.
        id: `${card.slotIndex}-${card.cardId}`,
        cardId: card.cardId,
        rarity: toOpeningRarity(card.rarity),
        isNew: card.isNew,
      }));

    const origin: BoosterOpeningOrigin | null =
      rect && rect.height > 0 ? { x: rect.left, y: rect.top, width: rect.width, height: rect.height } : null;

    // Lot : le premier sachet s'ouvre pour de bon, le résumé attend derrière.
    if (opened.length > 1) {
      setBatch({ boosterId, packs: opened.length, lines: batchLines(opened.map(openingCards)) });
      setOpening({ boosterId, real: true, origin, cards: openingCards(first) });
      return;
    }

    setOpening({ boosterId, real: true, origin, cards: openingCards(first) });
  }

  /** Ouverture À BLANC : un tirage local, aucun appel serveur, aucun booster consommé. */
  function handleTestOpen(boosterId: string) {
    if (isOpening || opening) return;
    playButtonClick();
    setError(null);
    setOpening({ boosterId, real: false, cards: drawTestBoosterCards(boosterId), origin: null });
  }

  /** Fin d'une ouverture en lot : l'exemplaire est consommé, on relit l'inventaire. */
  function handleBatchClosed() {
    setBatch(null);
    router.refresh();
  }

  function handleOpeningClosed() {
    const wasReal = opening?.real ?? false;
    setOpening(null);
    // Une ouverture réelle a consommé l'exemplaire et crédité la collection
    // côté base : on relit l'inventaire plutôt que de deviner le nouvel
    // état. Un essai d'animation n'a rien écrit — rien à relire.
    //
    // Sauf si un LOT attend derrière : c'était le premier sachet des cinq,
    // le résumé s'affiche maintenant et c'est lui qui relira en se fermant.
    if (wasReal && !batch) router.refresh();
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

  const totalOwned = rows.reduce((sum, row) => sum + row.owned, 0);
  const visibleRows = Array.from({ length: Math.min(SHELF_SLOTS, rows.length) }, (_, slot) => {
    const index = (((shelfOffset + slot) % rows.length) + rows.length) % rows.length;
    // Le « tour » change EXACTEMENT quand une extension repasse d'un bout à
    // l'autre du rayon : sa clé change, elle est remontée — elle entre en
    // fondu au lieu de traverser toute l'étagère.
    const lap = Math.floor((shelfOffset + slot) / rows.length);
    return { row: rows[index]!, slot, key: `${rows[index]!.boosterId}:${lap}` };
  });
  const canRotate = rows.length > SHELF_SLOTS;
  /** Ce que la fiche compte : cartes du lot que le joueur n'a pas encore. */
  const ownedCards = new Set(inventory.ownedCardIds);
  const toDiscover = selected?.entry ? new Set(selected.entry.pool.map((card) => card.cardId).filter((id) => !ownedCards.has(id))).size : null;

  function rotate(direction: 1 | -1) {
    playButtonClick();
    setShelfOffset((current) => current + direction);
  }

  return (
    <GameScreen active="boosters">
      <div className={styles.page}>
        <div
          className={styles.stage}
          data-plan={isOver ? "over" : ownsSelected ? "loaded" : "locked"}
          data-dragging={isDragging ? "true" : "false"}
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- décor peint, taille pilotée par la feuille */}
          <img src="/assets/boosters/decor-boussoles.webp" alt="" aria-hidden draggable={false} className={styles.decor} />

          {/* ── GAUCHE : l'étagère, une extension par rayon ─────────── */}
          <section className={styles.shelf} aria-label="Extensions">
            <header className={styles.shelfHead}>
              <h1 className={styles.shelfTitle}>Mes boosters</h1>
              <span className={styles.shelfCount}>{totalOwned} au total</span>
            </header>

            <ul className={styles.rolls} role="listbox" aria-label="Extensions" aria-activedescendant={`ext-${selectedId}`}>
              {visibleRows.map(({ row, slot, key }) => (
                <ShelfRoll
                  key={key}
                  row={row}
                  slot={slot}
                  selected={row.boosterId === selectedId}
                  busy={busy}
                  onSelect={() => select(row.boosterId)}
                  onDragStart={(event) => {
                    event.dataTransfer.setData(DRAG_MIME, row.boosterId);
                    event.dataTransfer.effectAllowed = "move";
                    setIsDragging(true);
                    // Glisser dit déjà laquelle : le centre la montre tout de suite.
                    setSelectedId(row.boosterId);
                  }}
                  onDragEnd={() => {
                    setIsDragging(false);
                    setIsOver(false);
                  }}
                />
              ))}
            </ul>

            {/* Plus d'extensions que de rayons : les flèches font TOURNER
                l'étagère — jamais de butée, on repart par l'autre bout. */}
            {canRotate && (
              <>
                <button type="button" className={styles.shelfArrow} data-side="up" onClick={() => rotate(1)} aria-label="Extension suivante" />
                <button type="button" className={styles.shelfArrow} data-side="down" onClick={() => rotate(-1)} aria-label="Extension précédente" />
              </>
            )}
          </section>

          {/* ── CENTRE : le sachet posé sur la carte, où on le lâche pour l'ouvrir ── */}
          <section
            className={styles.plan}
            data-state={isOver ? "over" : ownsSelected ? "loaded" : "locked"}
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
              const dropped = rows.find((row) => row.boosterId === boosterId);
              if (!dropped) return;
              setSelectedId(dropped.boosterId);
              // Déposer OUVRE : le sachet qu'on lâche sur le plan est déjà
              // un engagement. Une extension qu'on n'a pas ne s'ouvre pas.
              if (dropped.owned <= 0) {
                setError("Tu ne possèdes aucun exemplaire de cette extension.");
                return;
              }
              void handleOpen(dropped.boosterId);
            }}
          >
            {selected && (
              <span
                key={selected.boosterId}
                ref={dockPackRef}
                className={styles.planPack}
                style={closedPackVariables(getBoosterPackVisual(selected.boosterId))}
                data-locked={ownsSelected ? undefined : "true"}
                data-charging={isOpening || undefined}
                data-launched={opening !== null || undefined}
                aria-hidden
              />
            )}
            {/* Seulement quand il y a quelque chose à dire : le geste en
                cours, ou un sachet qu'on ne possède pas. */}
            {(isOpening || isDragging || isOver || !ownsSelected) && (
              <p className={styles.planState}>
                {isOpening ? "Ouverture…" : !ownsSelected ? "Non possédée" : "Lâche pour ouvrir"}
              </p>
            )}
            {ownsSelected && selected?.entry && selected.entry.packsSinceAbyssal >= PITY.rampStartsAfterPacks && (
              <p className={styles.planPity}>
                {selected.entry.packsSinceAbyssal} sans Abyssale
                {selected.entry.packsSinceAbyssal >= PITY.guaranteeAtPack - 1 ? " · garantie au prochain" : " · chance renforcée"}
              </p>
            )}
          </section>

          {/* ── DROITE : la fiche de l'extension, sur son parchemin ──── */}
          {selected && (
            <aside className={styles.panel} aria-label={`Extension ${selected.name}`}>
              <h2 className={styles.panelTitle}>{selected.name}</h2>
              <p className={styles.panelKind}>{boosterExtensionLabel(selected.boosterId)}</p>
              <Ornament className={styles.ruleTop} />

              <div className={styles.stats}>
                <span className={styles.stat}>
                  <span className={styles.statDiamond}>
                    <CardsIcon />
                    <span className={styles.statValue}>{selected.entry?.cardCount ?? "—"}</span>
                  </span>
                  <span className={styles.statLabel}>
                    Cartes
                    <small>par booster</small>
                  </span>
                </span>
                <span className={styles.stat}>
                  <span className={styles.statDiamond}>
                    {/* eslint-disable-next-line @next/next/no-img-element -- dos de carte équipé, en miniature */}
                    <img className={styles.statBack} src={cardBack} alt="" aria-hidden draggable={false} />
                    <span className={styles.statValue}>{toDiscover ?? "—"}</span>
                  </span>
                  <span className={styles.statLabel}>
                    À découvrir
                    <small>dans ce lot</small>
                  </span>
                </span>
              </div>

              <Ornament className={styles.ruleMid} />
              <p className={styles.panelLore}>{selected.extension.lore}</p>
              <Ornament className={styles.ruleLow} />

              <div className={styles.panelActions}>
                <button
                  type="button"
                  className={styles.plank}
                  onClick={() => {
                    playButtonClick();
                    if (selected.entry) setContentsOf(selected.entry);
                  }}
                  disabled={!selected.entry || selected.entry.pool.length === 0}
                >
                  Cartes de l&apos;extension
                </button>

                {/* Le Market reste ouvert quoi qu'il arrive : c'est la
                    seule sortie utile quand on ne possède rien. */}
                <Link href="/market" className={styles.plank} onClick={() => playButtonClick()}>
                  Aller au Market
                </Link>

                <div className={styles.openRow}>
                  <span className={`${styles.plank} ${styles.batchGroup}`} role="group" aria-label="Nombre de boosters à ouvrir">
                    <button
                      type="button"
                      className={styles.batchStep}
                      onClick={() => {
                        playButtonClick();
                        setBatchSize((current) => Math.max(1, current - 1));
                      }}
                      disabled={!ownsSelected || batchSize <= 1 || busy}
                      aria-label="Un booster de moins"
                    >
                      −
                    </button>
                    <span className={styles.batchCount} aria-live="polite">
                      {batchSize}
                    </span>
                    <button
                      type="button"
                      className={styles.batchStep}
                      onClick={() => {
                        playButtonClick();
                        setBatchSize((current) => Math.min(maxBatch, current + 1));
                      }}
                      disabled={!ownsSelected || batchSize >= maxBatch || busy}
                      aria-label="Un booster de plus"
                    >
                      +
                    </button>
                  </span>

                  <button
                    type="button"
                    className={`${styles.plank} ${styles.plankPrimary}`}
                    onClick={() => void handleOpen(selected.boosterId, batchSize)}
                    disabled={!ownsSelected || busy}
                    aria-label={openLabel}
                  >
                    {isOpening ? "Ouverture…" : openLabel}
                  </button>
                </div>

                {ownsSelected && maxBatch > 1 ? (
                  <button
                    type="button"
                    className={styles.openAll}
                    onClick={() => {
                      playButtonClick();
                      setBatchSize(maxBatch);
                    }}
                    disabled={batchSize >= maxBatch || busy}
                    title={
                      batchCapped
                        ? `${MAX_BATCH_OPEN} sachets au plus par ouverture — il t'en restera ${(selected?.owned ?? 0) - MAX_BATCH_OPEN}.`
                        : undefined
                    }
                  >
                    {batchCapped ? `Ouvrir le maximum (${maxBatch} par ouverture)` : `Tout ouvrir (${maxBatch})`}
                  </button>
                ) : !ownsSelected ? (
                  <p className={styles.panelLocked}>Aucun exemplaire — le Market en vend.</p>
                ) : null}
              </div>
            </aside>
          )}

          {/* Réglage de l'animation : un tirage local, sans booster ni
              écriture — le seul moyen de la revoir sans en acheter un. */}
          <span className={styles.testGroup} role="group" aria-label="Tester l’animation d’ouverture">
            <span className={styles.testLabel}>Tester l&apos;animation</span>
            {OPENING_TEST_BOOSTERS.map((test) => (
              <button
                key={test.boosterId}
                type="button"
                className={styles.testLink}
                onClick={() => handleTestOpen(test.boosterId)}
                disabled={opening !== null || isOpening}
              >
                {test.label}
              </button>
            ))}
          </span>
        </div>
      </div>

      <ScreenToast message={toast} onDismiss={() => setToast(null)} />

      {contentsOf && (
        <BoosterContentsDialog
          booster={contentsOf}
          owned={new Set(inventory.ownedCardIds)}
          onClose={() => setContentsOf(null)}
        />
      )}

      {/* Après la scène du premier sachet, jamais pendant : les deux sont
          posées au même instant au tirage (cf. `handleOpen`). */}
      {batch && !opening && <BoosterBatchRecap packs={batch.packs} lines={batch.lines} onClose={handleBatchClosed} />}

      {opening && (
        <BoosterOpeningScene
          cards={opening.cards}
          visual={getBoosterPackVisual(opening.boosterId)}
          origin={opening.origin}
          /* Un lot attend derrière : le bouton dit ce qui vient après, pour
             que l'enchaînement se lise au lieu de surprendre. */
          closeLabel={batch ? `Voir le bilan des ${batch.packs} sachets` : "Fermer"}
          onClose={handleOpeningClosed}
        />
      )}
    </GameScreen>
  );
}

/**
 * Une extension sur l'étagère : son ROULEAU peint (nom et « x » compris), et
 * le compte posé juste après le « x » — le même endroit sur tous les
 * rouleaux (54,5 % de la largeur, 64,5 % de la hauteur, mesuré le
 * 27/09/2026).
 *
 * Une `li` et non un `button` : le glisser-déposer natif d'un `<button>`
 * est capricieux selon les navigateurs (le bouton avale le `dragstart`),
 * et c'est le geste d'ouverture de cet écran. Le rôle, le `tabIndex` et la
 * gestion d'Entrée/Espace lui rendent le comportement d'un bouton.
 *
 * Une extension qu'on ne possède pas reste SÉLECTIONNABLE — on veut
 * pouvoir la lire avant de l'acheter. Seul le glisser lui est retiré.
 *
 * Extension sans rouleau peint (Poissons pas Frais, en attente d'asset) :
 * le rouleau du Défaut, son étiquette recouverte d'un parchemin qui porte
 * le vrai nom.
 */
function ShelfRoll({
  row,
  slot,
  selected,
  busy,
  onSelect,
  onDragStart,
  onDragEnd,
}: {
  row: ShelfRow;
  slot: number;
  selected: boolean;
  busy: boolean;
  onSelect: () => void;
  onDragStart: (event: React.DragEvent<HTMLLIElement>) => void;
  onDragEnd: () => void;
}) {
  const draggable = row.owned > 0 && !busy;
  const roll = getBoosterShelfRoll(row.boosterId);

  return (
    <li
      id={`ext-${row.boosterId}`}
      className={styles.roll}
      style={{ "--slot": slot, "--roll-art": `url("${roll ?? DEFAULT_SHELF_ROLL}")` } as React.CSSProperties}
      data-selected={selected ? "true" : "false"}
      data-owned={row.owned > 0 ? "true" : "false"}
      draggable={draggable}
      onDragStart={draggable ? onDragStart : undefined}
      onDragEnd={onDragEnd}
      onClick={onSelect}
      onKeyDown={(event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        onSelect();
      }}
      role="option"
      aria-selected={selected}
      aria-label={`${row.name} — ${row.owned > 0 ? `${row.owned} en réserve` : "aucun exemplaire"}`}
      tabIndex={0}
    >
      {!roll && (
        <span className={styles.rollLabel} aria-hidden>
          {row.name}
        </span>
      )}
      <span className={styles.rollCount} aria-hidden>
        {row.owned}
      </span>
    </li>
  );
}

/** Filet d'ornement de la fiche : deux traits et un losange de laiton. */
function Ornament({ className }: { className: string | undefined }) {
  return (
    <span className={`${styles.ornament} ${className ?? ""}`} aria-hidden>
      <svg viewBox="0 0 24 24" width="100%" height="100%">
        <path d="M12 3 L15 12 L12 21 L9 12 Z M3 12 L12 9 L21 12 L12 15 Z" fill="currentColor" />
      </svg>
    </span>
  );
}

/** Trois cartes en éventail — le compte de cartes d'un sachet. */
function CardsIcon() {
  return (
    <svg className={styles.statIcon} viewBox="0 0 40 40" fill="none" aria-hidden>
      <rect x="6" y="9" width="15" height="22" rx="2" transform="rotate(-14 13 20)" fill="#e9dcbc" stroke="#6b4a22" strokeWidth="1.2" />
      <rect x="12.5" y="7" width="15" height="22" rx="2" fill="#f2e6c8" stroke="#6b4a22" strokeWidth="1.2" />
      <rect x="19" y="9" width="15" height="22" rx="2" transform="rotate(14 26 20)" fill="#f7eed7" stroke="#6b4a22" strokeWidth="1.2" />
    </svg>
  );
}

/** Une ligne par carte du lot, doublons additionnés : ce que le récapitulatif liste. */
function batchLines(packs: readonly (readonly BoosterOpeningCard[])[]): BoosterBatchLine[] {
  const byCard = new Map<string, BoosterBatchLine>();
  for (const card of packs.flat()) {
    if (!card.cardId) continue;
    const line = byCard.get(card.cardId);
    if (line) {
      line.count += 1;
      line.isNew = line.isNew || Boolean(card.isNew);
    } else {
      byCard.set(card.cardId, { cardId: card.cardId, count: 1, isNew: Boolean(card.isNew), rarity: card.rarity });
    }
  }
  return [...byCard.values()];
}
