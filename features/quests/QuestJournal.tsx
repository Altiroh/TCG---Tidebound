"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { QUEST_CATEGORY_META, type QuestCategory } from "@/game/quests";
import styles from "@/features/quests/Quests.module.css";
import { claimQuestReward, rerollQuest, type QuestBoard, type QuestEntry } from "@/features/quests/actions";
import { QUEST_SCREEN_ASSETS, SceneToast, type SceneNotice } from "@/features/quests/QuestScene";
import { VoyagePanel, VoyageSkeleton } from "@/features/quests/VoyagePanel";
import type { VoyageBoard } from "@/features/quests/voyageActions";
import { notifyProgressionChanged } from "@/features/progression/progressionSync";
import { playButtonClick, playRewardClaimed } from "@/lib/sound";
import { oneOf } from "@/lib/persistCodecs";
import { usePersistedState } from "@/lib/persistedState";

interface QuestJournalProps {
  board: QuestBoard;
  /** Traversées ; `available: false` tant que leur migration n'est pas appliquée — la carte s'efface. */
  voyages?: VoyageBoard;
  /** Traversées encore en lecture : leur squelette tient la place de la carte. */
  voyagesPending?: boolean;
  /** Relit quêtes et profil après une réclamation ou un remplacement. */
  onChanged: () => void;
}

/**
 * Les onglets PEINTS de la maquette (`onglet-<id>.webp`, et `-actif` quand
 * il est choisi), dans leur ordre ; « Cartes », peint à part, suit « Parties »
 * comme dans `QUEST_CATEGORIES`.
 */
const TABS: readonly { id: QuestCategory | null; asset: string; label: string }[] = [
  { id: null, asset: "toutes", label: "Toutes" },
  { id: "parties", asset: "parties", label: QUEST_CATEGORY_META.parties.label },
  { id: "cartes", asset: "cartes", label: QUEST_CATEGORY_META.cartes.label },
  { id: "stats", asset: "stats", label: QUEST_CATEGORY_META.stats.label },
  { id: "maree", asset: "maree", label: QUEST_CATEGORY_META.maree.label },
  { id: "decks", asset: "decks", label: QUEST_CATEGORY_META.decks.label },
];

const TAB_FILTERS = TABS.map((tab) => tab.id);

function formatRemaining(endsAtIso: string): string {
  const ms = new Date(endsAtIso).getTime() - Date.now();
  if (ms <= 0) return "renouvellement imminent";
  // Arrondi supérieur : « encore 3 jours » tant qu'il reste plus de 2 jours pleins.
  const hours = ms / 3_600_000;
  if (hours > 48) return `encore ${Math.ceil(hours / 24)} jours`;
  if (hours > 1) return `encore ${Math.ceil(hours)} h`;
  return `encore ${Math.max(1, Math.ceil(ms / 60_000))} min`;
}

/**
 * JOURNAL DE BORD — la Traversée en cours sur sa carte, les onglets de
 * catégorie, puis les quêtes du jour et de la semaine sur leurs feuilles
 * clouées à la planche. Il vit dans l'onglet « Quêtes » du profil, posé
 * dans la scène du pont (`QuestScene`).
 *
 * Organisation par CATÉGORIE (Notion « Catalogue de quêtes — Tidebound ») :
 * chaque ligne porte l'icône de sa famille dans son cadre de laiton — c'est
 * ce qui rend la liste lisible avant même d'en lire le texte — et un onglet
 * permet de ne garder qu'une catégorie.
 *
 * Aucune progression n'est calculée ici : elle est écrite par le serveur à
 * la fin de chaque partie arbitrée (`features/matches/matchStore.ts`), et
 * la réclamation comme le remplacement sont des Server Actions autoritaires.
 */
