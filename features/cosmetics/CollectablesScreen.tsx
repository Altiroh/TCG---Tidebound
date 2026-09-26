"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { equipCollectable, purchaseCollectable } from "@/features/cosmetics/collectablesActions";
import { useCardBack } from "@/features/cosmetics/CardBackProvider";
import { useShipFrame } from "@/features/cosmetics/ShipFrameProvider";
import type { CollectableFamilyView, CollectableOption, CollectablesView } from "@/features/cosmetics/collectablesService";
import { GameScreen } from "@/features/shell/GameScreen";
import { TideCoin } from "@/features/shell/GameIcons";
import styles from "@/features/cosmetics/Collectables.module.css";
import { notifyProgressionChanged } from "@/features/progression/progressionSync";
import { playButtonClick } from "@/lib/sound";

/** Ce que chaque famille annonce en tête de vitrine. */
const FAMILY_HINTS: Record<string, string> = {
  cardBack: "Visible par ton adversaire dès le premier tour.",
  shipSkin: "Le cadre qui porte ton Navire sur le plateau.",
};

/**
 * GABARIT de chaque famille sur la table (maquette du 26/09/2026) : les dos
 * de carte en GRANDES fiches épinglées (visuel, plaque de nom, accroche,
 * bouton), les cadres de Navire en fiches COMPACTES (visuel, plaque,
 * bouton). Une famille inconnue prend le gabarit compact.
 */
const VARIANT: Record<string, "large" | "compact"> = {
  cardBack: "large",
  shipSkin: "compact",
};

/**
 * Le PANNEAU DES FAMILLES (à gauche sur la maquette) est masqué pour
 * l'instant : les deux familles sont déjà à l'écran l'une sous l'autre, il
 * ne menait nulle part (retour du 26/09/2026). La table se recentre sans
 * lui ; le rallumer, c'est cette constante — et rendre sa place à gauche.
 */
const FAMILY_PANEL = false;

/**
 * CE QU'ON REGARDE. La vitrine s'ouvre sur ce qu'on POSSÈDE — c'est la
 * collection du joueur, et elle doit lui appartenir avant de lui montrer
 * ce qui lui manque. Le reste est à un clic.
 */
type Shelf = "owned" | "sale" | "locked" | "all";

/**
 * « En vente » existe parce que l'étagère par défaut, en ne montrant que le
 * possédé, faisait disparaître tous les boutons d'achat : ils ne vivent que
 * sous un objet NON possédé. Il ne s'affiche que s'il a quelque chose à
 * vendre — un onglet vide n'annonce rien.
 */
const SHELVES: ReadonlyArray<{ id: Shelf; label: string }> = [
  { id: "owned", label: "Possédés" },
  { id: "sale", label: "En vente" },
  { id: "locked", label: "À débloquer" },
  { id: "all", label: "Tous" },
];

function onShelf(option: CollectableOption, shelf: Shelf): boolean {
  if (shelf === "owned") return option.owned;
  // En vente : ce qu'on peut acheter MAINTENANT, donc pas ce qu'on a déjà.
  if (shelf === "sale") return !option.owned && option.priceTides !== null;
  if (shelf === "locked") return !option.owned;
  return true;
}

/**
 * COLLECTABLES — ce que la collection compte d'autre que des cartes.
 *
 * LA TABLE DES COLLECTABLES (maquette du 26/09/2026) : sur la carte marine
 * de la table, le panneau des familles à gauche, et chaque famille en
 * BANDEAU de parchemin (titre, étagères, lien vers le Market) au-dessus
 * d'une rangée de fiches épinglées qui défile de côté — flèches de laiton
 * de part et d'autre du bandeau quand la rangée déborde. Scène à ratio fixe
 * (1672 × 880, comme la table des Decks) : positions en %, textes en cqw.
 *
 * L'écran ne connaît AUCUNE condition de déblocage : le service les a déjà
 * traduites en trois états, et c'est tout ce qu'il affiche —
 *
 *   - **obtenu** : équipable (si son visuel existe) ;
 *   - **verrouillé** : visible, avec sa condition en clair et ce qu'il
 *     reste à faire — un objectif qu'on ne connaît pas ne donne envie de
 *     rien ;
 *   - **caché** : emplacement voilé, ni nom ni condition. C'est le mystère
 *     qui fait l'objet ; il se révèle entièrement une fois obtenu.
 *
 * Un équipement est appliqué à l'écran dès que le serveur a dit oui, sans
 * rechargement : le dos par `CardBackProvider`, le cadre par
 * `ShipFrameProvider`. Les deux portent jusqu'au plateau.
 */
