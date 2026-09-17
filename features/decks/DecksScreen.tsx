"use client";

import { useEffect, useMemo, useState, useTransition, type KeyboardEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { RULES } from "@/game";
import { deleteDecks, duplicateDeck, purgeDecks, renameDeck, restoreDecks, setDefaultDeck, type PlayerDeckSummary } from "@/app/decks/actions";
import type { DeckCatalogView } from "@/features/decks/catalogService";
import { DeckCatalogSection } from "@/features/decks/DeckCatalogSection";
import { DeleteDeckDialog } from "@/features/decks/DeleteDeckDialog";
import { DECK_TRASH_RETENTION_DAYS, daysLeftInTrash } from "@/features/decks/deckTrash";
import { Dialog } from "@/features/shell/Dialog";
import { GameScreen } from "@/features/shell/GameScreen";
import { SearchLine } from "@/features/shell/SearchLine";
import { ScreenToast, type ScreenToastMessage } from "@/features/shell/ScreenToast";
import { shipNameOf } from "@/features/ships/ShipPortrait";
import { ArtPlate } from "@/features/shell/ArtPlate";
import { plateArtUrl } from "@/features/decks/nameplateArt";
import game from "@/features/shell/GameScreen.module.css";
import styles from "@/features/decks/DecksList.module.css";
import { playButtonClick } from "@/lib/sound";

/** Insensible aux accents et à la casse. */
function normalizeSearch(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

/**
 * Les trois rayons de l'écran Decks (Notion « Progression joueur » §4 :
 * « ajouter au minimum les catégories Mes decks / Decks d'emprunt /
 * Préconstruits »).
 */
type DeckCategory = "mine" | "borrowed" | "precon";

const CATEGORY_LABELS: Record<DeckCategory, string> = {
  mine: "Mes decks",
  borrowed: "Decks d'emprunt",
  precon: "Préconstruits",
};

/**
 * Les trois étagères de « Mes decks » :
 *  - `built` : jouable tel quel (`is_valid`, recalculé par le serveur) ;
 *  - `draft` : en chantier — trop peu de cartes, ou une règle enfreinte ;
 *  - `trash` : « Récemment supprimés », restaurable pendant 30 jours.
 * Un deck n'est que sur UNE étagère : la corbeille l'emporte sur le reste.
 */
type DeckShelf = "built" | "draft" | "trash";

const SHELF_LABELS: Record<DeckShelf, string> = {
  built: "Construits",
  draft: "Brouillons",
  trash: "Récemment supprimés",
};

const SHELF_ORDER: readonly DeckShelf[] = ["built", "draft", "trash"];

function shelfOf(deck: PlayerDeckSummary): DeckShelf {
  if (deck.deletedAt) return "trash";
  return deck.isValid ? "built" : "draft";
}

interface DecksScreenProps {
  isSignedIn: boolean;
  initialDecks: PlayerDeckSummary[];
  /** Decks fournis par le jeu, avec la possession réelle du joueur. */
  catalog: DeckCatalogView;
}

/**
 * Mes decks — la même coquille que la Collection et l'éditeur. Chaque deck
 * est une tuile dont l'identité est son Navire (dans le cadre du plateau) ;
 * on lit le nom, le Navire, l'effectif et la validité (`is_valid`, recalculé
 * par le serveur à chaque sauvegarde — jamais estimé ici). Ouvrir mène à
 * l'éditeur ; dupliquer, renommer et supprimer restent sur place.
 *
 * Supprimer n'efface pas : le deck passe dans « Récemment supprimés », d'où
 * on le restaure d'un clic ou on l'efface pour de bon — cette dernière
 * action, la seule irréversible, est la seule à demander confirmation. Le
 * mode « Sélectionner » fait la même chose en lot, pour le ménage.
 */
export function DecksScreen({ isSignedIn, initialDecks, catalog }: DecksScreenProps) {
  const router = useRouter();
  // Le joueur qui n'a pas encore emprunté de deck arrive directement sur le
  // rayon d'emprunt : c'est l'étape qui lui manque pour jouer.
  const [category, setCategory] = useState<DeckCategory>(isSignedIn && catalog.borrowedDeckId === null ? "borrowed" : "mine");
  const [search, setSearch] = useState("");
  const [renameTarget, setRenameTarget] = useState<PlayerDeckSummary | null>(null);
  /** Effacement définitif en attente de confirmation — un ou plusieurs decks de la corbeille. */
  const [purgeTarget, setPurgeTarget] = useState<PlayerDeckSummary[] | null>(null);
  const [toast, setToast] = useState<ScreenToastMessage | null>(null);
  const [isPending, startTransition] = useTransition();

  const shelves = useMemo(() => {
    const byShelf: Record<DeckShelf, PlayerDeckSummary[]> = { built: [], draft: [], trash: [] };
    for (const deck of initialDecks) byShelf[shelfOf(deck)].push(deck);
    // Le deck par défaut ouvre l'étagère des construits : c'est celui qu'on joue.
    byShelf.built.sort((a, b) => Number(b.isDefault) - Number(a.isDefault));
    return byShelf;
  }, [initialDecks]);

  // On atterrit sur les decks construits ; s'il n'y en a aucun mais qu'un
  // brouillon attend, c'est lui qu'on montre — l'étagère vide n'aide pas.
  const [shelf, setShelf] = useState<DeckShelf>(() => (shelves.built.length === 0 && shelves.draft.length > 0 ? "draft" : "built"));

  /** Mode sélection multiple, et les identifiants cochés (limités à l'étagère courante). */
  const [selecting, setSelecting] = useState(false);
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(() => new Set());

  const shelfDecks = shelves[shelf];
  const decks = useMemo(() => {
    const query = normalizeSearch(search.trim());
    if (!query) return shelfDecks;
    return shelfDecks.filter((deck) => normalizeSearch(deck.name).includes(query));
  }, [shelfDecks, search]);

  // Un deck qui a quitté l'étagère (restauré, effacé, rafraîchi) quitte la sélection.
  useEffect(() => {
    setSelectedIds((current) => {
      const next = new Set(Array.from(current).filter((id) => shelfDecks.some((deck) => deck.id === id)));
      return next.size === current.size ? current : next;
    });
  }, [shelfDecks]);

  const selectedDecks = decks.filter((deck) => selectedIds.has(deck.id));
  const allVisibleSelected = decks.length > 0 && selectedDecks.length === decks.length;

  function notify(tone: ScreenToastMessage["tone"], text: string, action?: ScreenToastMessage["action"]) {
    setToast({ id: Date.now(), tone, text, action });
  }

  function changeShelf(next: DeckShelf) {
    if (next === shelf) return;
    playButtonClick();
    setShelf(next);
    setSelecting(false);
    setSelectedIds(new Set());
  }

  function toggleSelecting() {
    playButtonClick();
    setSelecting((current) => !current);
    setSelectedIds(new Set());
  }

  function toggleSelected(deckId: string) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(deckId)) next.delete(deckId);
      else next.add(deckId);
      return next;
    });
  }

  function selectAllVisible() {
    playButtonClick();
    setSelectedIds(allVisibleSelected ? new Set() : new Set(decks.map((deck) => deck.id)));
  }

  function handleRenameSubmit(name: string) {
    const deck = renameTarget;
    setRenameTarget(null);
    if (!deck || name.trim() === deck.name || !name.trim()) return;
    startTransition(async () => {
      const result = await renameDeck(deck.id, name);
      if (result.ok) router.refresh();
      else notify("error", result.error ?? "Renommage impossible.");
    });
  }

  function handleDuplicate(deckId: string) {
    playButtonClick();
    startTransition(async () => {
      const result = await duplicateDeck(deckId);
      if (result.ok) router.refresh();
      else notify("error", result.error ?? "Duplication impossible.");
    });
  }

  /** Deck par défaut : présélectionné à l'écran Jouer. Un seul, donc pas de « retirer » : on en choisit un autre. */
  function handleSetDefault(deck: PlayerDeckSummary) {
    playButtonClick();
    startTransition(async () => {
      const result = await setDefaultDeck(deck.id);
      if (!result.ok) {
        notify("error", result.error ?? "Impossible de choisir ce deck par défaut.");
        return;
      }
      notify("success", `« ${deck.name} » est ton deck par défaut : il t'attend à l'écran Jouer.`);
      router.refresh();
    });
  }

  /** Mise à la corbeille — récupérable : pas de confirmation, mais un « Annuler » sous la main. */
  function handleTrash(targets: PlayerDeckSummary[]) {
    if (targets.length === 0) return;
    playButtonClick();
    const ids = targets.map((deck) => deck.id);
    startTransition(async () => {
      const result = await deleteDecks(ids);
      if (!result.ok) {
        notify("error", result.error ?? "Suppression impossible.");
        return;
      }
      setSelecting(false);
      setSelectedIds(new Set());
      notify(
        "success",
        targets.length === 1 ? `« ${targets[0]!.name} » est dans Récemment supprimés.` : `${targets.length} decks sont dans Récemment supprimés.`,
        <button type="button" className={game.link} onClick={() => handleRestore(targets)}>
          Annuler
        </button>
      );
      router.refresh();
    });
  }

  function handleRestore(targets: PlayerDeckSummary[]) {
    if (targets.length === 0) return;
    playButtonClick();
    setToast(null);
    const ids = targets.map((deck) => deck.id);
    startTransition(async () => {
      const result = await restoreDecks(ids);
      if (!result.ok) {
        notify("error", result.error ?? "Restauration impossible.");
        return;
      }
      setSelecting(false);
      setSelectedIds(new Set());
      notify("success", targets.length === 1 ? `« ${targets[0]!.name} » est de retour.` : `${targets.length} decks sont de retour.`);
      router.refresh();
    });
  }

  /** Effacement définitif — seulement après le dialogue de confirmation. */
  function handleConfirmPurge() {
    const targets = purgeTarget;
    if (!targets || targets.length === 0) return;
    const ids = targets.map((deck) => deck.id);
    startTransition(async () => {
      const result = await purgeDecks(ids);
      setPurgeTarget(null);
      if (!result.ok) {
        notify("error", result.error ?? "Effacement impossible.");
        return;
      }
      setSelecting(false);
      setSelectedIds(new Set());
      notify("success", targets.length === 1 ? `« ${targets[0]!.name} » a été effacé.` : `${targets.length} decks ont été effacés.`);
      router.refresh();
    });
  }

  function handleTileKeyDown(event: KeyboardEvent<HTMLElement>, deckId: string) {
    if (event.key !== " " && event.key !== "Enter") return;
    event.preventDefault();
    toggleSelected(deckId);
  }

  const showsMine = category === "mine" && isSignedIn;
  const titleCount = decks.length !== shelfDecks.length ? `${decks.length} sur ${shelfDecks.length}` : `${shelfDecks.length}`;
  const title = !showsMine
    ? category === "mine"
      ? "Tes decks"
      : CATEGORY_LABELS[category]
    : shelf === "trash"
      ? `${titleCount} deck${shelfDecks.length > 1 ? "s" : ""} supprimé${shelfDecks.length > 1 ? "s" : ""}`
      : shelf === "draft"
        ? `${titleCount} brouillon${shelfDecks.length > 1 ? "s" : ""}`
        : `${titleCount} deck${shelfDecks.length > 1 ? "s" : ""} construit${shelfDecks.length > 1 ? "s" : ""}`;

  return (
    <GameScreen
      active="decks"
      actions={
        showsMine && shelfDecks.length > 0 ? (
          <div className={game.headerSearch}>
            <SearchLine variant="pill" value={search} onChange={setSearch} placeholder="Rechercher un deck…" label="Rechercher un deck" />
          </div>
        ) : undefined
      }
    >
      <div className={game.content}>
        <div className={game.contentWide}>
          <div className={game.pageHead}>
            <div>
              <p className={game.eyebrow}>Decks</p>
              <h1 className={game.title}>{title}</h1>
            </div>
            {showsMine && shelf !== "trash" && (
              <Link href="/decks/nouveau" className={game.primary} onClick={() => playButtonClick()}>
                + Créer un deck
              </Link>
            )}
          </div>

          {/* Les trois rayons. Un préconstruit verrouillé reste visible et
              consultable : c'est ce qui donne envie de dépenser un Jeton. */}
          <div className={game.chips} role="tablist" aria-label="Catégories de decks">
            {(Object.keys(CATEGORY_LABELS) as DeckCategory[]).map((key) => {
              const count =
                key === "mine" ? shelves.built.length + shelves.draft.length : key === "borrowed" ? catalog.borrowed.length : catalog.precon.length;
              return (
                <button
                  key={key}
                  type="button"
                  role="tab"
                  aria-selected={category === key}
                  className={category === key ? game.chipActive : game.chip}
                  onClick={() => {
                    playButtonClick();
                    setCategory(key);
                  }}
                >
                  {CATEGORY_LABELS[key]}
                  <span className={game.chipCount}>{count}</span>
                </button>
              );
            })}
          </div>

          {category !== "mine" ? (
            <>
              {/* Le déblocage à Jeton se fait au Market, rayon Decks : ici, les fiches. */}
              {category === "precon" && (
                <p className={game.muted}>
                  <Link href="/market" className={game.link} onClick={() => playButtonClick()}>
                    Débloquer un préconstruit au Market →
                  </Link>
                </p>
              )}
              <DeckCatalogSection catalog={catalog} kind={category} />
            </>
          ) : !isSignedIn ? (
            <div className={`${game.panel} ${game.empty} ${styles.fill}`}>
              <p className={game.emptyTitle}>Connecte-toi pour gérer tes decks</p>
              <p className={game.muted}>Tes decks sont enregistrés sur ton compte : ils te suivent d&apos;une partie à l&apos;autre.</p>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center", marginTop: 6 }}>
                <Link href="/connexion" className={game.primary} onClick={() => playButtonClick()}>
                  Se connecter
                </Link>
                <Link href="/inscription" className={game.secondary} onClick={() => playButtonClick()}>
                  Créer un compte
                </Link>
              </div>
            </div>
          ) : (
            <>
              {/* Les étagères de « Mes decks », et le mode sélection pour le ménage. */}
              <div className={styles.shelfBar}>
                <div className={game.segmented} role="tablist" aria-label="Étagères de mes decks">
                  {SHELF_ORDER.map((key) => (
                    <button
                      key={key}
                      type="button"
                      role="tab"
                      aria-selected={shelf === key}
                      className={shelf === key ? game.segmentActive : game.segment}
                      onClick={() => changeShelf(key)}
                    >
                      {SHELF_LABELS[key]}
                      <span className={styles.shelfCount}>{shelves[key].length}</span>
                    </button>
                  ))}
                </div>
                {shelfDecks.length > 0 && (
                  <button
                    type="button"
                    className={`${selecting ? game.tertiary : game.secondary} ${game.buttonSm}`}
                    aria-pressed={selecting}
                    onClick={toggleSelecting}
                  >
                    {selecting ? "Terminer la sélection" : "Sélectionner"}
                  </button>
                )}
              </div>

              {shelf === "trash" && shelfDecks.length > 0 && (
                <p className={`${game.muted} ${styles.shelfHint}`}>
                  Un deck supprimé reste ici {DECK_TRASH_RETENTION_DAYS} jours : restaure-le, ou efface-le définitivement. Passé ce délai, il
                  disparaît de lui-même.
                </p>
              )}

              {shelfDecks.length === 0 ? (
                <ShelfEmptyState shelf={shelf} hasDrafts={shelves.draft.length > 0} />
              ) : decks.length === 0 ? (
                <div className={`${game.panel} ${game.empty} ${styles.fill}`}>
                  <p className={game.emptyTitle}>Aucun deck ne correspond</p>
                  <p className={game.muted}>Essaie un autre nom, ou efface la recherche.</p>
                </div>
              ) : (
                <div className={styles.grid}>
                  {decks.map((deck) => {
                    const trashed = shelf === "trash";
                    const selected = selectedIds.has(deck.id);
                    const daysLeft = deck.deletedAt ? daysLeftInTrash(deck.deletedAt) : null;
                    return (
                      <article
                        key={deck.id}
                        className={[
                          game.panelRaised,
                          styles.tile,
                          selecting ? styles.tileSelectable : "",
                          selected ? styles.tileSelected : "",
                          trashed ? styles.tileTrashed : "",
                        ]
                          .filter(Boolean)
                          .join(" ")}
                        aria-label={deck.name}
                        role={selecting ? "checkbox" : undefined}
                        aria-checked={selecting ? selected : undefined}
                        tabIndex={selecting ? 0 : undefined}
                        onClick={selecting ? () => toggleSelected(deck.id) : undefined}
                        onKeyDown={selecting ? (event) => handleTileKeyDown(event, deck.id) : undefined}
                      >
                        <ArtPlate artUrl={plateArtUrl(deck.artCardId, deck.shipId)} className={styles.tilePlate}>
                          {selecting && (
                            <span className={styles.tileCheck} aria-hidden>
                              <span className={game.choiceBox} data-checked={selected ? "true" : "false"} />
                            </span>
                          )}
                          {trashed || selecting ? (
                            <span className={styles.tileTrashedName} title={deck.name}>
                              {deck.name}
                            </span>
                          ) : (
                            <button
                              type="button"
                              className={styles.tileName}
                              onClick={() => {
                                playButtonClick();
                                router.push(`/decks/${deck.id}`);
                              }}
                              title={deck.name}
                            >
                              {deck.name}
                            </button>
                          )}
                          <span className={styles.tileShip}>{shipNameOf(deck.shipId)}</span>
                        </ArtPlate>
                        <div className={styles.tileBody}>
                          <span className={styles.tileMeta}>
                            <span>
                              {deck.cardCount} / {RULES.DECK_SIZE_MAX} cartes
                            </span>
                            {trashed && daysLeft !== null ? (
                              <span className={game.tagDanger}>{daysLeft <= 1 ? "Effacé sous 24 h" : `Effacé dans ${daysLeft} j`}</span>
                            ) : deck.isValid ? (
                              <span className={game.tagSuccess}>Jouable</span>
                            ) : (
                              <span className={game.tagDanger}>{deck.cardCount < RULES.DECK_SIZE_MIN ? `Min. ${RULES.DECK_SIZE_MIN}` : "Non valide"}</span>
                            )}
                            {!trashed && deck.isDefault && (
                              <span className={game.tagCyan} title="Présélectionné à l'écran Jouer">
                                ★ Par défaut
                              </span>
                            )}
                          </span>
                          {!selecting && (
                            <div className={styles.tileActions}>
                              {trashed ? (
                                <>
                                  <button type="button" className={`${game.secondary} ${game.buttonSm}`} onClick={() => handleRestore([deck])} disabled={isPending}>
                                    Restaurer
                                  </button>
                                  <button
                                    type="button"
                                    className={`${game.dangerGhost} ${game.buttonSm}`}
                                    onClick={() => {
                                      playButtonClick();
                                      setPurgeTarget([deck]);
                                    }}
                                    disabled={isPending}
                                  >
                                    Effacer définitivement
                                  </button>
                                </>
                              ) : (
                                <>
                                  <Link href={`/decks/${deck.id}`} className={`${game.secondary} ${game.buttonSm}`} onClick={() => playButtonClick()}>
                                    Ouvrir
                                  </Link>
                                  <button type="button" className={game.link} onClick={() => setRenameTarget(deck)} disabled={isPending}>
                                    Renommer
                                  </button>
                                  <button type="button" className={game.link} onClick={() => handleDuplicate(deck.id)} disabled={isPending}>
                                    Dupliquer
                                  </button>
                                  {/* Seul un deck jouable peut être celui qu'on joue par défaut. */}
                                  {deck.isValid && !deck.isDefault && (
                                    <button type="button" className={game.link} onClick={() => handleSetDefault(deck)} disabled={isPending}>
                                      Par défaut
                                    </button>
                                  )}
                                  <button type="button" className={game.link} onClick={() => handleTrash([deck])} disabled={isPending}>
                                    Supprimer
                                  </button>
                                </>
                              )}
                            </div>
                          )}
                        </div>
                      </article>
                    );
                  })}

                  {!selecting && shelf !== "trash" && (
                    <Link href="/decks/nouveau" className={styles.newTile} onClick={() => playButtonClick()}>
                      <span className={styles.newTileMark} aria-hidden>
                        +
                      </span>
                      Nouveau deck
                    </Link>
                  )}
                </div>
              )}

              {selecting && shelfDecks.length > 0 && (
                <div className={styles.selectionBar} role="region" aria-label="Actions sur la sélection">
                  <div className={`${game.banner} ${styles.selectionBanner}`}>
                    <span className={game.bannerTitle}>
                      {selectedDecks.length} sélectionné{selectedDecks.length > 1 ? "s" : ""}
                    </span>
                    <button type="button" className={game.link} onClick={selectAllVisible}>
                      {allVisibleSelected ? "Tout désélectionner" : "Tout sélectionner"}
                    </button>
                    <div className={game.bannerActions}>
                      {shelf === "trash" ? (
                        <>
                          <button
                            type="button"
                            className={`${game.secondary} ${game.buttonSm}`}
                            onClick={() => handleRestore(selectedDecks)}
                            disabled={isPending || selectedDecks.length === 0}
                          >
                            Restaurer{selectedDecks.length > 0 ? ` (${selectedDecks.length})` : ""}
                          </button>
                          <button
                            type="button"
                            className={`${game.danger} ${game.buttonSm}`}
                            onClick={() => {
                              playButtonClick();
                              setPurgeTarget(selectedDecks);
                            }}
                            disabled={isPending || selectedDecks.length === 0}
                          >
                            Effacer définitivement{selectedDecks.length > 0 ? ` (${selectedDecks.length})` : ""}
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          className={`${game.danger} ${game.buttonSm}`}
                          onClick={() => handleTrash(selectedDecks)}
                          disabled={isPending || selectedDecks.length === 0}
                        >
                          Supprimer{selectedDecks.length > 0 ? ` (${selectedDecks.length})` : ""}
                        </button>
                      )}
                      <button type="button" className={`${game.ghost} ${game.buttonSm}`} onClick={toggleSelecting}>
                        Annuler
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      <ScreenToast message={toast} onDismiss={() => setToast(null)} />

      {renameTarget && <RenameDeckDialog deck={renameTarget} onSubmit={handleRenameSubmit} onCancel={() => setRenameTarget(null)} />}

      {purgeTarget && purgeTarget.length > 0 && (
        <DeleteDeckDialog
          deckNames={purgeTarget.map((deck) => deck.name)}
          permanent
          isDeleting={isPending}
          onConfirm={handleConfirmPurge}
          onCancel={() => setPurgeTarget(null)}
        />
      )}
    </GameScreen>
  );
}

/** État vide d'une étagère : dit ce qu'elle contiendrait, et où aller pour la remplir. */
function ShelfEmptyState({ shelf, hasDrafts }: { shelf: DeckShelf; hasDrafts: boolean }) {
  if (shelf === "trash") {
    return (
      <div className={`${game.panel} ${game.empty} ${styles.fill}`}>
        <p className={game.emptyTitle}>Rien dans Récemment supprimés</p>
        <p className={game.muted}>
          Un deck supprimé attend ici {DECK_TRASH_RETENTION_DAYS} jours avant de disparaître : le temps de changer d&apos;avis.
        </p>
      </div>
    );
  }
  if (shelf === "draft") {
    return (
      <div className={`${game.panel} ${game.empty} ${styles.fill}`}>
        <p className={game.emptyTitle}>Aucun brouillon</p>
        <p className={game.muted}>Un deck en chantier — trop peu de cartes, ou une règle enfreinte — se range ici jusqu&apos;à être jouable.</p>
        <Link href="/decks/nouveau" className={game.primary} onClick={() => playButtonClick()} style={{ marginTop: 6 }}>
          + Créer un deck
        </Link>
      </div>
    );
  }
  return (
    <div className={`${game.panel} ${game.empty} ${styles.fill}`}>
      <p className={game.emptyTitle}>Aucun deck construit</p>
      <p className={game.muted}>
        Un deck est construit dès qu&apos;il est jouable : entre {RULES.DECK_SIZE_MIN} et {RULES.DECK_SIZE_MAX} cartes, règles respectées.
        {hasDrafts ? " Tes brouillons t'attendent sur l'étagère d'à côté." : ""}
      </p>
      <Link href="/decks/nouveau" className={game.primary} onClick={() => playButtonClick()} style={{ marginTop: 6 }}>
        + Créer un deck
      </Link>
    </div>
  );
}

function RenameDeckDialog({ deck, onSubmit, onCancel }: { deck: PlayerDeckSummary; onSubmit: (name: string) => void; onCancel: () => void }) {
  const [name, setName] = useState(deck.name);
  const formId = `rename-${deck.id}`;

  return (
    <Dialog
      title="Renommer le deck"
      onClose={onCancel}
      actions={
        <>
          <button type="button" className={game.secondary} onClick={onCancel}>
            Annuler
          </button>
          <button type="submit" form={formId} className={game.primary} disabled={!name.trim()}>
            Renommer
          </button>
        </>
      }
    >
      <form
        id={formId}
        className={game.field}
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit(name);
        }}
      >
        <label className={game.fieldLabel} htmlFor={`${formId}-input`}>
          Nom du deck
        </label>
        <input id={`${formId}-input`} className={game.input} value={name} onChange={(event) => setName(event.target.value)} maxLength={60} autoFocus />
      </form>
    </Dialog>
  );
}