export function QuestJournal({ board, voyages, voyagesPending = false, onChanged }: QuestJournalProps) {
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [notice, setNotice] = useState<SceneNotice | null>(null);
  const [filter, setFilter] = usePersistedState<QuestCategory | null>("quetes", null, {
    decode: (raw) => oneOf<QuestCategory | null>(TAB_FILTERS, raw),
  });
  const clearNotice = useCallback(() => setNotice(null), []);
  // Téléphone couché : la Traversée et les quêtes, chacune sa vue (voir `MobileSwitch`).
  const [mobileView, setMobileView] = useState<MobileView>("quetes");

  const visible = useCallback((entries: QuestEntry[]) => (filter ? entries.filter((entry) => entry.category === filter) : entries), [filter]);
  const empty = useMemo(() => board.daily.length + board.weekly.length === 0, [board.daily, board.weekly]);

  // Une quête réclamée reste marquée jusqu'au journal RELU : relâchée plus
  // tôt, elle réapparaissait « à réclamer » le temps de la relecture.
  useEffect(() => setBusyKey(null), [board]);

  function handleClaim(entry: QuestEntry) {
    playButtonClick();
    setNotice(null);
    const key = `${entry.questId}|${entry.periodKey}`;
    setBusyKey(key);

    void claimQuestReward(entry.questId, entry.periodKey)
      .then((result) => {
        if (!result.ok) {
          setNotice({ tone: "error", text: result.error ?? "Réclamation impossible." });
          setBusyKey(null);
          return;
        }
        playRewardClaimed();
        const gains = [result.tidesGained ? `+${result.tidesGained} Tides` : "", result.xpGained ? `+${result.xpGained} XP` : ""].filter(Boolean);
        if (gains.length > 0) setNotice({ tone: "success", text: gains.join(" · ") });
        notifyProgressionChanged();
        onChanged();
        // Relâchée à l'arrivée du journal relu ; filet si la relecture n'aboutit pas.
        window.setTimeout(() => setBusyKey((current) => (current === key ? null : current)), 10_000);
      })
      .catch(() => setBusyKey(null));
  }

  function handleReroll(entry: QuestEntry) {
    playButtonClick();
    setNotice(null);
    const key = `${entry.questId}|${entry.periodKey}`;
    setBusyKey(key);

    void rerollQuest(entry.questId, entry.periodKey)
      .then((result) => {
        if (!result.ok) {
          setNotice({ tone: "error", text: result.error ?? "Remplacement impossible." });
          return;
        }
        onChanged();
      })
      .finally(() => setBusyKey(null));
  }

  // La Traversée en tête : c'est la progression longue, celle qu'on suit
  // d'une semaine à l'autre. En attendant sa lecture, son squelette tient
  // sa place — rien ne saute quand elle arrive.
  const voyage = voyagesPending ? <VoyageSkeleton /> : voyages && <VoyagePanel board={voyages} onNotice={setNotice} onChanged={onChanged} />;
  const voyageShown = voyagesPending || Boolean(voyages?.available && voyages.voyages.length > 0);
  // Sur téléphone, ce qui n'est pas dans la vue choisie s'efface (`data-mobile-hidden`, Quests.module.css).
  const hiddenOnPhone = (view: MobileView) => (voyageShown && mobileView !== view) || undefined;

  if (board.unavailable) {
    return (
      <>
        {voyage}
        <JournalNote title="Journal indisponible pour le moment">Le serveur n&apos;a pas pu charger tes quêtes. Réessaie dans un instant.</JournalNote>
        <SceneToast notice={notice} onDone={clearNotice} />
      </>
    );
  }

  if (empty) {
    return (
      <>
        {voyage}
        <JournalNote title="Aucune quête au registre">
          Le catalogue de quêtes est vide en base. Applique les migrations Supabase, puis lance <code>npm run seed:cards</code>.
        </JournalNote>
        <SceneToast notice={notice} onDone={clearNotice} />
      </>
    );
  }

  return (
    <>
      {voyageShown && (
        <MobileSwitch
          view={mobileView}
          onChange={setMobileView}
          questAlert={[...board.daily, ...board.weekly].some((entry) => entry.completed && !entry.claimed)}
          voyageAlert={Boolean(voyages?.voyages.some((entry) => entry.claimableTier !== null))}
        />
      )}

      <div className={styles.pane} data-mobile-hidden={hiddenOnPhone("traversee")}>
        {voyage}
      </div>

      <div className={styles.tabs} role="group" aria-label="Catégories de quêtes" data-mobile-hidden={hiddenOnPhone("quetes")}>
        {TABS.map((tab) => {
          const active = filter === tab.id;
          return (
            <button
              key={tab.asset}
              type="button"
              className={styles.tab}
              data-active={active || undefined}
              aria-pressed={active}
              title={tab.id ? QUEST_CATEGORY_META[tab.id].description : "Toutes les quêtes du moment"}
              onClick={() => {
                if (active) return;
                playButtonClick();
                setFilter(tab.id);
              }}
            >
              {/* Les deux faces sont posées : passer de l'une à l'autre ne recharge rien. */}
              {/* eslint-disable-next-line @next/next/no-img-element -- onglet peint */}
              <img className={styles.tabFace} src={`${QUEST_SCREEN_ASSETS}/onglet-${tab.asset}.webp`} alt="" draggable={false} />
              {/* eslint-disable-next-line @next/next/no-img-element -- onglet peint */}
              <img className={styles.tabFaceActive} src={`${QUEST_SCREEN_ASSETS}/onglet-${tab.asset}-actif.webp`} alt="" draggable={false} />
              <span className={styles.srOnly}>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Deux registres côte à côte, cloués sur la planche : le jour et la
          semaine se lisent ensemble, sans défiler. */}
      <div className={styles.board} data-mobile-hidden={hiddenOnPhone("quetes")}>
        <QuestSheet
          sheet="quotidiennes"
          title="Quotidiennes"
          subtitle={formatRemaining(board.dailyEndsAt)}
          entries={visible(board.daily)}
          emptyText={filter ? "Aucune quête du jour dans cette catégorie." : "Aucune quête du jour."}
          busyKey={busyKey}
          onClaim={handleClaim}
          onReroll={board.dailyRerollsLeft > 0 ? handleReroll : undefined}
        />
        <QuestSheet
          sheet="hebdomadaires"
          title="Hebdomadaires"
          subtitle={formatRemaining(board.weeklyEndsAt)}
          entries={visible(board.weekly)}
          emptyText={filter ? "Aucune quête de la semaine dans cette catégorie." : "Aucune quête cette semaine."}
          busyKey={busyKey}
          onClaim={handleClaim}
        />
      </div>

      <SceneToast notice={notice} onDone={clearNotice} />
    </>
  );
}

type MobileView = "quetes" | "traversee";

/**
 * TÉLÉPHONE COUCHÉ (09/10/2026) : la carte de la Traversée et les feuilles
 * de quêtes ne tiennent pas ensemble dans ~320 px de haut. Chacune a sa vue,
 * et ce sélecteur passe de l'une à l'autre ; une pastille signale ce qui
 * attend d'être réclamé dans la vue cachée. Masqué au-delà du seuil (560 px
 * de haut), où tout se lit d'un coup.
 */
function MobileSwitch({ view, onChange, questAlert, voyageAlert }: { view: MobileView; onChange: (view: MobileView) => void; questAlert: boolean; voyageAlert: boolean }) {
  const entries: readonly { id: MobileView; label: string; alert: boolean }[] = [
    { id: "quetes", label: "Quêtes", alert: questAlert },
    { id: "traversee", label: "Traversée", alert: voyageAlert },
  ];
  return (
    <div className={styles.mobileSwitch} role="group" aria-label="Afficher">
      {entries.map((entry) => (
        <button
          key={entry.id}
          type="button"
          className={styles.mobileSwitchButton}
          aria-pressed={view === entry.id}
          data-alert={(entry.alert && view !== entry.id) || undefined}
          onClick={() => {
            if (view === entry.id) return;
            playButtonClick();
            onChange(entry.id);
          }}
        >
          {entry.label}
        </button>
      ))}
    </div>
  );
}

/** Une note du journal — état vide, indisponible ou erreur — sur une feuille clouée à la planche. */
function JournalNote({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return (
    <div className={styles.board} data-single>
      <section className={styles.sheet} data-sheet="quotidiennes">
        <div className={styles.note}>
          <h2 className={styles.sheetTitle}>{title}</h2>
          <p className={styles.noteText}>{children}</p>
          {action}
        </div>
      </section>
    </div>
  );
}

/** Le journal n'a pas pu être lu et rien n'est connu pour le remplacer : on le dit, et on propose de relire. */
export function QuestJournalError({ onRetry }: { onRetry: () => void }) {
  return (
    <JournalNote
      title="Le journal de bord n'a pas pu être lu"
      action={
        <button
          type="button"
          className={styles.noteAction}
          onClick={() => {
            playButtonClick();
            onRetry();
          }}
        >
          Réessayer
        </button>
      }
    >
      La liaison avec le port a été coupée. Vérifie ta connexion, puis réessaie.
    </JournalNote>
  );
}

/**
 * Le journal en attente de sa première lecture : la carte, les onglets et
 * les deux feuilles, DANS LEUR FORME FINALE (mêmes images, mêmes hauteurs de
 * ligne). Le vrai journal se pose dessus sans que rien ne bouge.
 */
export function QuestJournalSkeleton() {
  const ghost = styles.ghost;
  return (
    <>
      <p className={styles.srOnly} role="status">
        Chargement du journal de bord…
      </p>
      <VoyageSkeleton />
      <div className={styles.tabs} aria-hidden>
        {TABS.map((tab) => (
          <span key={tab.asset} className={styles.tab} data-active={tab.id === null || undefined}>
            {/* eslint-disable-next-line @next/next/no-img-element -- onglet peint */}
            <img className={styles.tabFace} src={`${QUEST_SCREEN_ASSETS}/onglet-${tab.asset}.webp`} alt="" draggable={false} />
            {/* eslint-disable-next-line @next/next/no-img-element -- onglet peint */}
            <img className={styles.tabFaceActive} src={`${QUEST_SCREEN_ASSETS}/onglet-${tab.asset}-actif.webp`} alt="" draggable={false} />
          </span>
        ))}
      </div>
      <div className={styles.board} aria-hidden>
        {(["quotidiennes", "hebdomadaires"] as const).map((sheet) => (
          <section key={sheet} className={styles.sheet} data-sheet={sheet}>
            <header className={styles.sheetHead}>
              <h2 className={styles.sheetTitle}>
                <span className={ghost}>{sheet === "quotidiennes" ? "Quotidiennes" : "Hebdomadaires"}</span>
              </h2>
              <span className={styles.sheetMeta}>
                <span className={ghost}>encore 9 h</span>
              </span>
            </header>
            <ul className={styles.list}>
              {[0, 1, 2].map((index) => (
                <li key={index} className={styles.row}>
                  <span className={`${styles.iconFrame} ${styles.skeletonIcon}`} />
                  <div className={styles.main}>
                    <p className={styles.nameLine}>
                      <span className={ghost}>Nom de la quête</span>
                    </p>
                    <p className={styles.objective}>
                      <span className={ghost}>Objectif de la quête, en toutes lettres</span>
                    </p>
                    <div className={styles.progressLine}>
                      <span className={styles.track} />
                      <span className={styles.count}>
                        <span className={ghost}>0 / 3</span>
                      </span>
                    </div>
                  </div>
                  <div className={styles.reward}>
                    <span className={styles.rewardMain}>
                      <span className={ghost}>35 Tides</span>
                    </span>
                    <span className={styles.rewardXp}>
                      <span className={ghost}>+150 XP</span>
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </>
  );
}

interface QuestSheetProps {
  sheet: "quotidiennes" | "hebdomadaires";
  title: string;
  subtitle: string;
  entries: QuestEntry[];
  /** Ligne montrée quand la période (ou le filtre) ne laisse rien : la feuille garde sa place. */
  emptyText: string;
  /** Clé `questId|periodKey` en cours de réclamation, `"*"` pendant un rafraîchissement. */
  busyKey: string | null;
  onClaim: (entry: QuestEntry) => void;
  /** Absent quand le quota de remplacements de la période est épuisé. */
  onReroll?: (entry: QuestEntry) => void;
}

/**
 * Un registre (jour ou semaine) : une feuille de parchemin, une ligne par
 * quête ENCORE OUVERTE. Deux états lisibles d'un coup d'œil : en cours
 * (jauge cyan), à encaisser (le cadre de l'icône brille, toute la ligne
 * encaisse d'un clic). Une quête réclamée
 * quitte la feuille : il ne reste que ce qui reste à faire.
 */
function QuestSheet({ sheet, title, subtitle, entries, emptyText, busyKey, onClaim, onReroll }: QuestSheetProps) {
  const open = entries.filter((entry) => !entry.claimed);
  return (
    <section className={styles.sheet} data-sheet={sheet} aria-label={title}>
      <header className={styles.sheetHead}>
        <h2 className={styles.sheetTitle}>{title}</h2>
        <span className={styles.sheetMeta}>{subtitle}</span>
      </header>

      {open.length === 0 ? (
        <p className={styles.sheetEmpty}>{entries.length > 0 ? `Tout est encaissé. De nouvelles quêtes arrivent — ${subtitle}.` : emptyText}</p>
      ) : (
        <ul className={styles.list}>
          {open.map((entry) => (
            <QuestRow key={`${entry.questId}|${entry.periodKey}`} entry={entry} busyKey={busyKey} onClaim={onClaim} onReroll={onReroll} />
          ))}
        </ul>
      )}
    </section>
  );
}

function QuestRow({ entry, busyKey, onClaim, onReroll }: { entry: QuestEntry; busyKey: string | null; onClaim: (entry: QuestEntry) => void; onReroll?: (entry: QuestEntry) => void }) {
  const key = `${entry.questId}|${entry.periodKey}`;
  const busy = busyKey === key || busyKey === "*";
  const ratio = Math.min(1, entry.progress / entry.target);
  const claimable = entry.completed && !entry.claimed;
  const meta = QUEST_CATEGORY_META[entry.category];
  const name = entry.name || entry.label;
  // Réservé aux quêtes du jour non terminées : remplacer une quête finie
  // reviendrait à rejouer sa récompense.
  const rerollable = !claimable && !entry.claimed && onReroll && !entry.fromPreviousPeriod;

  const body = (
    <>
      <span className={styles.iconFrame} title={meta.label}>
        {/* eslint-disable-next-line @next/next/no-img-element -- icône locale, taille fixe */}
        <img src={meta.icon} alt="" aria-hidden draggable={false} className={styles.icon} />
      </span>

      <div className={styles.main}>
        <p className={styles.nameLine}>
          <span className={styles.name}>{name}</span>
          <span className={styles.category}>{meta.label}</span>
          {!entry.botProgressAllowed && <span className={styles.flag}>PvP uniquement</span>}
          {entry.fromPreviousPeriod && <span className={styles.flag}>Période passée</span>}
        </p>
        {/* Le nom occupe la ligne du haut : l'objectif chiffré passe juste
            en dessous, là où le joueur lit sa progression. */}
        <p className={styles.objective}>{entry.label}</p>
        <div className={styles.progressLine}>
          <span className={styles.track} role="progressbar" aria-valuemin={0} aria-valuemax={entry.target} aria-valuenow={entry.progress} aria-label={entry.label}>
            <span className={styles.fill} style={{ width: `${ratio * 100}%` }} />
          </span>
          <span className={styles.count}>
            {Math.min(entry.progress, entry.target)} / {entry.target}
          </span>
        </div>
      </div>

      <div className={styles.reward}>
        <span className={styles.rewardMain}>
          <span className={styles.rewardValue}>{entry.rewardBoosterId ? "1" : entry.rewardTides}</span>
          <span className={styles.rewardUnit}>{entry.rewardBoosterId ? "booster" : "Tides"}</span>
        </span>
        {entry.rewardXp > 0 && <span className={styles.rewardXp}>+{entry.rewardXp} XP</span>}
      </div>

    </>
  );

  // Terminée : toute la ligne encaisse. Viser un bouton pour récupérer ce
  // qu'on a déjà gagné est un obstacle de plus, pas une sécurité.
  if (claimable) {
    return (
      <li className={styles.item}>
        <button
          type="button"
          className={styles.row}
          data-state="claimable"
          onClick={() => onClaim(entry)}
          disabled={busy}
          aria-label={`${name} — terminée, encaisser ${entry.rewardBoosterId ? "un booster" : `${entry.rewardTides} Tides`}`}
        >
          {body}
        </button>
      </li>
    );
  }

  return (
    <li className={styles.item}>
      <div className={styles.row} data-state="open">
        {body}
      </div>
      {/* Le remplacement reste un bouton À PART, posé sur la ligne mais hors
          d'elle : un clic mal placé ne doit jamais remplacer une quête. */}
      {rerollable && (
        <button type="button" className={styles.reroll} onClick={() => onReroll(entry)} disabled={busy} title="Remplacer cette quête par une autre (gratuit, une fois par jour)">
          <svg viewBox="0 0 16 16" width="1em" height="1em" fill="none" aria-hidden>
            <path d="M13 5.5A5.2 5.2 0 0 0 3.4 4.3M3 10.5a5.2 5.2 0 0 0 9.6 1.2" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" />
            <path d="M13.4 2.2v3.6H9.8M2.6 13.8v-3.6h3.6" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Remplacer
        </button>
      )}
    </li>
  );
}
