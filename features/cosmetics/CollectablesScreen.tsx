"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { equipCollectable, purchaseCollectable } from "@/features/cosmetics/collectablesActions";
import { useCardBack } from "@/features/cosmetics/CardBackProvider";
import { useShipFrame } from "@/features/cosmetics/ShipFrameProvider";
import type { CollectableFamilyView, CollectableOption, CollectablesView } from "@/features/cosmetics/collectablesService";
import { GameScreen } from "@/features/shell/GameScreen";
import { TideCoin } from "@/features/shell/GameIcons";
import browser from "@/features/collection/CardBrowser.module.css";
import game from "@/features/shell/GameScreen.module.css";
import styles from "@/features/cosmetics/Collectables.module.css";
import { notifyProgressionChanged } from "@/features/progression/progressionSync";
import { playButtonClick } from "@/lib/sound";

/** Ce que chaque famille annonce en tête de vitrine. */
const FAMILY_HINTS: Record<string, string> = {
  cardBack: "Visible par ton adversaire dès le premier tour.",
  shipSkin: "Le cadre qui porte ton Navire sur le plateau.",
};

/**
 * CE QU'ON REGARDE. La vitrine s'ouvre sur ce qu'on POSSÈDE — c'est la
 * collection du joueur, et elle doit lui appartenir avant de lui montrer
 * ce qui lui manque. Le reste est à un clic.
 */
type Shelf = "owned" | "sale" | "locked" | "all";

