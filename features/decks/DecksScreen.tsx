"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  copyDeck,
  deleteDecks,
  duplicateDeck,
  purgeDecks,
  renameDeck,
  restoreDecks,
  setDeckFavorite,
  type PlayerDeckSummary,
} from "@/app/decks/actions";
import { chooseFreePreconDeck, unlockPreconstructedDeck } from "@/features/decks/catalogActions";
import type { DeckCatalogView } from "@/features/decks/catalogService";
import { catalogEntries, mineEntries, type BrowserDeck } from "@/features/decks/deckEntries";
import { DECK_SORTS, filterDecks, sortDecks, type DeckSortId } from "@/features/decks/deckFilters";
import { DeckSheet } from "@/features/decks/DeckSheet";
import { DeckTable, type TableTab } from "@/features/decks/DeckTable";
import styles from "@/features/decks/DeckTable.module.css";
import { DeleteDeckDialog } from "@/features/decks/DeleteDeckDialog";
import { notifyProgressionChanged } from "@/features/progression/progressionSync";
import { Dialog } from "@/features/shell/Dialog";
import { GameScreen } from "@/features/shell/GameScreen";
import { ScreenToast, type ScreenToastMessage } from "@/features/shell/ScreenToast";
import game from "@/features/shell/GameScreen.module.css";
import { playButtonClick } from "@/lib/sound";
import { oneOf } from "@/lib/persistCodecs";
import { usePersistedState } from "@/lib/persistedState";

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
 * MES DECKS — la table des decks (`DeckTable`, maquette du 25/09/2026) :
 * des onglets (les miens, les préconstruits, les favoris, les derniers
 * joués, la corbeille), la recherche et le tri, les decks en piles, et la
 * fiche du deck pointé, qui porte les actions.
 *
 * Les deux rayons — les miens, les préconstruits — passent par la même
 * forme (`BrowserDeck`) : ils se trient et se cherchent ensemble, seules les
 * actions de la fiche changent. Le déblocage d'un deck fourni garde sa
 * fiche complète en fenêtre (`DeckSheet`), qui sait tout dire avant de
 * dépenser un Jeton.
 *
 * Supprimer n'efface pas : le deck passe dans l'onglet « Récemment
 * supprimés », d'où on le restaure d'un clic ou on l'efface pour de bon —
 * cette dernière action, la seule irréversible, est la seule à demander
 * confirmation.
 */
