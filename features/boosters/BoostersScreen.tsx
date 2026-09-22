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
import { BoosterBatchScene } from "@/features/boosters/opening/BoosterBatchScene";
import { BoosterOpeningScene, type BoosterOpeningOrigin } from "@/features/boosters/opening/BoosterOpeningScene";
import { preloadBoosterOpeningAssets } from "@/features/boosters/opening/boosterOpeningAssets";
import { useCardBackSrc } from "@/features/cosmetics/CardBackProvider";
import { closedPackVariables, getBoosterPackVisual } from "@/features/boosters/opening/boosterPackVisuals";
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
   * Ouverture d'un LOT, en trois temps : le PREMIER sachet s'ouvre pour de
   * bon (`opening`, animation complète, cartes révélées une à une), puis
   * cette scène-ci résume tout le lot — rangée de cartes alignées et « + »
   * pour le reste —, puis la liste complète à la demande.
   *
   * Posé EN MÊME TEMPS que `opening` au tirage, mais rendu seulement une
   * fois la scène du premier sachet refermée.
   */
  const [batch, setBatch] = useState<{
    boosterId: string;
    packs: number;
    cards: BoosterOpeningCard[];
    lines: BoosterBatchLine[];
  } | null>(null);
  const [recap, setRecap] = useState<{ packs: number; lines: BoosterBatchLine[] } | null>(null);

  /** On ne peut ouvrir que ce qu'on possède, et jamais plus que la borne du lot. */
  const maxBatch = Math.max(1, Math.min(MAX_BATCH_OPEN, selected?.owned ?? 0));
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
  // sans flash. Seulement ce qu'on possède — précharger un sachet qu'on ne
  // peut pas ouvrir ferait payer le réseau pour rien.
  const ownedIdsKey = rows.filter((row) => row.owned > 0).map((row) => row.boosterId).join(",");
  const cardBack = useCardBackSrc();
  useEffect(() => {
    if (!ownedIdsKey) return;
    for (const boosterId of ownedIdsKey.split(",")) {
      void preloadBoosterOpeningAssets(getBoosterPackVisual(boosterId), cardBack);
    }
  }, [ownedIdsKey, cardBack]);

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
      setOpening({ boosterId, real: false, cards: drawTestBoosterCards(boosterId), origin: null });
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
      const cards: BoosterOpeningCard[] = [];
      const byCard = new Map<string, BoosterBatchLine>();
      opened.forEach((pack, packIndex) => {
        for (const card of pack.cards) {
          cards.push({
            // Deux sachets peuvent rendre la même carte au même slot : l'index
            // du sachet fait partie de la clé.
            id: `${packIndex}-${card.slotIndex}-${card.cardId}`,
            cardId: card.cardId,
            rarity: toOpeningRarity(card.rarity),
            isNew: card.isNew,
          });
          const line = byCard.get(card.cardId);
          if (line) {
            line.count += 1;
            line.isNew = line.isNew || card.isNew;
          } else {
            byCard.set(card.cardId, {
              cardId: card.cardId,
              count: 1,
              isNew: card.isNew,
              rarity: toOpeningRarity(card.rarity),
            });
          }
        }
      });
      setBatch({ boosterId, packs: opened.length, cards, lines: [...byCard.values()] });
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

  return (
    <GameScreen active="boosters">
      <div
        className={styles.layout}
        data-plan={isOver ? "over" : ownsSelected ? "loaded" : "locked"}
        data-dragging={isDragging ? "true" : "false"}
      >
        {/*
         * LE DÉCOR, PLEIN CADRE — il passe DERRIÈRE les trois zones, qui
         * flottent dessus. C'est lui qui fait la scène : le rayon et la
         * fiche sont posés sur le ponton, ils ne l'encadrent pas.
         *
         * Le sachet et la plaque vivent ICI et pas dans la colonne du
         * milieu : tous deux se calent en pourcentage de l'ILLUSTRATION
         * (le socle, la plaque peinte), et une colonne de grille n'a pas
         * les mêmes bords qu'elle.
         */}
        {selected && (
          <div className={styles.scene}>
            <span
              ref={dockPackRef}
              className={styles.planPack}
              style={closedPackVariables(getBoosterPackVisual(selected.boosterId))}
              data-locked={ownsSelected ? undefined : "true"}
              data-charging={isOpening || undefined}
              data-launched={opening !== null || undefined}
              aria-hidden
            />
            {/*
             * La plaque RECOUVRE celle qui est peinte dans l'illustration
             * (« Glissez un booster ici ») : le décor ne peut pas dire
             * autre chose que l'état réel du plan. Le texte vit dans un
             * `span` — la plaque est un conteneur flex, où l'élision ne
             * s'applique pas, et un nom trop long y était rogné DES DEUX
             * CÔTÉS au lieu de se terminer par des points de suspension.
             */}
            <p className={styles.planPlate}>
              <span className={styles.planPlateText}>
                {isOpening
                  ? "Ouverture…"
                  : !ownsSelected
                    ? "Non possédée"
                    : isDragging || isOver
                      ? "Lâche pour ouvrir"
                      : selected.name}
              </span>
            </p>
            {ownsSelected && selected.entry && selected.entry.packsSinceAbyssal >= PITY.rampStartsAfterPacks && (
              <p className={styles.planPity}>
                {selected.entry.packsSinceAbyssal} sans Abyssale
                {selected.entry.packsSinceAbyssal >= PITY.guaranteeAtPack - 1
                  ? " · garantie au prochain"
                  : " · chance renforcée"}
              </p>
            )}
          </div>
        )}

        <div className={styles.zones}>
          {/* ── GAUCHE : le rayon, tout ce qui existe ─────────────── */}
          <section className={styles.shelf} aria-label="Extensions">
            <header className={styles.shelfHead}>
              <h1 className={styles.shelfTitle}>Mes boosters</h1>
              <span className={styles.shelfCount}>{totalOwned} au total</span>
            </header>

            <ul className={styles.shelfList} role="listbox" aria-label="Extensions" aria-activedescendant={`ext-${selectedId}`}>
              {rows.map((row) => (
                <ShelfEntry
                  key={row.boosterId}
                  row={row}
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
          </section>

          {/* ── CENTRE : le plan d'ouverture ──────────────────────── */}
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
              // un engagement. Une extension qu'on n'a pas ne s'ouvre pas —
              // le plan le dit en restant verrouillé.
              if (dropped.owned <= 0) {
                setError("Tu ne possèdes aucun exemplaire de cette extension.");
                return;
              }
              void handleOpen(dropped.boosterId);
            }}
          >
            {/* Zone de DEPOT, volontairement transparente : le socle est
                peint dans le decor plein cadre, juste derriere. Cette
                colonne ne fait que recevoir le sachet qu'on lache. */}
          </section>

          {/* ── DROITE : la fiche de l'extension ──────────────────── */}
          {selected && (
            <aside className={styles.panel} aria-label={`Extension ${selected.name}`}>
              {/* Seul le RÉCIT défile. Les actions restent posées au bas du
                  panneau : « Ouvrir » ne doit jamais tomber sous la ligne de
                  flottaison parce que le lore d'une extension est long. */}
              <div className={styles.panelBody}>
                <header className={styles.panelHead}>
                  <h2 className={styles.panelTitle}>{selected.name}</h2>
                  <p className={styles.panelKind}>{boosterExtensionLabel(selected.boosterId)}</p>
                </header>

                <span
                  className={styles.panelArt}
                  style={closedPackVariables(getBoosterPackVisual(selected.boosterId))}
                  data-locked={ownsSelected ? undefined : "true"}
                  aria-hidden
                />

                <p className={styles.panelTagline}>{selected.extension.tagline}</p>
                <p className={styles.panelLore}>{selected.extension.lore}</p>
              </div>

              <hr className={styles.panelRule} />

              <div className={styles.panelActions}>
                <button
                  type="button"
                  className={game.secondary}
                  onClick={() => {
                    playButtonClick();
                    if (selected.entry) setContentsOf(selected.entry);
                  }}
                  disabled={!selected.entry || selected.entry.pool.length === 0}
                >
                  Cartes de l&apos;extension
                </button>

                {/* Le Market reste ouvert quoi qu'il arrive : c'est la
                    seule sortie utile quand on ne possède rien, et un
                    réapprovisionnement quand on possède déjà. */}
                <Link href="/market" className={game.secondary} onClick={() => playButtonClick()}>
                  Aller au Market
                </Link>

                <div className={styles.openRow}>
                  <span className={styles.batchGroup} role="group" aria-label="Nombre de boosters à ouvrir">
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

                  {/* Le libellé long ne tient pas dans la fiche d'un
                      téléphone couché : le pas de quantité lui laisse
                      ~150 px et le bouton ne se coupe pas (`nowrap`). Il
                      garde donc deux écritures — la seconde n'est qu'un
                      « Ouvrir », le nombre étant déjà lu à sa gauche. Le
                      `aria-label` dit toujours la phrase entière. */}
                  <button
                    type="button"
                    className={game.primary}
                    onClick={() => void handleOpen(selected.boosterId, batchSize)}
                    disabled={!ownsSelected || busy}
                    aria-label={openLabel}
                  >
                    {isOpening ? (
                      "Ouverture…"
                    ) : (
                      <>
                        <span className={styles.openLabelFull}>{openLabel}</span>
                        <span className={styles.openLabelShort} aria-hidden>
                          Ouvrir
                        </span>
                      </>
                    )}
                  </button>
                </div>

                {ownsSelected && maxBatch > 1 && (
                  <button
                    type="button"
                    className={game.link}
                    onClick={() => {
                      playButtonClick();
                      setBatchSize(maxBatch);
                    }}
                    disabled={batchSize >= maxBatch || busy}
                  >
                    Tout ouvrir ({maxBatch})
                  </button>
                )}

                {!ownsSelected && (
                  <p className={styles.panelLocked}>
                    Tu n&apos;as aucun exemplaire de cette extension. Le Market en vend.
                  </p>
                )}
              </div>
            </aside>
          )}
        </div>

        <div className={styles.footRow}>
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
      {batch && !opening && (
        <BoosterBatchScene
          cards={batch.cards}
          packs={batch.packs}
          onShowAll={() => {
            setRecap({ packs: batch.packs, lines: batch.lines });
            handleBatchClosed();
          }}
          onClose={handleBatchClosed}
        />
      )}

      {recap && <BoosterBatchRecap packs={recap.packs} lines={recap.lines} onClose={() => setRecap(null)} />}

      {opening && (
        <BoosterOpeningScene
          cards={opening.cards}
          visual={getBoosterPackVisual(opening.boosterId)}
          origin={opening.origin}
          onClose={handleOpeningClosed}
        />
      )}
    </GameScreen>
  );
}

