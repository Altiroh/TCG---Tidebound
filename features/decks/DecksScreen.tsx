"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { RULES, ownershipLabel } from "@/game";
import {
  copyDeck,
  deleteDecks,
  duplicateDeck,
  purgeDecks,
  renameDeck,
  restoreDecks,
  setDeckArt,
  setDeckFavorite,
  setDefaultDeck,
  updateDeckProfile,
  type PlayerDeckSummary,
} from "@/app/decks/actions";
import { chooseFreePreconDeck, unlockPreconstructedDeck } from "@/features/decks/catalogActions";
import type { DeckCatalogView } from "@/features/decks/catalogService";
import {
  ORIGIN_LABELS,
  catalogEntries,
  mineEntries,
  sizeLabel,
  type BrowserDeck,
  type DeckCategory,
} from "@/features/decks/deckEntries";
import {
  DECK_SORTS,
  decodeDeckFilters,
  EMPTY_FILTERS,
  encodeDeckFilters,
  filterDecks,
  hasActiveFilter,
  relativeDate,
  sortDecks,
  styleFilterOf,
  type DeckFilterState,
  type DeckSortId,
  type StyleFilterId,
} from "@/features/decks/deckFilters";
import { DeckArtPicker } from "@/features/decks/DeckArtPicker";
import { DeckPreviewPanel } from "@/features/decks/DeckPreviewPanel";
import { DeckProfileDialog, type DeckProfileDraft } from "@/features/decks/DeckProfileDialog";
import { DeckRail, type RailCategory, type RailShelf } from "@/features/decks/DeckRail";
import { DeckSheet } from "@/features/decks/DeckSheet";
import { DeckTable, type TableTab } from "@/features/decks/DeckTable";
import tableStyles from "@/features/decks/DeckTable.module.css";
import { DeleteDeckDialog } from "@/features/decks/DeleteDeckDialog";
import { DECK_TRASH_RETENTION_DAYS } from "@/features/decks/deckTrash";
import { notifyProgressionChanged } from "@/features/progression/progressionSync";
import { Dialog } from "@/features/shell/Dialog";
import { GameScreen } from "@/features/shell/GameScreen";
import { ScreenToast, type ScreenToastMessage } from "@/features/shell/ScreenToast";
import { shipNameOf } from "@/features/ships/ShipPortrait";
import game from "@/features/shell/GameScreen.module.css";
import styles from "@/features/decks/DecksList.module.css";
import { playButtonClick } from "@/lib/sound";
import { oneOf } from "@/lib/persistCodecs";
import { usePersistedState } from "@/lib/persistedState";

/*
 * Les rayons, dans l'ordre de la colonne de gauche. « Tous les decks »
 * ouvre la marche : c'est de là qu'on voit d'un coup tout ce qu'on peut
 * jouer, chaque deck portant la pastille de sa provenance.
 *
 * UN SEUL RAYON FOURNI depuis le 22/09/2026 : « Decks d'emprunt » et
 * « Préconstruits » étaient deux catégories pour le même objet, qui ne se
 * distinguaient que par la porte d'entrée — le premier gratuit, les
 * suivants à un Jeton. L'écran Jouer emploie le même mot.
 */