/**
 * « En vente » existe parce que l'étagère par défaut, en ne montrant que le
 * possédé, faisait disparaître tous les boutons d'achat : ils ne vivent que
 * sous un objet NON possédé. Le rayon d'achat avait donc sa propre porte à
 * retrouver, ce qui n'est pas une porte.
 *
 * Il ne s'affiche que s'il a quelque chose à vendre — un onglet vide
 * n'annonce rien.
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
 * Même écran que les Cartes : les familles en colonne à gauche, la vitrine
 * à droite. L'écran ne connaît AUCUNE condition de déblocage : le service
 * les a déjà traduites en trois états, et c'est tout ce qu'il affiche —
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
  const [kind, setKind] = useState<string>(view.families[0]?.kind ?? "cardBack");
  /*
   * Hors session, « Possédés » ne montrerait que le gratuit : on ouvre
   * alors sur tout, sinon la vitrine paraît vide au premier venu.
   */
  const [shelf, setShelf] = useState<Shelf>(view.isSignedIn ? "owned" : "all");
  // Le solde est affiché ET sert à décider ce qui est à portée : il doit
  // baisser dès l'achat confirmé, sans attendre le rechargement serveur.
  const [balance, setBalance] = useState(view.balance);
  useEffect(() => setBalance(view.balance), [view.balance]);
  const current = view.families.find((family) => family.kind === kind) ?? view.families[0];

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

  if (!current) return null;

  return (
    <GameScreen active="collectables">
      <div className={browser.workspace}>
        <aside className={`${game.panel} ${browser.sidebar}`} aria-label="Familles de collectables">
          <div className={browser.sidebarInner}>
            <section className={browser.filterSection}>
              <h2 className={browser.sectionTitle}>Collectables</h2>
              <div className={browser.filterList}>
                {view.families.map((family) => {
                  const owned = family.options.filter((option) => option.owned).length;
                  return (
                    <button
                      key={family.kind}
                      type="button"
                      className={`${browser.filterRow} ${kind === family.kind ? browser.filterRowActive : ""}`}
                      aria-pressed={kind === family.kind}
                      onClick={() => {
                        playButtonClick();
                        setKind(family.kind);
                      }}
                    >
                      <span className={browser.filterLabel}>{family.label}</span>
                      <span className={browser.filterCount}>
                        {view.isSignedIn ? `${owned}/${family.options.length}` : family.options.length}
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>
          </div>
        </aside>

        <main className={`${game.panel} ${browser.main}`}>
          <div className={browser.toolbar}>
            <p className={browser.count}>
              <strong>{current.label}</strong> · {FAMILY_HINTS[current.kind] ?? ""}
            </p>

            {/* L'étagère : ce qu'on possède, ce qu'il reste, ou tout. Le
                compte est sur l'onglet — c'est lui qui dit s'il vaut la
                peine d'aller voir. */}
            <span className={styles.shelfTabs} role="group" aria-label="Ce qui est affiché">
              {SHELVES.map((entry) => {
                const count = current.options.filter((option) => onShelf(option, entry.id)).length;
                // « En vente » ne s'annonce que s'il a un rayon : un onglet
                // vide ferait croire à une boutique fermée.
                if (entry.id === "sale" && count === 0) return null;
                return (
                  <button
                    key={entry.id}
                    type="button"
                    className={styles.shelfTab}
                    data-active={shelf === entry.id ? "true" : undefined}
                    aria-pressed={shelf === entry.id}
                    onClick={() => {
                      playButtonClick();
                      setShelf(entry.id);
                    }}
                  >
                    {entry.label} <span className={styles.shelfTabCount}>{count}</span>
                  </button>
                );
              })}
            </span>
            {/* L'achat se fait au Market, rayon Cosmétiques : ici on regarde et on équipe. */}
            <p className={browser.count}>
              <Link href="/market" className={game.link} onClick={() => playButtonClick()}>
                Acheter au Market →
              </Link>
            </p>
            {view.isSignedIn && (
              <p className={browser.count}>
                <TideCoin size={14} /> {balance} Tides
              </p>
            )}
          </div>

          <div className={styles.showcase}>
            {!view.isSignedIn && (
              <p className={game.muted}>
                <Link href="/connexion" className={game.link} onClick={() => playButtonClick()}>
                  Connecte-toi
                </Link>{" "}
                pour équiper tes collectables : ils sont enregistrés sur ton compte.
              </p>
            )}
            <Showcase
              key={current.kind}
              family={current}
              shelf={shelf}
              isSignedIn={view.isSignedIn}
              balance={balance}
              onBought={afterPurchase}
              onEquipped={afterEquip}
              onShowAll={() => {
                playButtonClick();
                setShelf("all");
              }}
            />
          </div>
        </main>
      </div>
    </GameScreen>
  );
}

/** L'état d'un objet, dit en une ligne sous sa vignette. */
function hintFor(option: CollectableOption, action: string | null): string {
  if (option.masked) return "À découvrir";
  if (!option.owned) return option.progress ? `${option.requirement} · ${option.progress}` : (option.requirement ?? "Verrouillé");
  if (option.artPending) return "Obtenu · visuel à venir";
  return action ?? "Obtenu";
}

/**
 * Bouton d'achat d'un Collectable en vente et pas encore possédé.
 *
 * Il vit ICI, sous la vignette, plutôt qu'au Market : c'est là qu'on
 * regarde le cadre en grand, à côté de ceux qu'on a déjà. Le rayon
 * Cosmétiques du Market reste à dresser — il demande d'abord que le Market
 * sache changer de rayon, ce qu'il ne fait pas encore.
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
        <button type="button" className={styles.buyButton} onClick={buy} disabled={busy}>
          {busy ? "Achat…" : "Confirmer"}
        </button>
        <button
          type="button"
          className={styles.buyCancel}
          onClick={() => {
            playButtonClick();
            setConfirming(false);
          }}
          disabled={busy}
        >
          Annuler
        </button>
      </span>
    );
  }

  return (
    <span className={styles.buyRow}>
      <button
        type="button"
        className={styles.buyButton}
        onClick={() => {
          playButtonClick();
          setError(null);
          setConfirming(true);
        }}
        disabled={!affordable}
        title={affordable ? undefined : `Il te manque ${price - balance} Tides`}
      >
        <TideCoin size={13} /> Acheter · {price}
      </button>
      {error && <span className={styles.buyError}>{error}</span>}
    </span>
  );
}

function Vignette({
  option,
  boxClass,
  imageClass,
}: {
  option: CollectableOption;
  boxClass: string | undefined;
  imageClass: string | undefined;
}) {
  return (
    // `data-veiled` et non `data-masked` : c'est la présence du VOILE qui
    // décide du traitement, pas la raison pour laquelle il est là.
    <span className={boxClass} data-veiled={option.artHidden ? "true" : undefined}>
      {/* eslint-disable-next-line @next/next/no-img-element -- asset local, taille pilotée par le conteneur */}
      <img src={option.src} alt="" aria-hidden draggable={false} className={imageClass} />
      {option.equipped && !option.masked && <span className={styles.badge}>{option.artPending ? "Obtenu" : "Équipé"}</span>}
    </span>
  );
}