export function CollectablesScreen({ view }: { view: CollectablesView }) {
  const router = useRouter();
  const { apply: applyCardBack } = useCardBack();
  const { apply: applyShipFrame } = useShipFrame();
  const [activeKind, setActiveKind] = useState<string>(view.families[0]?.kind ?? "cardBack");
  // Hors session, « Possédés » ne montrerait que le gratuit : on ouvre
  // alors sur tout, sinon la vitrine paraît vide au premier venu.
  const [shelves, setShelves] = useState<Record<string, Shelf>>({});
  const shelfOf = (kind: string): Shelf => shelves[kind] ?? (view.isSignedIn ? "owned" : "all");
  // Le solde décide de ce qui est à portée : il doit baisser dès l'achat
  // confirmé, sans attendre le rechargement serveur.
  const [balance, setBalance] = useState(view.balance);
  useEffect(() => setBalance(view.balance), [view.balance]);
  const sectionRefs = useRef<Record<string, HTMLElement | null>>({});

  function afterPurchase(next: number) {
    setBalance(next);
    // Le bandeau porte le même solde, et la vitrine doit passer l'objet en
    // « obtenu » : c'est le serveur qui fait autorité sur les deux.
    notifyProgressionChanged();
    router.refresh();
  }

  /**
   * Les deux familles sont MIROITÉES localement : elles s'affichent en
   * partie, sur des écrans qui ne lisent pas la session (cf.
   * `CardBackProvider` et `ShipFrameProvider`).
   */
  const mirror: Record<string, (id: string) => void> = {
    cardBack: applyCardBack,
    shipSkin: applyShipFrame,
  };

  function afterEquip(kind: string, id: string) {
    mirror[kind]?.(id);
    router.refresh();
  }

  // Cet écran LIT la base : les miroirs locaux sont réalignés sur elle — un
  // appareil neuf, ou un déblocage obtenu ailleurs, repart juste.
  const equippedBack = view.families.find((family) => family.kind === "cardBack")?.equipped ?? null;
  const equippedFrame = view.families.find((family) => family.kind === "shipSkin")?.equipped ?? null;
  useEffect(() => {
    if (view.isSignedIn && equippedBack) applyCardBack(equippedBack);
  }, [view.isSignedIn, equippedBack, applyCardBack]);
  useEffect(() => {
    if (view.isSignedIn && equippedFrame) applyShipFrame(equippedFrame);
  }, [view.isSignedIn, equippedFrame, applyShipFrame]);

  const cardBackFamily = view.families.find((family) => family.kind === "cardBack");
  const stackSrc =
    cardBackFamily?.options.find((option) => option.id === cardBackFamily.equipped)?.src ?? cardBackFamily?.options[0]?.src ?? null;

  return (
    <GameScreen active="collectables" className={styles.screen}>
      <div className={styles.page}>
        {/* Les décors de bord tiennent à l'ÉCRAN, pas à la scène : ils
            débordent de la table quelle que soit la forme de la fenêtre. */}
        {/* eslint-disable-next-line @next/next/no-img-element -- décor peint, taille pilotée par la feuille */}
        <img src="/assets/collectables/decor-gauche.webp" alt="" aria-hidden draggable={false} className={styles.decorLeft} />
        {/* eslint-disable-next-line @next/next/no-img-element -- décor peint, taille pilotée par la feuille */}
        <img src="/assets/collectables/decor-droite.webp" alt="" aria-hidden draggable={false} className={styles.decorRight} />

        <div className={styles.stage} data-panel={FAMILY_PANEL ? "true" : undefined}>
          {FAMILY_PANEL && (
          <aside className={styles.families} aria-label="Familles de collectables">
            <h1 className={styles.familiesTitle}>
              <AnchorIcon />
              Collectables
            </h1>
            <nav className={styles.familyList}>
              {view.families.map((family) => {
                const owned = family.options.filter((option) => option.owned).length;
                const active = activeKind === family.kind;
                return (
                  <button
                    key={family.kind}
                    type="button"
                    className={styles.familyRow}
                    data-active={active ? "true" : undefined}
                    aria-current={active ? "true" : undefined}
                    onClick={() => {
                      playButtonClick();
                      setActiveKind(family.kind);
                      sectionRefs.current[family.kind]?.focus({ preventScroll: true });
                    }}
                  >
                    <FamilyIcon kind={family.kind} stackSrc={stackSrc} />
                    <span className={styles.familyLabel}>{family.label}</span>
                    <span className={styles.familyCount}>
                      {view.isSignedIn ? `${owned}/${family.options.length}` : family.options.length}
                    </span>
                  </button>
                );
              })}
            </nav>
            {!view.isSignedIn && (
              <p className={styles.signedOutNote}>
                <Link href="/connexion" onClick={() => playButtonClick()}>
                  Connecte-toi
                </Link>{" "}
                pour équiper tes collectables : ils sont enregistrés sur ton compte.
              </p>
            )}
          </aside>
          )}

          {view.families.map((family, index) => (
            <FamilySection
              key={family.kind}
              sectionRef={(node) => {
                sectionRefs.current[family.kind] = node;
              }}
              family={family}
              order={index}
              variant={VARIANT[family.kind] ?? "compact"}
              stackSrc={stackSrc}
              shelf={shelfOf(family.kind)}
              onPickShelf={(shelf) => {
                playButtonClick();
                setShelves((current) => ({ ...current, [family.kind]: shelf }));
              }}
              onFocusFamily={() => setActiveKind(family.kind)}
              // Sans le panneau, l'invitation à se connecter prend la place
              // de l'accroche du premier bandeau.
              signInHint={!FAMILY_PANEL && !view.isSignedIn && index === 0}
              isSignedIn={view.isSignedIn}
              balance={balance}
              onBought={afterPurchase}
              onEquipped={afterEquip}
            />
          ))}
        </div>
      </div>
    </GameScreen>
  );
}