const CATEGORY_LABELS: Record<DeckCategory, string> = {
  all: "Tous les decks",
  mine: "Mes decks",
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

/** Grille de vignettes, ou liste détaillée : le même rayon, deux façons de le parcourir. */
type DeckView = "grid" | "list";

/** Nouvel affichage (la table, maquette du 25/09/2026) ou l'ancien, le temps de valider. */
type DeckLayout = "table" | "classic";

interface DecksScreenProps {
  isSignedIn: boolean;
  initialDecks: PlayerDeckSummary[];
  /** Ids des decks joués récemment, du plus récent au plus ancien (onglet « Récemment joués »). */
  recentDeckIds?: string[];
  /**
   * Favoris du COMPTE (`player_deck_favorites`). `null` : hors connexion ou
   * table absente — les favoris restent alors ceux de l'appareil.
   */
  accountFavorites?: string[] | null;
  /** Decks fournis par le jeu, avec la possession réelle du joueur. */
  catalog: DeckCatalogView;
}

/**
 * MES DECKS — trois colonnes : où l'on est, ce qu'on parcourt, ce qu'on
 * regarde.
 *
 * À GAUCHE le rayon et les filtres (`DeckRail`) : ils décident du contenu
 * de la grille sans jamais s'y mélanger. AU MILIEU la grille — des
 * vignettes carrées pour reconnaître un deck à son image, ou une liste
 * quand on veut comparer des chiffres. À DROITE la fiche du deck pointé
 * (`DeckPreviewPanel`), qui porte TOUTES les actions : ouvrir, renommer,
 * dupliquer, supprimer, et le début de la liste de cartes.
 *
 * Les deux rayons — les miens, les préconstruits — passent par
 * la même forme (`BrowserDeck`) : ils se trient et se filtrent ensemble,
 * seules les actions de la fiche changent. Le déblocage d'un deck fourni
 * garde sa fiche complète en fenêtre (`DeckSheet`), qui existait déjà et
 * sait tout dire avant de dépenser un Jeton.
 *
 * Supprimer n'efface pas : le deck passe dans « Récemment supprimés », d'où
 * on le restaure d'un clic ou on l'efface pour de bon — cette dernière
 * action, la seule irréversible, est la seule à demander confirmation.
 */
export function DecksScreen({ isSignedIn, initialDecks, catalog, recentDeckIds = [], accountFavorites = null }: DecksScreenProps) {
  const router = useRouter();
  // Le joueur qui n'a pas encore pris son préconstruit gratuit arrive
  // directement sur le rayon : c'est l'étape qui lui manque pour jouer.
  const [category, setCategory] = useState<DeckCategory>(isSignedIn && catalog.freeDeckId === null ? "precon" : "mine");
  // Filtres, tri et vue MÉMORISÉS sur l'appareil (`lib/persistedState.ts`).
  const [filters, setFilters] = usePersistedState<DeckFilterState>("decks", EMPTY_FILTERS, {
    encode: encodeDeckFilters,
    decode: decodeDeckFilters,
  });
  const [sort, setSort] = usePersistedState<DeckSortId>("decks:tri", "updated", {
    decode: (raw) => oneOf(DECK_SORTS.map((option) => option.id), raw),
  });
  const [view, setView] = usePersistedState<DeckView>("decks:vue", "grid", {
    decode: (raw) => oneOf<DeckView>(["grid", "list"], raw),
  });
  const [currentId, setCurrentId] = useState<string | null>(null);
  // Bascule ancien / nouvel affichage, mémorisée sur l'appareil.
  const [layout, setLayout] = usePersistedState<DeckLayout>("decks:affichage", "table", {
    decode: (raw) => oneOf<DeckLayout>(["table", "classic"], raw),
  });
  const [tableTab, setTableTab] = useState<TableTab>(isSignedIn && catalog.freeDeckId === null ? "precon" : "mine");
  const [tableTrash, setTableTrash] = useState(false);
  // Favoris de l'APPAREIL : le repli hors connexion (ou sans la table en base).
  const [localFavorites, setLocalFavorites] = usePersistedState<ReadonlySet<string>>("decks:favoris", new Set<string>(), {
    encode: (value) => Array.from(value),
    decode: (raw) => (Array.isArray(raw) ? new Set(raw.filter((id): id is string => typeof id === "string")) : undefined),
  });
  // Favoris du COMPTE : ils suivent le joueur d'un appareil à l'autre.
  const onAccount = accountFavorites !== null;
  const [accountSet, setAccountSet] = useState<ReadonlySet<string>>(() => new Set(accountFavorites ?? []));
  const favorites = onAccount ? accountSet : localFavorites;

  // Première visite connectée : les favoris gardés sur cet appareil passent sur le compte, une fois.
  useEffect(() => {
    if (!onAccount || localFavorites.size === 0) return;
    const missing = Array.from(localFavorites).filter((id) => !accountSet.has(id));
    setLocalFavorites(new Set());
    if (missing.length === 0) return;
    setAccountSet((current) => new Set([...current, ...missing]));
    void Promise.all(missing.map((id) => setDeckFavorite(id, true)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onAccount, localFavorites.size]);

  function toggleFavorite(id: string) {
    if (!onAccount) {
      setLocalFavorites((value) => {
        const next = new Set(value);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      });
      return;
    }
    const favorite = !accountSet.has(id);
    const apply = (on: boolean) =>
      setAccountSet((current) => {
        const next = new Set(current);
        if (on) next.add(id);
        else next.delete(id);
        return next;
      });
    // Tout de suite à l'écran ; en cas d'échec, l'étoile revient et on le dit.
    apply(favorite);
    void setDeckFavorite(id, favorite).then((result) => {
      if (result.ok) return;
      apply(!favorite);
      setToast({ id: Date.now(), tone: "error", text: result.error ?? "Favori non enregistré." });
    });
  }

  const [renameTarget, setRenameTarget] = useState<BrowserDeck | null>(null);
  const [purgeTarget, setPurgeTarget] = useState<BrowserDeck | null>(null);
  const [artTarget, setArtTarget] = useState<BrowserDeck | null>(null);
  const [profileTarget, setProfileTarget] = useState<BrowserDeck | null>(null);
  const [catalogTarget, setCatalogTarget] = useState<BrowserDeck | null>(null);
  /** Deck du jeu à copier alors qu'il manque des cartes : l'avertissement est ouvert. */
  const [copyTarget, setCopyTarget] = useState<BrowserDeck | null>(null);
  const [catalogError, setCatalogError] = useState<string | null>(null);
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

  /** Le rayon courant, avant filtrage : c'est lui qui décide des cases à proposer. */
  const shelfDecks = useMemo<BrowserDeck[]>(() => {
    if (category === "mine") return mineEntries(shelves[shelf]);
    if (category !== "all") return catalogEntries(catalog);
    /*
     * TOUT ce qui se joue, dans l'ordre de ce qu'on possède : ses propres
     * decks (la corbeille exceptée — un deck supprimé ne se joue pas), puis
     * les préconstruits.
     */
    return [...mineEntries([...shelves.built, ...shelves.draft]), ...catalogEntries(catalog)];
  }, [category, shelf, shelves, catalog]);

  const decks = useMemo(() => sortDecks(filterDecks(shelfDecks, filters), sort), [shelfDecks, filters, sort]);

  /** Les decks de la TABLE (nouvel affichage) : onglet, recherche et tri — pas les filtres de la colonne de l'ancien écran. */
  const tableDecks = useMemo<BrowserDeck[]>(() => {
    const everything = [...mineEntries([...shelves.built, ...shelves.draft]), ...catalogEntries(catalog)];
    const search = { ...EMPTY_FILTERS, search: filters.search };
    if (tableTab === "recent") {
      const byId = new Map(everything.map((deck) => [deck.id, deck]));
      const played = recentDeckIds.map((id) => byId.get(id)).filter((deck): deck is BrowserDeck => Boolean(deck));
      return filterDecks(played, search);
    }
    const base =
      tableTab === "mine"
        ? mineEntries(tableTrash ? shelves.trash : [...shelves.built, ...shelves.draft])
        : tableTab === "precon"
          ? catalogEntries(catalog)
          : everything.filter((deck) => favorites.has(deck.id));
    return sortDecks(filterDecks(base, search), sort);
  }, [tableTab, tableTrash, shelves, catalog, filters.search, sort, favorites, recentDeckIds]);

  const availableStyles = useMemo<ReadonlySet<StyleFilterId>>(
    () => new Set(shelfDecks.filter((deck) => deck.style).map((deck) => styleFilterOf(deck.style))),
    [shelfDecks]
  );

  const availableShips = useMemo(() => {
    const seen: string[] = [];
    for (const deck of shelfDecks) if (!seen.includes(deck.shipId)) seen.push(deck.shipId);
    return seen.sort((a, b) => shipNameOf(a).localeCompare(shipNameOf(b), "fr"));
  }, [shelfDecks]);

  /**
   * Le deck POINTÉ. Le premier de la liste par défaut, et on y retombe dès
   * que celui qu'on regardait quitte l'écran (filtré, supprimé, restauré) :
   * une fiche vide à côté d'une grille pleine n'apprend rien.
   */
  const current =
    layout === "table"
      ? (tableDecks.find((deck) => deck.id === currentId) ?? tableDecks[0] ?? null)
      : (decks.find((deck) => deck.id === currentId) ?? decks[0] ?? null);

  useEffect(() => {
    if (current && current.id !== currentId) setCurrentId(current.id);
    if (!current && currentId !== null) setCurrentId(null);
  }, [current, currentId]);

  const mineCount = shelves.built.length + shelves.draft.length;
  const categories: RailCategory[] = [
    { id: "all", label: CATEGORY_LABELS.all, count: mineCount + catalog.decks.length },
    { id: "mine", label: CATEGORY_LABELS.mine, count: mineCount },
    { id: "precon", label: CATEGORY_LABELS.precon, count: catalog.decks.length },
  ];

  const railShelves: RailShelf[] =
    category === "mine" && isSignedIn ? SHELF_ORDER.map((id) => ({ id, label: SHELF_LABELS[id], count: shelves[id].length })) : [];

  const trashed = layout === "table" ? tableTab === "mine" && tableTrash : category === "mine" && shelf === "trash";

  function notify(tone: ScreenToastMessage["tone"], text: string, action?: ScreenToastMessage["action"]) {
    setToast({ id: Date.now(), tone, text, action });
  }

  function act(label: string, run: () => Promise<{ ok: boolean; error?: string }>, done?: () => void) {
    startTransition(async () => {
      const result = await run();
      if (!result.ok) {
        notify("error", result.error ?? `${label} impossible.`);
        return;
      }
      done?.();
      router.refresh();
    });
  }

  function handleRenameSubmit(name: string) {
    const deck = renameTarget;
    setRenameTarget(null);
    if (!deck || !name.trim() || name.trim() === deck.name) return;
    act("Renommage", () => renameDeck(deck.id, name));
  }

  function handleDuplicate(deck: BrowserDeck) {
    playButtonClick();
    act("Duplication", () => duplicateDeck(deck.id));
  }

  /**
   * COPIER un deck du jeu dans ses decks : seules les cartes possédées
   * suivent. S'il en manque, on le dit AVANT — la copie n'est alors qu'une
   * base, à compléter dans l'éditeur, qui s'ouvre dessus.
   */
  function handleCopy(deck: BrowserDeck) {
    playButtonClick();
    if (deck.catalog && !deck.catalog.ownership.complete) {
      setCopyTarget(deck);
      return;
    }
    runCopy(deck);
  }

  function runCopy(deck: BrowserDeck) {
    setCopyTarget(null);
    startTransition(async () => {
      const result = await copyDeck(deck.id);
      if (!result.ok || !result.id) {
        notify("error", result.error ?? "Copie impossible.");
        return;
      }
      router.push(`/decks/${result.id}`);
    });
  }

  /** Deck par défaut : présélectionné à l'écran Jouer. Un seul, donc pas de « retirer » : on en choisit un autre. */
  function handleSetDefault(deck: BrowserDeck) {
    playButtonClick();
    act("Choix du deck par défaut", () => setDefaultDeck(deck.id), () =>
      notify("success", `« ${deck.name} » est ton deck par défaut : il t'attend à l'écran Jouer.`)
    );
  }

  /** Mise à la corbeille — récupérable : pas de confirmation, mais un « Annuler » sous la main. */
  function handleTrash(deck: BrowserDeck) {
    playButtonClick();
    act("Suppression", () => deleteDecks([deck.id]), () =>
      notify(
        "success",
        `« ${deck.name} » est dans Récemment supprimés.`,
        <button type="button" className={game.link} onClick={() => handleRestore(deck)}>
          Annuler
        </button>
      )
    );
  }

  function handleRestore(deck: BrowserDeck) {
    playButtonClick();
    setToast(null);
    act("Restauration", () => restoreDecks([deck.id]), () => notify("success", `« ${deck.name} » est de retour.`));
  }

  /** Effacement définitif — seulement après le dialogue de confirmation. */
  function handleConfirmPurge() {
    const deck = purgeTarget;
    if (!deck) return;
    setPurgeTarget(null);
    act("Effacement", () => purgeDecks([deck.id]), () => notify("success", `« ${deck.name} » a été effacé.`));
  }

  function handleArtChosen(cardId: string | null) {
    const deck = artTarget;
    setArtTarget(null);
    if (!deck) return;
    act("Changement d'illustration", () => setDeckArt(deck.id, cardId));
  }

  function handleProfileSubmit(draft: DeckProfileDraft) {
    const deck = profileTarget;
    setProfileTarget(null);
    if (!deck) return;
    act("Enregistrement du profil", () => updateDeckProfile(deck.id, draft), () =>
      notify("success", `Le profil de « ${deck.name} » est à jour.`)
    );
  }

  /** Déblocage d'un préconstruit : le premier est gratuit, les suivants coûtent un Jeton. */
  function handleUnlock(deck: BrowserDeck) {
    playButtonClick();
    setCatalogError(null);
    const gratuit = catalog.freeDeckId === null;
    startTransition(async () => {
      const result = gratuit ? await chooseFreePreconDeck(deck.id) : await unlockPreconstructedDeck(deck.id);
      if (!result.ok) {
        setCatalogError(result.error ?? "Action impossible.");
        return;
      }
      notifyProgressionChanged();
      setCatalogTarget(null);
      router.refresh();
    });
  }

  /** « Essayer » : une partie contre le bot avec le deck entièrement prêté. */
  function handleTry(deck: BrowserDeck) {
    playButtonClick();
    router.push(`/partie?essai=${encodeURIComponent(deck.id)}`);
  }

  /** Les fenêtres (renommer, effacer, fiche du catalogue…), communes aux deux affichages. */
  function renderDialogs() {
    return (
      <>
      {renameTarget && <RenameDeckDialog deck={renameTarget} onSubmit={handleRenameSubmit} onCancel={() => setRenameTarget(null)} />}

      {artTarget && (
        <DeckArtPicker
          cardIds={artTarget.cards.flatMap((card) => Array.from({ length: card.quantity }, () => card.cardId))}
          artCardId={artTarget.mine?.artCardChosen ?? null}
          onChoose={handleArtChosen}
          onClose={() => setArtTarget(null)}
        />
      )}

      {profileTarget && (
        <DeckProfileDialog deck={profileTarget} busy={isPending} onSubmit={handleProfileSubmit} onCancel={() => setProfileTarget(null)} />
      )}

      {purgeTarget && (
        <DeleteDeckDialog
          deckNames={[purgeTarget.name]}
          permanent
          isDeleting={isPending}
          onConfirm={handleConfirmPurge}
          onCancel={() => setPurgeTarget(null)}
        />
      )}

      {copyTarget?.catalog && (
        <CopyDeckDialog deck={copyTarget} busy={isPending} onConfirm={() => runCopy(copyTarget)} onCancel={() => setCopyTarget(null)} />
      )}

      {catalogTarget?.catalog && catalogTarget.kind !== "mine" && (
        <DeckSheet
          deck={catalogTarget.catalog.deck}
          ownership={catalogTarget.catalog.ownership}
          unlocked={catalogTarget.catalog.unlocked}
          tokens={catalog.preconTokens}
          freeChoiceAvailable={catalog.freeDeckId === null}
          busy={isPending}
          error={catalogError}
          onUnlock={() => handleUnlock(catalogTarget)}
          onTry={() => handleTry(catalogTarget)}
          onClose={() => {
            setCatalogTarget(null);
            setCatalogError(null);
          }}
        />
      )}
      </>
    );
  }

  const layoutToggle = (
    <button
      type="button"
      className={tableStyles.layoutToggle}
      onClick={() => {
        playButtonClick();
        setLayout(layout === "table" ? "classic" : "table");
        setCurrentId(null);
      }}
    >
      {layout === "table" ? "Ancien affichage" : "Nouvel affichage"}
    </button>
  );

  const dialogs = renderDialogs();

  if (layout === "table") {
    return (
      <GameScreen active="decks" className={tableStyles.screen}>
        <DeckTable
          tab={tableTab}
          onTab={(next) => {
            setTableTab(next);
            setTableTrash(false);
            setCurrentId(null);
          }}
          decks={tableDecks}
          current={current}
          onSelect={setCurrentId}
          sort={sort}
          onSort={setSort}
          search={filters.search}
          onSearch={(search) => setFilters({ ...filters, search })}
          favorites={favorites}
          onToggleFavorite={toggleFavorite}
          canCreate={tableTab === "mine" && isSignedIn && !tableTrash}
          trashed={trashed}
          trash={
            tableTab === "mine" && isSignedIn && (shelves.trash.length > 0 || tableTrash)
              ? {
                  count: shelves.trash.length,
                  active: tableTrash,
                  onToggle: () => {
                    playButtonClick();
                    setTableTrash((value) => !value);
                    setCurrentId(null);
                  },
                }
              : null
          }
          emptyLabel={tableEmptyLabel(tableTab, isSignedIn, tableTrash, filters.search)}
          busy={isPending}
          onRename={setRenameTarget}
          onDuplicate={handleDuplicate}
          onTrash={handleTrash}
          onRestore={handleRestore}
          onPurge={(deck) => {
            playButtonClick();
            setPurgeTarget(deck);
          }}
          onOpenCatalogSheet={(deck) => {
            playButtonClick();
            setCatalogError(null);
            setCatalogTarget(deck);
          }}
          onTryCatalog={handleTry}
          onCopy={isSignedIn ? handleCopy : undefined}
        />
        {layoutToggle}
        <ScreenToast message={toast} onDismiss={() => setToast(null)} />
        {dialogs}
      </GameScreen>
    );
  }

  return (
    <GameScreen active="decks">
      {layoutToggle}
      <div className={`${game.content} ${styles.fullBleed}`}>
        <div className={`${game.contentWide} ${styles.screen}`}>
          <div className={styles.browser}>
            <DeckRail
              categories={categories}
              category={category}
              onCategory={(next) => {
                setCategory(next);
                setCurrentId(null);
              }}
              shelves={railShelves}
              shelf={shelf}
              onShelf={(next) => {
                setShelf(next as DeckShelf);
                setCurrentId(null);
              }}
              filters={filters}
              onFilters={setFilters}
              availableStyles={availableStyles}
              availableShips={availableShips}
            />

            <section className={styles.main} aria-label={CATEGORY_LABELS[category]}>
              <div className={styles.mainHead}>
                <div>
                  <p className={game.eyebrow}>Decks</p>
                  <h1 className={styles.mainTitle}>{category === "mine" ? "Mes decks" : CATEGORY_LABELS[category]}</h1>
                  <p className={game.muted}>{headline(category, shelf, decks.length, shelfDecks.length)}</p>
                </div>
                {category === "mine" && isSignedIn && !trashed && (
                  <Link href="/decks/nouveau" className={game.primary} onClick={() => playButtonClick()}>
                    + Créer un deck
                  </Link>
                )}
              </div>

              <div className={styles.toolbar}>
                <label className={styles.sort}>
                  <span className={styles.sortLabel}>Trier par :</span>
                  <select
                    className={game.select}
                    value={sort}
                    onChange={(event) => setSort(event.target.value as DeckSortId)}
                    aria-label="Trier les decks"
                  >
                    {DECK_SORTS.map((entry) => (
                      <option key={entry.id} value={entry.id}>
                        {entry.label}
                      </option>
                    ))}
                  </select>
                </label>

                <div className={game.segmented} role="group" aria-label="Affichage">
                  <button
                    type="button"
                    className={view === "grid" ? game.segmentActive : game.segment}
                    aria-pressed={view === "grid"}
                    title="Vue en grille"
                    onClick={() => {
                      playButtonClick();
                      setView("grid");
                    }}
                  >
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" aria-hidden>
                      <rect x="4" y="4" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth={1.6} />
                      <rect x="13" y="4" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth={1.6} />
                      <rect x="4" y="13" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth={1.6} />
                      <rect x="13" y="13" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth={1.6} />
                    </svg>
                    <span className={styles.viewLabel}>Grille</span>
                  </button>
                  <button
                    type="button"
                    className={view === "list" ? game.segmentActive : game.segment}
                    aria-pressed={view === "list"}
                    title="Vue en liste"
                    onClick={() => {
                      playButtonClick();
                      setView("list");
                    }}
                  >
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" aria-hidden>
                      <path d="M4 6.5h16M4 12h16M4 17.5h16" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" />
                    </svg>
                    <span className={styles.viewLabel}>Liste</span>
                  </button>
                </div>
              </div>

              {trashed && shelves.trash.length > 0 && (
                <p className={`${game.muted} ${styles.shelfHint}`}>
                  Un deck supprimé reste ici {DECK_TRASH_RETENTION_DAYS} jours : restaure-le, ou efface-le définitivement. Passé ce délai, il
                  disparaît de lui-même.
                </p>
              )}

              <div className={styles.results}>
                {category === "mine" && !isSignedIn ? (
                  <SignedOutState />
                ) : decks.length === 0 ? (
                  <EmptyState
                    filtered={hasActiveFilter(filters) && shelfDecks.length > 0}
                    category={category}
                    shelf={shelf}
                    hasDrafts={shelves.draft.length > 0}
                    onClearFilters={() => setFilters(EMPTY_FILTERS)}
                  />
                ) : view === "grid" ? (
                  <ul className={styles.grid} role="listbox" aria-label="Decks">
                    {decks.map((deck) => (
                      <li key={deck.id}>
                        <DeckTile
                          deck={deck}
                          selected={deck.id === current?.id}
                          showOrigin={category === "all"}
                          onSelect={() => setCurrentId(deck.id)}
                        />
                      </li>
                    ))}
                  </ul>
                ) : (
                  <ul className={styles.rows} role="listbox" aria-label="Decks">
                    {decks.map((deck) => (
                      <li key={deck.id}>
                        <DeckRow
                          deck={deck}
                          selected={deck.id === current?.id}
                          showOrigin={category === "all"}
                          onSelect={() => setCurrentId(deck.id)}
                        />
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </section>

            <DeckPreviewPanel
              deck={current}
              busy={isPending}
              trashed={trashed}
              onRename={setRenameTarget}
              onDuplicate={handleDuplicate}
              onTrash={handleTrash}
              onRestore={handleRestore}
              onPurge={(deck) => {
                playButtonClick();
                setPurgeTarget(deck);
              }}
              onSetDefault={handleSetDefault}
              onEditArt={setArtTarget}
              onEditProfile={setProfileTarget}
              onOpenCatalogSheet={(deck) => {
                playButtonClick();
                setCatalogError(null);
                setCatalogTarget(deck);
              }}
              onTryCatalog={handleTry}
              onCopy={isSignedIn ? handleCopy : undefined}
            />
          </div>
        </div>
      </div>

      <ScreenToast message={toast} onDismiss={() => setToast(null)} />
      {dialogs}
    </GameScreen>
  );
}

/** La table vide : dire pourquoi, onglet par onglet. */
function tableEmptyLabel(tab: TableTab, isSignedIn: boolean, trash: boolean, search: string): string {
  if (search.trim()) return "Aucun deck ne correspond à la recherche.";
  if (tab === "mine") return !isSignedIn ? "Connecte-toi pour construire tes decks." : trash ? "La corbeille est vide." : "Aucun deck pour l'instant.";
  if (tab === "favorites") return "Aucun favori : touche l'étoile d'une fiche pour l'épingler ici.";
  if (tab === "recent") return isSignedIn ? "Aucune partie jouée pour l'instant." : "Connecte-toi pour retrouver tes decks joués.";
  return "Aucun préconstruit.";
}

/** La phrase sous le titre : ce que contient le rayon, et ce que le filtre en laisse. */
function headline(category: DeckCategory, shelf: DeckShelf, shown: number, total: number): string {
  const filtered = shown !== total ? `${shown} sur ${total}` : `${total}`;
  if (category === "all") return `${filtered} deck${total > 1 ? "s" : ""} — les tiens et les préconstruits, chacun avec sa provenance.`;
  if (category === "precon")
    return `${filtered} préconstruit${total > 1 ? "s" : ""} — le premier est gratuit, les suivants coûtent un Jeton.`;
  if (shelf === "trash") return `${filtered} deck${total > 1 ? "s" : ""} supprimé${total > 1 ? "s" : ""} — restaurables ${DECK_TRASH_RETENTION_DAYS} jours.`;
  if (shelf === "draft") return `${filtered} brouillon${total > 1 ? "s" : ""} — en chantier, pas encore jouable${total > 1 ? "s" : ""}.`;
  return `${filtered} deck${total > 1 ? "s" : ""} construit${total > 1 ? "s" : ""} • Crée, modifie et gère tes decks.`;
}

/** Une vignette : l'image d'abord, le nom et l'essentiel posés dessus. */
function DeckTile({
  deck,
  selected,
  showOrigin,
  onSelect,
}: {
  deck: BrowserDeck;
  selected: boolean;
  showOrigin: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={selected}
      className={styles.tile}
      data-selected={selected || undefined}
      onClick={() => {
        playButtonClick();
        onSelect();
      }}
    >
      <span className={styles.tileArt} style={deck.artUrl ? { backgroundImage: `url("${deck.artUrl}")` } : undefined} aria-hidden />
      <span className={styles.tileShade} aria-hidden />
      {/* La provenance ne se dit QUE dans « Tous les decks » : ailleurs, le
          rayon de gauche la dit déjà pour la colonne entière. */}
      {showOrigin && <span className={styles.originTag} data-kind={deck.kind}>{ORIGIN_LABELS[deck.kind]}</span>}
      <span className={styles.tileText}>
        <span className={styles.tileName}>{deck.name}</span>
        <span className={styles.tileShip}>{shipNameOf(deck.shipId)}</span>
        <span className={styles.tileTags}>
          <span className={game.tag}>{sizeLabel(deck.cardCount)}</span>
          <DeckStateTag deck={deck} />
        </span>
        <span className={styles.tileFoot}>{footNote(deck)}</span>
      </span>
    </button>
  );
}

/** Une ligne : les mêmes informations, plus nombreuses, alignées pour se comparer. */
function DeckRow({
  deck,
  selected,
  showOrigin,
  onSelect,
}: {
  deck: BrowserDeck;
  selected: boolean;
  showOrigin: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={selected}
      className={styles.row}
      data-selected={selected || undefined}
      onClick={() => {
        playButtonClick();
        onSelect();
      }}
    >
      <span className={styles.rowArt} style={deck.artUrl ? { backgroundImage: `url("${deck.artUrl}")` } : undefined} aria-hidden />
      <span className={styles.rowText}>
        <span className={styles.rowName}>{deck.name}</span>
        <span className={styles.rowShip}>{shipNameOf(deck.shipId)}</span>
      </span>
      <span className={styles.rowStyle}>{deck.style || "—"}</span>
      <span className={styles.rowSize}>
        {deck.cardCount} / {RULES.DECK_SIZE_MAX}
      </span>
      <span className={styles.rowTags}>
        {showOrigin && (
          <span className={styles.originTag} data-kind={deck.kind} data-inline="true">
            {ORIGIN_LABELS[deck.kind]}
          </span>
        )}
        <DeckStateTag deck={deck} />
      </span>
      <span className={styles.rowFoot}>{footNote(deck)}</span>
    </button>
  );
}

/** L'état du deck en un mot : jouable, en chantier, débloqué, verrouillé. */
function DeckStateTag({ deck }: { deck: BrowserDeck }) {
  if (deck.mine) {
    if (deck.mine.deletedAt) return <span className={game.tagDanger}>Supprimé</span>;
    if (deck.mine.isDefault) return <span className={game.tagCyan}>★ Par défaut</span>;
    if (deck.mine.isValid) return <span className={game.tagSuccess}>Jouable</span>;
    return <span className={game.tagDanger}>{deck.cardCount < RULES.DECK_SIZE_MIN ? `Min. ${RULES.DECK_SIZE_MIN}` : "Non valide"}</span>;
  }
  if (deck.catalog?.unlocked) return <span className={game.tagSuccess}>Débloqué</span>;
  return <span className={game.tag}>Verrouillé</span>;
}

/**
 * Le bas d'une vignette : ce qui CHANGE d'un deck à l'autre et que le reste
 * de la tuile ne dit pas. Pour un deck qu'on modifie, c'est sa date ; pour
 * une liste prêtée, la part qu'on en possède vraiment — répéter son style,
 * déjà écrit deux lignes plus haut, n'aurait rien appris.
 */
function footNote(deck: BrowserDeck): string {
  if (deck.mine) return `Modifié ${relativeDate(deck.updatedAt)}`;
  return deck.catalog ? ownershipLabel(deck.catalog.ownership) : deck.style;
}

function SignedOutState() {
  return (
    <div className={`${game.panel} ${game.empty}`}>
      <p className={game.emptyTitle}>Connecte-toi pour gérer tes decks</p>
      <p className={game.muted}>Tes decks sont enregistrés sur ton compte : ils te suivent d&apos;une partie à l&apos;autre.</p>
      <div className={styles.emptyActions}>
        <Link href="/connexion" className={game.primary} onClick={() => playButtonClick()}>
          Se connecter
        </Link>
        <Link href="/inscription" className={game.secondary} onClick={() => playButtonClick()}>
          Créer un compte
        </Link>
      </div>
    </div>
  );
}

/** Rayon vide, ou filtre trop serré : deux situations, deux sorties. */
function EmptyState({
  filtered,
  category,
  shelf,
  hasDrafts,
  onClearFilters,
}: {
  filtered: boolean;
  category: DeckCategory;
  shelf: DeckShelf;
  hasDrafts: boolean;
  onClearFilters: () => void;
}) {
  if (filtered) {
    return (
      <div className={`${game.panel} ${game.empty}`}>
        <p className={game.emptyTitle}>Aucun deck ne correspond</p>
        <p className={game.muted}>Essaie un autre nom, ou relâche un filtre.</p>
        <button type="button" className={`${game.secondary} ${game.buttonSm}`} onClick={onClearFilters}>
          Réinitialiser les filtres
        </button>
      </div>
    );
  }

  if (category !== "mine") {
    return (
      <div className={`${game.panel} ${game.empty}`}>
        <p className={game.emptyTitle}>Rien à montrer ici</p>
      </div>
    );
  }

  if (shelf === "trash") {
    return (
      <div className={`${game.panel} ${game.empty}`}>
        <p className={game.emptyTitle}>Rien dans Récemment supprimés</p>
        <p className={game.muted}>
          Un deck supprimé attend ici {DECK_TRASH_RETENTION_DAYS} jours avant de disparaître : le temps de changer d&apos;avis.
        </p>
      </div>
    );
  }

  if (shelf === "draft") {
    return (
      <div className={`${game.panel} ${game.empty}`}>
        <p className={game.emptyTitle}>Aucun brouillon</p>
        <p className={game.muted}>Un deck en chantier — trop peu de cartes, ou une règle enfreinte — se range ici jusqu&apos;à être jouable.</p>
        <Link href="/decks/nouveau" className={game.primary} onClick={() => playButtonClick()}>
          + Créer un deck
        </Link>
      </div>
    );
  }

  return (
    <div className={`${game.panel} ${game.empty}`}>
      <p className={game.emptyTitle}>Aucun deck construit</p>
      <p className={game.muted}>
        Un deck est construit dès qu&apos;il est jouable : entre {RULES.DECK_SIZE_MIN} et {RULES.DECK_SIZE_MAX} cartes, règles respectées.
        {hasDrafts ? " Tes brouillons t'attendent sur l'étagère d'à côté." : ""}
      </p>
      <Link href="/decks/nouveau" className={game.primary} onClick={() => playButtonClick()}>
        + Créer un deck
      </Link>
    </div>
  );
}

function RenameDeckDialog({ deck, onSubmit, onCancel }: { deck: BrowserDeck; onSubmit: (name: string) => void; onCancel: () => void }) {
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

/**
 * L'AVERTISSEMENT avant de copier un deck incomplet : combien de cartes
 * suivront, et lesquelles resteront de côté — le joueur sait ce qu'il
 * devra compléter avant de valider.
 */
function CopyDeckDialog({ deck, busy, onConfirm, onCancel }: { deck: BrowserDeck; busy: boolean; onConfirm: () => void; onCancel: () => void }) {
  const ownership = deck.catalog!.ownership;
  const missing = ownership.cards.filter((card) => card.borrowed > 0);

  return (
    <Dialog
      title="Il te manque des cartes"
      description={
        ownership.owned === 0
          ? `Tu ne possèdes aucune carte de « ${deck.name} » : la copie partira vide, avec son Navire.`
          : `Seules les cartes que tu possèdes seront copiées : ${ownership.owned} sur ${ownership.total}.`
      }
      onClose={onCancel}
      actions={
        <>
          <button type="button" className={game.secondary} onClick={onCancel}>
            Annuler
          </button>
          <button type="button" className={game.primary} onClick={onConfirm} disabled={busy}>
            Copier quand même
          </button>
        </>
      }
    >
      <p className={game.muted}>Laissées de côté :</p>
      <ul className={styles.copyMissing}>
        {missing.map((card) => (
          <li key={card.cardId} className={styles.copyMissingRow}>
            <span>{card.name}</span>
            <span className={styles.copyMissingCount}>×{card.borrowed}</span>
          </li>
        ))}
      </ul>
    </Dialog>
  );
}