/**
 * Une extension sur le rayon : sa vignette, son nom, ce qu'on en possède.
 *
 * Une `li` et non un `button` : le glisser-déposer natif d'un `<button>`
 * est capricieux selon les navigateurs (le bouton avale le `dragstart`),
 * et c'est le geste d'ouverture de cet écran. Le rôle, le `tabIndex` et la
 * gestion d'Entrée/Espace lui rendent le comportement d'un bouton pour qui
 * ne glisse pas.
 *
 * Une extension qu'on ne possède pas reste SÉLECTIONNABLE — c'est tout
 * l'intérêt de la montrer : on veut pouvoir la lire avant de l'acheter.
 * Seul le glisser lui est retiré, puisqu'il n'y a rien à ouvrir.
 */
function ShelfEntry({
  row,
  selected,
  busy,
  onSelect,
  onDragStart,
  onDragEnd,
}: {
  row: ShelfRow;
  selected: boolean;
  busy: boolean;
  onSelect: () => void;
  onDragStart: (event: React.DragEvent<HTMLLIElement>) => void;
  onDragEnd: () => void;
}) {
  const draggable = row.owned > 0 && !busy;

  return (
    <li
      id={`ext-${row.boosterId}`}
      className={styles.shelfEntry}
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
      tabIndex={0}
      title={row.owned > 0 ? `${row.name} — ${row.owned} en réserve` : `${row.name} — aucun exemplaire`}
    >
      <span
        className={styles.shelfEntryArt}
        style={closedPackVariables(getBoosterPackVisual(row.boosterId))}
        data-stacked={row.owned > 1 ? "true" : undefined}
        aria-hidden
      />
      <span className={styles.shelfEntryText}>
        <span className={styles.shelfEntryName}>{row.name}</span>
        <span className={styles.shelfEntryCount}>
          <PackIcon />
          {`x ${row.owned}`}
        </span>
      </span>
      <span className={styles.shelfEntryChevron} aria-hidden>
        ›
      </span>
    </li>
  );
}

/** Le pictogramme de sachet du compteur — deux cartes empilées. */
function PackIcon() {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" fill="none" aria-hidden>
      <rect x="2.5" y="2.5" width="8" height="11" rx="1.2" stroke="currentColor" strokeWidth="1.2" />
      <path d="M12.5 4.2v8.3a1.2 1.2 0 0 1-1.2 1.2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}