/* ── Une famille : bandeau + rangée ──────────────────────────────────── */

interface FamilySectionProps {
  /** La section, pour que le panneau des familles puisse y porter le focus. */
  sectionRef: (node: HTMLElement | null) => void;
  family: CollectableFamilyView;
  /** Rang de la famille sur la table (0 : en haut). */
  order: number;
  variant: "large" | "compact";
  stackSrc: string | null;
  shelf: Shelf;
  onPickShelf: (shelf: Shelf) => void;
  onFocusFamily: () => void;
  /** L'accroche cède la place à l'invitation à se connecter. */
  signInHint: boolean;
  isSignedIn: boolean;
  balance: number;
  onBought: (balance: number) => void;
  onEquipped: (kind: string, id: string) => void;
}

/**
 * Une famille sur la table : le BANDEAU (icône, titre, accroche, étagères,
 * lien vers le Market), puis la RANGÉE de fiches. La rangée défile de côté
 * quand elle déborde, et les flèches de laiton n'apparaissent qu'alors —
 * une flèche qui ne mène nulle part n'a rien à faire là.
 */
function FamilySection({
  sectionRef,
  family,
  order,
  variant,
  stackSrc,
  shelf,
  onPickShelf,
  onFocusFamily,
  signInHint,
  isSignedIn,
  balance,
  onBought,
  onEquipped,
}: FamilySectionProps) {
  const [busy, setBusy] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  // Choix affiché tout de suite, avant que le serveur ne recharge la page :
  // un clic qui ne montre rien pendant une seconde passe pour un clic raté.
  const [optimistic, setOptimistic] = useState<string | null>(null);
  useEffect(() => setOptimistic(null), [family.equipped]);
  const current = optimistic ?? family.equipped;

  /*
   * DES FICHES ENTIÈRES, JAMAIS UNE DEMIE. La bande disponible est mesurée,
   * et la rangée prend la largeur exacte du nombre de fiches qui y tiennent
   * — centrée dans la bande. Une fiche coupée au bord (sous le décor de
   * droite) faisait déborder la table (retour du 26/09/2026).
   */
  const bandRef = useRef<HTMLDivElement>(null);
  const rowRef = useRef<HTMLUListElement>(null);
  const [rowWidth, setRowWidth] = useState<number | null>(null);
  const [scrollable, setScrollable] = useState({ prev: false, next: false });
  const measure = useCallback(() => {
    const band = bandRef.current;
    const row = rowRef.current;
    if (!band || !row) return;
    const tile = row.firstElementChild as HTMLElement | null;
    if (tile) {
      const style = getComputedStyle(row);
      const gap = parseFloat(style.columnGap) || 0;
      const padding = parseFloat(style.paddingLeft) + parseFloat(style.paddingRight);
      const width = tile.offsetWidth;
      const fit = Math.max(1, Math.floor((band.clientWidth - padding + gap) / (width + gap)));
      const count = Math.min(fit, row.children.length);
      setRowWidth(Math.ceil(count * width + (count - 1) * gap + padding));
    }
    const max = row.scrollWidth - row.clientWidth;
    setScrollable({ prev: row.scrollLeft > 2, next: row.scrollLeft < max - 2 });
  }, []);
  useEffect(() => {
    const band = bandRef.current;
    const row = rowRef.current;
    if (!band || !row) return undefined;
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(band);
    observer.observe(row);
    row.addEventListener("scroll", measure, { passive: true });
    return () => {
      observer.disconnect();
      row.removeEventListener("scroll", measure);
    };
  }, [measure, shelf, family.options.length]);

  /** Une page = toutes les fiches visibles : la suivante arrive entière. */
  function page(direction: 1 | -1) {
    const row = rowRef.current;
    if (!row) return;
    playButtonClick();
    const gap = parseFloat(getComputedStyle(row).columnGap) || 0;
    row.scrollBy({ left: direction * (row.clientWidth + gap), behavior: "smooth" });
  }

  function choose(id: string) {
    if (id === current || !isSignedIn) return;
    playButtonClick();
    setFailure(null);
    setBusy(id);
    void equipCollectable(family.kind, id)
      .then((result) => {
        if (!result.ok) {
          setFailure(result.error ?? "Équipement impossible.");
          return;
        }
        setOptimistic(result.equipped ?? id);
        onEquipped(family.kind, result.equipped ?? id);
      })
      .finally(() => setBusy(null));
  }

  const shown = family.options.filter((option) => onShelf(option, shelf));
  const titleId = `collectables-${family.kind}`;

  return (
    <section
      ref={sectionRef}
      tabIndex={-1}
      className={styles.section}
      data-variant={variant}
      data-order={order}
      aria-labelledby={titleId}
      onFocusCapture={onFocusFamily}
      onPointerDown={onFocusFamily}
    >
      <header className={styles.banner}>
        <span className={styles.bannerIcon}>
          <FamilyIcon kind={family.kind} stackSrc={stackSrc} large />
        </span>
        <span className={styles.bannerText}>
          <h2 id={titleId} className={styles.bannerTitle}>
            {family.label}
          </h2>
          {failure ? (
            <span className={styles.bannerError} role="alert">
              {failure}
            </span>
          ) : signInHint ? (
            <span className={styles.bannerHint}>
              <Link href="/connexion" className={styles.bannerLink} onClick={() => playButtonClick()}>
                Connecte-toi
              </Link>{" "}
              pour équiper tes collectables.
            </span>
          ) : (
            <span className={styles.bannerHint}>{FAMILY_HINTS[family.kind] ?? ""}</span>
          )}
        </span>

        {/* L'étagère : ce qu'on possède, ce qu'il reste, ou tout. Le compte
            est sur l'onglet — c'est lui qui dit s'il vaut la peine d'aller voir. */}
        <span className={styles.shelfTabs} role="group" aria-label={`${family.label} affichés`}>
          {SHELVES.map((entry) => {
            const count = family.options.filter((option) => onShelf(option, entry.id)).length;
            if (entry.id === "sale" && count === 0) return null;
            return (
              <button
                key={entry.id}
                type="button"
                className={styles.shelfTab}
                data-active={shelf === entry.id ? "true" : undefined}
                aria-pressed={shelf === entry.id}
                onClick={() => onPickShelf(entry.id)}
              >
                {entry.label} <span className={styles.shelfTabCount}>{count}</span>
              </button>
            );
          })}
        </span>
        {/* L'achat se fait au Market, rayon Cosmétiques : ici on regarde et on équipe. */}
        <Link href="/market" className={styles.marketLink} onClick={() => playButtonClick()}>
          <span className={styles.marketWord}>Acheter au </span>Market →
        </Link>
      </header>

      {/* La BANDE disponible sous le bandeau : la rangée s'y centre, à la
          largeur exacte des fiches entières, ses flèches collées à ses bords. */}
      <div ref={bandRef} className={styles.band}>
        {shown.length === 0 ? (
          <p className={styles.empty}>
            {shelf === "owned"
              ? "Rien dans cette famille pour l'instant."
              : shelf === "sale"
                ? "Rien en vente dans cette famille."
                : "Tout est débloqué dans cette famille."}{" "}
            <button type="button" className={styles.emptyLink} onClick={() => onPickShelf("all")}>
              Tout voir
            </button>
          </p>
        ) : (
          <div className={styles.rowFrame} style={rowWidth ? { width: rowWidth } : undefined}>
            <button
              type="button"
              className={styles.pageArrow}
              data-side="prev"
              hidden={!scrollable.prev && !scrollable.next}
              disabled={!scrollable.prev}
              onClick={() => page(-1)}
              aria-label={`${family.label} précédents`}
            />
            <button
              type="button"
              className={styles.pageArrow}
              data-side="next"
              hidden={!scrollable.prev && !scrollable.next}
              disabled={!scrollable.next}
              onClick={() => page(1)}
              aria-label={`${family.label} suivants`}
            />
            <ul ref={rowRef} className={styles.row}>
              {shown.map((option) => (
                <Tile
                  key={option.id}
                  kind={family.kind}
                  option={option}
                  variant={variant}
                  selected={option.id === current}
                  busy={busy}
                  isSignedIn={isSignedIn}
                  balance={balance}
                  onChoose={choose}
                  onBought={onBought}
                />
              ))}
            </ul>
          </div>
        )}
      </div>
    </section>
  );
}