export function DecksScreen({ isSignedIn, initialDecks, catalog, recentDeckIds = [], accountFavorites = null }: DecksScreenProps) {
  const router = useRouter();
  // Le tri est MÉMORISÉ sur l'appareil (`lib/persistedState.ts`) ; la recherche tapée, non.
  const [search, setSearch] = useState("");
  const [sort, setSort] = usePersistedState<DeckSortId>("decks:tri", "updated", {
    decode: (raw) => oneOf(DECK_SORTS.map((option) => option.id), raw),
  });
  const [currentId, setCurrentId] = useState<string | null>(null);
  // Le joueur qui n'a pas encore pris son préconstruit gratuit arrive
  // directement sur le rayon : c'est l'étape qui lui manque pour jouer.
  const [tab, setTab] = useState<TableTab>(isSignedIn && catalog.freeDeckId === null ? "precon" : "mine");
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
  const [catalogTarget, setCatalogTarget] = useState<BrowserDeck | null>(null);
  /** Deck du jeu à copier alors qu'il manque des cartes : l'avertissement est ouvert. */
  const [copyTarget, setCopyTarget] = useState<BrowserDeck | null>(null);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [toast, setToast] = useState<ScreenToastMessage | null>(null);
  const [isPending, startTransition] = useTransition();

  /**
   * Les decks du joueur, en deux piles : les ACTIFS (jouables ou en
   * chantier ; le deck par défaut en tête, c'est celui qu'on joue) et la
   * CORBEILLE (« Récemment supprimés », restaurable pendant 30 jours).
   */
  const { active, trash } = useMemo(() => {
    const active: PlayerDeckSummary[] = [];
    const trash: PlayerDeckSummary[] = [];
    for (const deck of initialDecks) (deck.deletedAt ? trash : active).push(deck);
    active.sort((a, b) => Number(b.isDefault) - Number(a.isDefault));
    return { active, trash };
  }, [initialDecks]);

  /** Les decks de l'onglet ouvert, passés par la recherche et le tri. */
  const decks = useMemo<BrowserDeck[]>(() => {
    const everything = [...mineEntries(active), ...catalogEntries(catalog)];
    if (tab === "recent") {
      const byId = new Map(everything.map((deck) => [deck.id, deck]));
      const played = recentDeckIds.map((id) => byId.get(id)).filter((deck): deck is BrowserDeck => Boolean(deck));
      return filterDecks(played, search);
    }
    const base =
      tab === "mine"
        ? mineEntries(active)
        : tab === "trash"
          ? mineEntries(trash)
          : tab === "precon"
            ? catalogEntries(catalog)
            : everything.filter((deck) => favorites.has(deck.id));
    return sortDecks(filterDecks(base, search), sort);
  }, [tab, active, trash, catalog, search, sort, favorites, recentDeckIds]);

  /**
   * Le deck POINTÉ. Le premier de la liste par défaut, et on y retombe dès
   * que celui qu'on regardait quitte l'écran (filtré, supprimé, restauré) :
   * une fiche vide à côté d'une table pleine n'apprend rien.
   */
  const current = decks.find((deck) => deck.id === currentId) ?? decks[0] ?? null;

  useEffect(() => {
    if (current && current.id !== currentId) setCurrentId(current.id);
    if (!current && currentId !== null) setCurrentId(null);
  }, [current, currentId]);

  /**
   * L'onglet « Récemment supprimés » n'apparaît que s'il a quelque chose à
   * montrer — ou tant qu'on y est : restaurer le dernier deck y laisse le
   * joueur, devant « La corbeille est vide. », plutôt que de l'en chasser.
   */
  const trashCount = isSignedIn && (trash.length > 0 || tab === "trash") ? trash.length : null;

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

  return (
    <GameScreen active="decks">
      <DeckTable
        tab={tab}
        onTab={(next) => {
          setTab(next);
          setCurrentId(null);
        }}
        trashCount={trashCount}
        decks={decks}
        current={current}
        onSelect={setCurrentId}
        sort={sort}
        onSort={setSort}
        search={search}
        onSearch={setSearch}
        favorites={favorites}
        onToggleFavorite={toggleFavorite}
        canCreate={tab === "mine" && isSignedIn}
        trashed={tab === "trash"}
        emptyLabel={tableEmptyLabel(tab, isSignedIn, search)}
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
        onCopy={isSignedIn ? handleCopy : undefined}
      />
      <ScreenToast message={toast} onDismiss={() => setToast(null)} />

      {renameTarget && <RenameDeckDialog deck={renameTarget} onSubmit={handleRenameSubmit} onCancel={() => setRenameTarget(null)} />}

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
          onClose={() => {
            setCatalogTarget(null);
            setCatalogError(null);
          }}
        />
      )}
    </GameScreen>
  );
}

/** La table vide : dire pourquoi, onglet par onglet. */
function tableEmptyLabel(tab: TableTab, isSignedIn: boolean, search: string): string {
  if (search.trim()) return "Aucun deck ne correspond à la recherche.";
  if (tab === "mine") return isSignedIn ? "Aucun deck pour l'instant." : "Connecte-toi pour construire tes decks.";
  if (tab === "trash") return "La corbeille est vide.";
  if (tab === "favorites") return "Aucun favori : touche l'étoile d'une fiche pour l'épingler ici.";
  if (tab === "recent") return isSignedIn ? "Aucune partie jouée pour l'instant." : "Connecte-toi pour retrouver tes decks joués.";
  return "Aucun préconstruit.";
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