/** Gabarit de vignette propre à chaque famille. */
const BOX_CLASS: Record<string, { box: string | undefined; image: string | undefined }> = {
  cardBack: { box: styles.cardBackFrame, image: styles.cardBackImage },
  shipSkin: { box: styles.shipFrameBox, image: styles.shipFrameImage },
};

/**
 * La vitrine d'une famille — UNE seule, pour les deux.
 *
 * Elle l'était en deux : les dos s'équipaient, les cadres se regardaient.
 * Les cadres s'équipent maintenant eux aussi, par la même fonction en base
 * (`equip_cosmetic`, qui ne connaît que « famille + identifiant »), et il
 * ne restait plus qu'un gabarit de vignette à distinguer.
 *
 * Le seul reste de spécifique : le dos équipé est MIROITÉ localement
 * (`CardBackProvider`), parce qu'il doit s'afficher en partie sur des
 * écrans qui ne lisent pas la session. Le cadre, lui, n'a pas encore besoin
 * de ce relais — le plateau ne l'affiche pas.
 */
function Showcase({
  family,
  shelf,
  isSignedIn,
  balance,
  onBought,
  onEquipped,
  onShowAll,
}: {
  family: CollectableFamilyView;
  shelf: Shelf;
  isSignedIn: boolean;
  balance: number;
  onBought: (balance: number) => void;
  onEquipped: (kind: string, id: string) => void;
  onShowAll: () => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  // Choix affiché tout de suite, avant que le serveur ne recharge la page :
  // un clic qui ne montre rien pendant une seconde passe pour un clic raté.
  const [optimistic, setOptimistic] = useState<string | null>(null);
  useEffect(() => setOptimistic(null), [family.equipped]);
  const current = optimistic ?? family.equipped;
  const gabarit = BOX_CLASS[family.kind] ?? { box: undefined, image: undefined };

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

  if (shown.length === 0) {
    const empty =
      shelf === "owned"
        ? "Rien dans cette famille pour l'instant."
        : shelf === "sale"
          ? "Rien en vente dans cette famille."
          : "Tout est débloqué dans cette famille.";
    return (
      <p className={game.muted}>
        {empty}{" "}
        <button type="button" className={game.link} onClick={onShowAll}>
          Tout voir
        </button>
      </p>
    );
  }

  return (
    <>
      <ul className={styles.grid}>
        {shown.map((option) => {
          const selected = option.id === current;
          // Un Collectable sans visuel définitif se montre mais ne s'équipe
          // pas : l'équiper reviendrait à jouer avec le voile « à venir ».
          const equippable = option.owned && !option.artPending;
          return (
            <li
              key={option.id}
              className={styles.itemShell}
              data-selected={selected ? "true" : undefined}
              data-locked={option.owned ? undefined : "true"}
            >
              <button
                type="button"
                className={styles.item}
                onClick={() => choose(option.id)}
                disabled={!equippable || busy !== null || !isSignedIn}
                aria-pressed={selected}
              >
                <Vignette option={{ ...option, equipped: selected }} boxClass={gabarit.box} imageClass={gabarit.image} />
                <span className={styles.itemName}>{option.label}</span>
                <span className={styles.itemText}>{option.description}</span>
                <span className={styles.itemHint}>
                  {hintFor(option, selected ? "Équipé" : busy === option.id ? "…" : "Équiper")}
                </span>
              </button>
              {isSignedIn && !option.owned && option.priceTides !== null && (
                <BuyButton kind={family.kind} option={option} balance={balance} onBought={onBought} />
              )}
            </li>
          );
        })}
      </ul>
      {failure && <p className={game.error}>{failure}</p>}
    </>
  );
}