/* ── Une fiche épinglée ──────────────────────────────────────────────── */

function Tile({
  kind,
  option,
  variant,
  selected,
  busy,
  isSignedIn,
  balance,
  onChoose,
  onBought,
}: {
  kind: string;
  option: CollectableOption;
  variant: "large" | "compact";
  selected: boolean;
  busy: string | null;
  isSignedIn: boolean;
  balance: number;
  onChoose: (id: string) => void;
  onBought: (balance: number) => void;
}) {
  // Un Collectable sans visuel définitif se montre mais ne s'équipe pas :
  // l'équiper reviendrait à jouer avec le voile « à venir ».
  const equippable = option.owned && !option.artPending;
  const forSale = isSignedIn && !option.owned && option.priceTides !== null;
  const name = option.masked ? "À découvrir" : option.label;

  return (
    <li
      className={styles.tile}
      data-kind={kind}
      data-selected={selected ? "true" : undefined}
      data-locked={option.owned ? undefined : "true"}
    >
      <span className={styles.art} data-veiled={option.artHidden ? "true" : undefined}>
        {/* eslint-disable-next-line @next/next/no-img-element -- asset local, taille pilotée par le conteneur */}
        <img src={option.src} alt="" aria-hidden draggable={false} />
      </span>
      {selected && !option.masked && <span className={styles.badge}>{option.artPending ? "Obtenu" : "Équipé"}</span>}
      <span className={styles.plate}>
        <span className={styles.plateText}>{name}</span>
      </span>
      {variant === "large" && <span className={styles.description}>{option.masked ? "" : option.description}</span>}

      {forSale ? (
        <BuyButton kind={kind} option={option} balance={balance} onBought={onBought} />
      ) : (
        <TileAction
          option={option}
          compact={variant === "compact"}
          selected={selected}
          equippable={equippable}
          busy={busy === option.id}
          disabled={!equippable || busy !== null || !isSignedIn}
          onClick={() => onChoose(option.id)}
        />
      )}
    </li>
  );
}

/** Ce que dit le bouton d'une fiche : équiper, équipé, ou pourquoi pas encore. */
function TileAction({
  option,
  compact,
  selected,
  equippable,
  busy,
  disabled,
  onClick,
}: {
  option: CollectableOption;
  /** Fiche compacte : une plaque plus courte. */
  compact: boolean;
  selected: boolean;
  equippable: boolean;
  busy: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  let label: string;
  let detail: string | undefined;
  // La plaque dit déjà « À découvrir » : le bouton dit pourquoi on ne peut pas l'équiper.
  if (option.masked) label = "Verrouillé";
  else if (!option.owned) {
    // La condition ENTIÈRE en infobulle ; dans la plaque, ce qui y tient sur
    // une ligne — la progression d'abord sacrifiée sur une fiche compacte.
    const requirement = option.requirement ?? "Verrouillé";
    const full = option.progress ? `${requirement} · ${option.progress}` : requirement;
    label = compact || full.length > 22 ? requirement : full;
    detail = full;
  } else if (option.artPending) label = "Obtenu · visuel à venir";
  else if (selected) label = "Équipé";
  else label = busy ? "…" : "Équiper";

  return (
    <button
      type="button"
      className={styles.action}
      data-muted={!equippable || selected ? "true" : undefined}
      data-long={label.length > (compact ? 11 : 16) ? "true" : undefined}
      onClick={onClick}
      disabled={disabled || selected}
      aria-pressed={equippable ? selected : undefined}
      title={detail}
    >
      <span className={styles.actionText}>{label}</span>
    </button>
  );
}

/**
 * Bouton d'achat d'un Collectable en vente et pas encore possédé — la même
 * plaque que « Équiper », à la place d'« Équiper ». Deux temps : le prix,
 * puis la confirmation.
 */
function BuyButton({
  kind,
  option,
  balance,
  onBought,
}: {
  kind: string;
  option: CollectableOption;
  balance: number;
  onBought: (balance: number) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const price = option.priceTides ?? 0;
  const affordable = balance >= price;

  function buy() {
    playButtonClick();
    setBusy(true);
    setError(null);
    void purchaseCollectable(kind, option.id)
      .then((result) => {
        if (!result.ok) {
          setError(result.error ?? "Achat impossible.");
          setConfirming(false);
          return;
        }
        onBought(result.balance ?? balance - price);
      })
      .finally(() => setBusy(false));
  }

  if (confirming) {
    return (
      <span className={styles.buyRow}>
        <button type="button" className={styles.action} onClick={buy} disabled={busy}>
          <span className={styles.actionText}>{busy ? "Achat…" : "Confirmer"}</span>
        </button>
        <button
          type="button"
          className={styles.buyCancel}
          onClick={() => {
            playButtonClick();
            setConfirming(false);
          }}
          disabled={busy}
          aria-label="Annuler l'achat"
        >
          ✕
        </button>
      </span>
    );
  }

  return (
    <span className={styles.buyRow}>
      <button
        type="button"
        className={styles.action}
        data-buy="true"
        onClick={() => {
          playButtonClick();
          setError(null);
          setConfirming(true);
        }}
        disabled={!affordable}
        title={error ?? (affordable ? undefined : `Il te manque ${price - balance} Tides`)}
      >
        <span className={styles.actionText}>
          Acheter · {price} <TideCoin size={12} />
        </span>
      </button>
    </span>
  );
}

/* ── Icônes gravées ──────────────────────────────────────────────────── */

/**
 * L'icône d'une famille : pour les dos, DEUX dos en éventail — celui qu'on
 * a équipé, pas un pictogramme ; pour les cadres, une barre de navire
 * gravée à l'encre.
 */
function FamilyIcon({ kind, stackSrc, large = false }: { kind: string; stackSrc: string | null; large?: boolean }) {
  if (kind === "cardBack" && stackSrc) {
    return (
      <span className={styles.cardStack} data-large={large ? "true" : undefined} aria-hidden>
        {/* eslint-disable-next-line @next/next/no-img-element -- miniature du dos équipé */}
        <img src={stackSrc} alt="" draggable={false} style={{ "--turn": "-12deg" } as CSSProperties} />
        {/* eslint-disable-next-line @next/next/no-img-element -- miniature du dos équipé */}
        <img src={stackSrc} alt="" draggable={false} style={{ "--turn": "8deg" } as CSSProperties} />
      </span>
    );
  }
  return <HelmIcon />;
}

function AnchorIcon() {
  return (
    <svg className={styles.inkIcon} viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="16" cy="6" r="2.6" />
      <path d="M16 8.6V28" />
      <path d="M10 13h12" />
      <path d="M5 19c0 5 5 9 11 9s11-4 11-9" />
      <path d="M3 20.5 5 18l2.6 2" />
      <path d="M29 20.5 27 18l-2.6 2" />
    </svg>
  );
}

function HelmIcon() {
  const spokes = Array.from({ length: 8 }, (_, i) => (i * Math.PI) / 4);
  return (
    <svg className={styles.inkIcon} viewBox="0 0 40 40" fill="none" stroke="currentColor" strokeLinecap="round" aria-hidden>
      <circle cx="20" cy="20" r="10.5" strokeWidth={2.6} />
      <circle cx="20" cy="20" r="3.4" strokeWidth={2.2} />
      {spokes.map((angle) => (
        <g key={angle}>
          <line
            x1={20 + Math.cos(angle) * 3.4}
            y1={20 + Math.sin(angle) * 3.4}
            x2={20 + Math.cos(angle) * 15.5}
            y2={20 + Math.sin(angle) * 15.5}
            strokeWidth={2.2}
          />
          <circle cx={20 + Math.cos(angle) * 17} cy={20 + Math.sin(angle) * 17} r={1.8} fill="currentColor" stroke="none" />
        </g>
      ))}
    </svg>
  );
}

