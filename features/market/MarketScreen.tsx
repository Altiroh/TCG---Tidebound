"use client";

import { useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import Link from "next/link";
import { GameScreen } from "@/features/shell/GameScreen";
import game from "@/features/shell/GameScreen.module.css";
import styles from "@/features/market/Market.module.css";
import { PreconToken, TideCoin } from "@/features/shell/GameIcons";
import { ScreenToast, type ScreenToastMessage } from "@/features/shell/ScreenToast";
import type { BoosterInventory, BoosterInventoryEntry } from "@/features/boosters/actions";
import { MAX_PURCHASE_QUANTITY } from "@/features/boosters/constants";
import { SHELF_BOOSTER_IDS } from "@/game/boosters";
import { closedPackVariables, getBoosterPackVisual } from "@/features/boosters/opening/boosterPackVisuals";
import { checkoutCart, type CheckoutCart, type CheckoutCartResult } from "@/features/market/actions";
import type { CollectablesView } from "@/features/cosmetics/collectablesService";
import type { DeckCatalogSummary } from "@/features/decks/catalogActions";
import type { CatalogDeckView } from "@/features/decks/catalogService";
import { DeckBox } from "@/features/decks/DeckBox";
import { nameplateArtUrl } from "@/features/decks/nameplateArt";
import { notifyProgressionChanged } from "@/features/progression/progressionSync";
import { playAddToCart, playButtonClick, playMarketBuy, playTabClick } from "@/lib/sound";
import { BoosterContentsDialog } from "@/features/market/BoosterContentsDialog";
import { MicroLoader } from "@/features/shell/MicroLoader";
import { StatusTag } from "@/features/shell/StatusTag";
import { useOpaqueBox } from "@/features/shell/useOpaqueBox";
import { MAX_PRECON_TOKENS_PER_PURCHASE, PRECON_TOKEN_PRICE_TIDES, PRECON_TOKENS_WEEKLY_LIMIT } from "@/game/economy/constants";

interface MarketScreenProps {
  inventory: BoosterInventory;
  /** Les préconstruits à Jeton — le rayon Decks. */
  catalog: DeckCatalogSummary;
  /** Les Collectables, dont ceux en vente — le rayon Cosmétiques. */
  collectables: CollectablesView;
  /** Jetons de Préconstruit encore achetables cette semaine (`readPreconTokenAllowance`). Absent : la limite entière. */
  tokenAllowance?: number;
  /**
   * Laboratoire (`/game/market-preview`) : l'achat est SIMULÉ, aucune Server
   * Action n'est appelée — la page est publique et ses chiffres inventés.
   */
  sandbox?: boolean;
  /** Rayon ouvert à l'arrivée (laboratoire). */
  initialSection?: SectionId;
  /** Laboratoire : le panier arrive garni, pour régler son cadre. */
  initialCartFilled?: boolean;
}

/**
 * Le panier, commun aux trois rayons : il survit au changement de rayon,
 * pour tout acheter d'un coup. Les boosters s'y mettent par quantité, les
 * decks (un Jeton chacun) et les cosmétiques (en Tides, ou en Jetons) à l'unité.
 */
interface Cart {
  boosters: Record<string, number>;
  /** Jetons de Préconstruit achetés en Tides (rayon Monnaie). */
  tokens: number;
  decks: string[];
  /** Clés `famille:id`. */
  cosmetics: string[];
}

const EMPTY_CART: Cart = { boosters: {}, tokens: 0, decks: [], cosmetics: [] };

/** Trois socles par ponton (`market/pedestals.webp`) : au-delà, les articles attendent dehors et la vitrine défile en boucle. */
const PACKS_PER_PLATE = 3;

/**
 * Les emplacements HORS socles, dans l'ordre où ils se remplissent : à
 * droite d'abord (le suivant), puis à gauche (le précédent), puis plus
 * loin. Avec quatre articles, un seul attend dehors, à droite.
 */
const OUTSIDE_SLOTS = [3, -1, 4, -2] as const;

/** Les rayons qui se tiennent dans cet écran. */
/** Rang d'un booster sur le rayon ; un booster inconnu du rayon passe en dernier. */
function shelfRank(boosterId: string): number {
  const rank = SHELF_BOOSTER_IDS.indexOf(boosterId);
  return rank === -1 ? SHELF_BOOSTER_IDS.length : rank;
}

type SectionId = "boosters" | "decks" | "cosmetics" | "monnaie";

/*
 * Rayons de la boutique, en onglets du bandeau.
 *
 * Changer de rayon change ce qui est posé sur les socles — sachets, decks
 * à Jeton, cosmétiques à Tides — et le panier reste le même. Les écrans
 * Decks et Collectables restent les vitrines complètes (fiches,
 * équipement, possession) : un lien discret sous le ponton y mène.
 * Monnaie (27/10/2026) : des Tides contre des Jetons de Préconstruit.
 * Les Offres spéciales viendront ici quand elles ouvriront.
 */
const SECTIONS: ReadonlyArray<{ id: SectionId; label: string }> = [
  { id: "boosters", label: "Boosters" },
  { id: "decks", label: "Decks" },
  { id: "cosmetics", label: "Cosmétiques" },
  { id: "monnaie", label: "Monnaie" },
];

const cosmeticKey = (family: string, id: string) => `${family}:${id}`;

function plural(count: number, singular: string, pluralForm = `${singular}s`): string {
  return `${count} ${count > 1 ? pluralForm : singular}`;
}

/**
 * MARKET — la boutique. Trois rayons sur un même quai de nuit
 * (`market/background.webp`), dans la matière de la cabine (plaques à
 * filet d'or — comme Profil et Récompenses) :
 *   - en haut à gauche, dans le BANDEAU : les rayons en onglets ; en
 *     changer change ce qui est posé sur les socles, sans quitter l'écran
 *     ni vider le panier ;
 *   - au centre, le PONTON : trois socles, chaque offre avec sa plaque de
 *     prix ; au-delà de trois articles, les autres attendent autour et la
 *     vitrine défile en boucle (flèches, doigt, pavé tactile) ;
 *   - en bas, le PANIER dans son cadre de laiton, commun aux trois rayons :
 *     boosters par quantité, decks à Jeton et cosmétiques à l'unité, deux
 *     sous-totaux (Tides, Jetons), un seul bouton Acheter.
 *
 * Le solde n'est PAS répété ici : le bandeau le porte, et il est relu
 * après chaque achat (`notifyProgressionChanged`).
 *
 * Rien de l'économie n'est décidé ici : chaque achat passe par une Server
 * Action autoritaire (`purchase_booster`, `unlockPreconDeck`,
 * `purchase_cosmetic`) qui revérifie prix, disponibilité et solde.
 */
export function MarketScreen({ inventory, catalog, collectables, sandbox = false, initialSection = "boosters", initialCartFilled = false, tokenAllowance = PRECON_TOKENS_WEEKLY_LIMIT }: MarketScreenProps) {
  const [section, setSection] = useState<SectionId>(initialSection);
  const [cart, setCart] = useState<Cart>(() => (initialCartFilled ? sampleCart(inventory, catalog, collectables) : EMPTY_CART));
  const [isBuying, setIsBuying] = useState(false);
  const [toast, setToast] = useState<ScreenToastMessage | null>(null);
  /** Booster dont on consulte le contenu. */
  const [contentsOf, setContentsOf] = useState<BoosterInventoryEntry | null>(null);
  const ownedSet = useMemo(() => new Set(inventory.ownedCardIds), [inventory.ownedCardIds]);
  const ownedArtworkSet = useMemo(() => new Set(inventory.ownedArtworks ?? []), [inventory.ownedArtworks]);

  // Un booster non achetable (le Mini Booster de Bienvenue, offert) n'a rien
  // à faire dans une boutique : il s'obtient, il ne se vend pas.
  // Dans l'ordre du rayon (`SHELF_BOOSTER_IDS`) : le booster de base, puis
  // les extensions de la plus ANCIENNE à la plus récente — comme l'étagère
  // de Mes boosters, et pas dans l'ordre alphabétique de la base.
  const onSale = useMemo(
    () =>
      inventory.boosters
        .filter((booster) => booster.isPurchasable && booster.price !== null)
        .sort((a, b) => shelfRank(a.boosterId) - shelfRank(b.boosterId)),
    [inventory.boosters]
  );

  /** Les cosmétiques EN VENTE, toutes familles confondues. */
  const cosmeticsOnSale = useMemo(
    () =>
      collectables.families.flatMap((family) =>
        family.options
          .filter((option) => (option.priceTides !== null || option.priceTokens !== null) && !option.masked)
          .map((option) => ({ key: cosmeticKey(family.kind, option.id), family: family.kind, familyLabel: family.label, option }))
      ),
    [collectables.families]
  );

  /**
   * Le rayon au Jeton seulement (15/10/2026) : les starters viennent de la
   * première mission, les decks retirés ne se vendent plus — même à qui les
   * possède, ils restent dans Decks, pas au Market.
   */
  const shopDecks = useMemo(() => catalog.decks.filter((entry) => entry.deck.offer === "shop"), [catalog.decks]);

  // ── Le panier, ligne par ligne ───────────────────────────────────
  const boosterLines = onSale.filter((booster) => (cart.boosters[booster.boosterId] ?? 0) > 0);
  const deckLines = shopDecks.filter((entry) => cart.decks.includes(entry.deck.id) && !entry.unlocked);
  const cosmeticLines = cosmeticsOnSale.filter((row) => cart.cosmetics.includes(row.key) && !row.option.owned);

  const boosterCount = boosterLines.reduce((sum, booster) => sum + (cart.boosters[booster.boosterId] ?? 0), 0);
  const itemCount = boosterCount + cart.tokens + deckLines.length + cosmeticLines.length;
  const tidesTotal =
    boosterLines.reduce((sum, booster) => sum + (booster.price ?? 0) * (cart.boosters[booster.boosterId] ?? 0), 0) +
    cart.tokens * PRECON_TOKEN_PRICE_TIDES +
    cosmeticLines.reduce((sum, row) => sum + (row.option.priceTides ?? 0), 0);
  // Un cosmétique peut aussi se payer en Jetons (« La Consigne ») : il
  // rejoint alors le sous-total des decks, pas celui des Tides.
  const tokensTotal = deckLines.length + cosmeticLines.reduce((sum, row) => sum + (row.option.priceTokens ?? 0), 0);
  const shortTides = Math.max(0, tidesTotal - inventory.balance);
  // Les Jetons achetés dans le même panier passent avant les decks : ils comptent.
  const shortTokens = Math.max(0, tokensTotal - catalog.preconTokens - cart.tokens);
  /** Exemplaires en réserve, tous types confondus — offerts compris (Bienvenue). */
  const ownedCount = inventory.boosters.reduce((sum, booster) => sum + booster.owned, 0);

  function setQuantity(boosterId: string, quantity: number) {
    setCart((current) => ({
      ...current,
      boosters: { ...current.boosters, [boosterId]: Math.min(MAX_PURCHASE_QUANTITY, Math.max(0, quantity)) },
    }));
  }

  /** Le son d'un geste sur le panier : un article qui RENTRE a le sien, le reste garde le clic. */
  function cartSound(adds: boolean) {
    if (adds) playAddToCart();
    else playButtonClick();
  }

  function step(boosterId: string, delta: number) {
    const current = cart.boosters[boosterId] ?? 0;
    cartSound(delta > 0 && current < MAX_PURCHASE_QUANTITY);
    setQuantity(boosterId, current + delta);
  }

  /** Jetons que le panier peut encore prendre : la limite de la semaine, moins ce qui est déjà acheté. */
  const tokenCap = Math.max(0, Math.min(MAX_PRECON_TOKENS_PER_PURCHASE, tokenAllowance));

  function stepTokens(delta: number) {
    cartSound(delta > 0 && cart.tokens < tokenCap);
    setCart((current) => ({ ...current, tokens: Math.min(tokenCap, Math.max(0, current.tokens + delta)) }));
  }

  function toggleDeck(deckId: string) {
    cartSound(!cart.decks.includes(deckId));
    setCart((current) => ({
      ...current,
      decks: current.decks.includes(deckId) ? current.decks.filter((id) => id !== deckId) : [...current.decks, deckId],
    }));
  }

  function toggleCosmetic(key: string) {
    cartSound(!cart.cosmetics.includes(key));
    setCart((current) => ({
      ...current,
      cosmetics: current.cosmetics.includes(key) ? current.cosmetics.filter((id) => id !== key) : [...current.cosmetics, key],
    }));
  }

  function clearCart() {
    playButtonClick();
    setCart(EMPTY_CART);
  }

  function showToast(tone: ScreenToastMessage["tone"], text: React.ReactNode, action?: React.ReactNode) {
    setToast({ id: Date.now(), tone, text, action });
  }

  /**
   * Tout le panier, d'un coup : boosters, puis decks, puis cosmétiques —
   * chaque article est une transaction atomique côté base. On s'arrête au
   * premier refus ; ce qui n'a pas été acheté reste dans le panier, rien
   * n'a été débité pour lui. À la fin, le récapitulatif de ce qui est parti.
   */
  async function handleCheckout() {
    if (isBuying || itemCount === 0) return;
    playButtonClick();
    setIsBuying(true);

    // UN seul appel serveur pour tout le panier (`checkoutCart`) : mêmes
    // achats, même ordre, même arrêt au premier refus qu'avant, mais une
    // seule revalidation et un seul rendu de /market en retour.
    const lines: CheckoutCart = {
      boosters: boosterLines.map((booster) => ({ boosterId: booster.boosterId, quantity: cart.boosters[booster.boosterId] ?? 0 })),
      ...(cart.tokens > 0 ? { tokens: cart.tokens } : {}),
      decks: deckLines.map((entry) => entry.deck.id),
      cosmetics: cosmeticLines.map((row) => ({ kind: row.family, id: row.option.id })),
    };
    const outcome: CheckoutCartResult = sandbox
      ? // Laboratoire : tout réussit, rien n'est écrit — le récapitulatif vient des prix affichés.
        {
          ok: true,
          bought: { boosters: boosterCount, tokensBought: cart.tokens, decks: deckLines.length, cosmetics: cosmeticLines.length, tides: tidesTotal, tokens: tokensTotal },
          purchased: lines,
          remaining: { boosters: [], decks: [], cosmetics: [] },
        }
      : await checkoutCart(lines);
    const { bought } = outcome;
    const failure = outcome.ok ? null : (outcome.error ?? "Achat impossible.");

    // Ce qui est parti quitte le panier ; le reste (refusé, ou pas tenté) y demeure.
    const remaining: Cart = { boosters: { ...cart.boosters }, tokens: outcome.purchased.tokens ? 0 : cart.tokens, decks: [...cart.decks], cosmetics: [...cart.cosmetics] };
    for (const line of outcome.purchased.boosters) remaining.boosters[line.boosterId] = 0;
    remaining.decks = remaining.decks.filter((id) => !outcome.purchased.decks.includes(id));
    remaining.cosmetics = remaining.cosmetics.filter((key) => !outcome.purchased.cosmetics.some((line) => cosmeticKey(line.kind, line.id) === key));

    setIsBuying(false);
    setCart(remaining);

    const boughtCount = bought.boosters + bought.tokensBought + bought.decks + bought.cosmetics;
    if (boughtCount > 0) {
      // Même partiel, un achat a eu lieu : il s'entend.
      playMarketBuy();
      if (!sandbox) notifyProgressionChanged();
      // Pas de router.refresh() : `checkoutCart` a revalidé une fois, et sa
      // réponse porte déjà la page relue (audit de fluidité du 14/10/2026).
    }

    const recap = [
      bought.boosters > 0 ? plural(bought.boosters, "booster") : "",
      bought.tokensBought > 0 ? plural(bought.tokensBought, "Jeton de Préconstruit", "Jetons de Préconstruit") : "",
      bought.decks > 0 ? plural(bought.decks, "deck") : "",
      bought.cosmetics > 0 ? plural(bought.cosmetics, "cosmétique") : "",
    ]
      .filter(Boolean)
      .join(" · ");
    const spent = [bought.tokens > 0 ? plural(bought.tokens, "Jeton") : "", bought.tides > 0 ? `${bought.tides} Tides` : ""].filter(Boolean).join(" et ");

    if (failure) {
      showToast("error", boughtCount > 0 ? `${recap} acheté${boughtCount > 1 ? "s" : ""}, puis : ${failure}` : failure);
      return;
    }

    showToast(
      "success",
      <>
        {recap} — {spent} dépensé{bought.tokens + bought.tides > 1 ? "s" : ""}
      </>,
      bought.boosters > 0 ? (
        <Link href="/boosters" onClick={() => playButtonClick()}>
          Ouvrir →
        </Link>
      ) : bought.decks > 0 || bought.tokensBought > 0 ? (
        <Link href="/partie" onClick={() => playButtonClick()}>
          Jouer →
        </Link>
      ) : (
        <Link href="/collectables" onClick={() => playButtonClick()}>
          Équiper →
        </Link>
      )
    );
  }

  const stageLabel =
    section === "boosters" ? "Boosters en vente" : section === "decks" ? "Decks à Jeton" : section === "monnaie" ? "Change de monnaie" : "Cosmétiques en vente";
  const shortage = [shortTokens > 0 ? plural(shortTokens, "Jeton") : "", shortTides > 0 ? `${shortTides} Tides` : ""].filter(Boolean).join(" et ");

  return (
    <GameScreen
      active="market"
      nav="minimal"
      className={section === "decks" ? styles.screenDecks : undefined}
      // Les rayons sont des onglets du BANDEAU, en haut à gauche, comme ceux
      // de la collection et du Profil (retour du 13/10/2026).
      tabs={SECTIONS.map((entry) => ({
        id: entry.id,
        active: entry.id === section,
        onSelect: () => {
          playTabClick();
          setSection(entry.id);
        },
        label: entry.label,
      }))}
      actions={
        inventory.isSignedIn ? (
          <Link href="/boosters" className={styles.reserveLink} data-waiting={ownedCount > 0 ? "true" : "false"} onClick={() => playButtonClick()}>
            <span className={styles.reserveIcon} style={closedPackVariables(getBoosterPackVisual("standard"))} aria-hidden />
            <span className={styles.reserveTitle}>Mes boosters</span>
            <span className={styles.reserveCount}>{ownedCount > 0 ? ownedCount : "0"}</span>
          </Link>
        ) : undefined
      }
    >
      <div className={styles.market}>
        <h1 className="sr-only">Market</h1>
        {/* ── Le ponton : les articles du rayon sur leurs socles ─── */}
        <section className={styles.stage} aria-label={stageLabel}>
          {!inventory.isSignedIn ? (
            <div className={`${game.cabinFrame} ${game.empty} ${styles.notice}`}>
              <p className={game.emptyTitle}>Connecte-toi pour acheter</p>
              <p className={game.muted}>Tes Tides, tes boosters et ta collection sont enregistrés sur ton compte.</p>
              <Link href="/connexion" className={game.primary} onClick={() => playButtonClick()} style={{ marginTop: 6 }}>
                Se connecter
              </Link>
            </div>
          ) : section === "boosters" ? (
            onSale.length === 0 ? (
              <div className={`${game.cabinFrame} ${game.empty} ${styles.notice}`}>
                <p className={game.emptyTitle}>Rien en vente pour l&apos;instant</p>
                <p className={game.muted}>
                  Le catalogue de boosters est vide en base. Applique les migrations Supabase, puis lance <code>npm run seed:cards</code>.
                </p>
              </div>
            ) : (
              <Showcase
                key="boosters"
                label="boosters"
                count={onSale.length}
                render={(index) => {
                  const booster = onSale[index]!;
                  return (
                  <PedestalItem
                    key={booster.boosterId}
                    booster={booster}
                    inCart={cart.boosters[booster.boosterId] ?? 0}
                    disabled={isBuying || (cart.boosters[booster.boosterId] ?? 0) >= MAX_PURCHASE_QUANTITY}
                    onAdd={() => step(booster.boosterId, 1)}
                    ownedInPool={new Set(booster.pool.map((entry) => entry.cardId).filter((id) => ownedSet.has(id))).size}
                    poolSize={new Set(booster.pool.map((entry) => entry.cardId)).size}
                    onShowContents={() => {
                      playButtonClick();
                      setContentsOf(booster);
                    }}
                  />
                  );
                }}
              />
            )
          ) : section === "decks" ? (
            /* Le rayon Decks : les préconstruits en BOÎTES, trois par ponton,
               tous au même rang — un Jeton chacun. Les deux boîtes de gauche
               regardent vers la droite, celle de droite vers la gauche. */
            <Showcase
              key="decks"
              dock="decks"
              label="decks"
              count={shopDecks.length}
              render={(index, slot) => {
                const entry = shopDecks[index]!;
                return (
                  <DeckGoods
                    entry={entry}
                    facing={slot >= 2 ? "left" : "right"}
                    inCart={cart.decks.includes(entry.deck.id)}
                    disabled={isBuying}
                    onToggle={() => toggleDeck(entry.deck.id)}
                  />
                );
              }}
              footer={
                <Link href="/decks" className={game.link} onClick={() => playButtonClick()}>
                  Fiches complètes et préconstruits dans Decks →
                </Link>
              }
            />
          ) : section === "monnaie" ? (
            /* Le rayon Monnaie : des Tides contre un Jeton de Préconstruit. */
            <Showcase
              key="monnaie"
              label="change"
              count={1}
              render={() => (
                <GoodsItem
                  // « Jeton » seul : sur téléphone, la plaque ne tient pas « Jeton de Préconstruit ».
                  name="Jeton"
                  subtitle="de Préconstruit, deck au choix"
                  art="/assets/ui/icons/precon-token.webp"
                  fit="contain"
                  price={
                    <>
                      <TideCoin size={16} />
                      {PRECON_TOKEN_PRICE_TIDES}
                    </>
                  }
                  owned={false}
                  ownedLabel=""
                  inCart={cart.tokens > 0}
                  disabled={isBuying || cart.tokens >= tokenCap}
                  onToggle={() => stepTokens(1)}
                />
              )}
              footer={
                <span className={game.muted}>
                  Tu as {plural(catalog.preconTokens, "Jeton")}. Cette semaine :{" "}
                  {tokenAllowance > 0
                    ? `encore ${tokenAllowance} sur ${PRECON_TOKENS_WEEKLY_LIMIT}`
                    : `limite de ${PRECON_TOKENS_WEEKLY_LIMIT} atteinte, retour lundi`}
                  .
                </span>
              }
            />
          ) : (
            <Showcase
              key="cosmetics"
              label="cosmétiques"
              count={cosmeticsOnSale.length}
              render={(index) => {
                const { key, familyLabel, option, family } = cosmeticsOnSale[index]!;
                return (
                <GoodsItem
                  name={option.label}
                  subtitle={familyLabel}
                  art={option.src}
                  fit={family === "cardBack" ? "cover" : "contain"}
                  price={<CosmeticPrice option={option} size={16} />}
                  owned={option.owned}
                  ownedLabel="Possédé"
                  inCart={cart.cosmetics.includes(key)}
                  disabled={isBuying}
                  onToggle={() => toggleCosmetic(key)}
                />
                );
              }}
              emptyText="Aucun cosmétique en vente pour l'instant."
              footer={
                <Link href="/collectables" className={game.link} onClick={() => playButtonClick()}>
                  Tout voir et équiper dans Collectables →
                </Link>
              }
            />
          )}
        </section>

        {/* ── Le panier, commun aux trois rayons ──────────────── */}
        {inventory.isSignedIn && (
          <section className={styles.cart} aria-label="Panier">
            <header className={styles.cartHead}>
              <span className={`${game.cabinTitle} ${styles.cartTitle}`}>
                <svg viewBox="0 0 24 24" width="22" height="22" fill="none" aria-hidden>
                  <path d="M3 4h2.2l2.1 10.2a1.5 1.5 0 0 0 1.5 1.2h8.4a1.5 1.5 0 0 0 1.4-1.1L20.5 8H6.1" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />
                  <circle cx="9.5" cy="19.5" r="1.4" fill="currentColor" />
                  <circle cx="17" cy="19.5" r="1.4" fill="currentColor" />
                </svg>
                Panier ({itemCount})
              </span>
              <p className={styles.cartHint} data-short={shortage ? "true" : "false"}>
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" aria-hidden>
                  <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth={1.5} />
                  <path d="M12 11v5.5M12 7.8v.2" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" />
                </svg>
                {shortage
                  ? `Il manque ${shortage} pour ce panier.`
                  : "Touchez un article pour l'ajouter au panier — le panier suit d'un rayon à l'autre, tout s'achète d'un coup."}
              </p>
              <button type="button" className={styles.clearButton} onClick={clearCart} disabled={isBuying || itemCount === 0}>
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" aria-hidden>
                  <path d="M4 7h16M9 7V4.5h6V7M6.5 7l1 13h9l1-13M10 11v6M14 11v6" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                Vider
              </button>
            </header>

            <div className={styles.cartBody}>
              <ul className={styles.cartLines}>
                {itemCount === 0 && <li className={styles.cartEmpty}>Ton panier est vide.</li>}
                {boosterLines.map((booster) => {
                  const quantity = cart.boosters[booster.boosterId] ?? 0;
                  return (
                    <li key={`booster:${booster.boosterId}`} className={`${game.cabinPanel} ${styles.cartLine}`}>
                      <span className={styles.cartThumb} style={closedPackVariables(getBoosterPackVisual(booster.boosterId))} aria-hidden />
                      <span className={styles.cartInfo}>
                        <span className={styles.cartName}>{booster.name}</span>
                        <span className={styles.cartPrice}>
                          <TideCoin size={14} />
                          {booster.price}
                        </span>
                      </span>
                      <span className={styles.stepper} role="group" aria-label={`Quantité de ${booster.name}`}>
                        <button type="button" className={styles.stepperButton} onClick={() => step(booster.boosterId, -1)} disabled={isBuying || quantity <= 0} aria-label="Un de moins">
                          <svg viewBox="0 0 24 24" fill="none" width="12" height="12" aria-hidden>
                            <path d="M6 12h12" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" />
                          </svg>
                        </button>
                        <span className={styles.stepperValue} aria-live="polite">
                          {quantity}
                        </span>
                        <button
                          type="button"
                          className={styles.stepperButton}
                          onClick={() => step(booster.boosterId, 1)}
                          disabled={isBuying || quantity >= MAX_PURCHASE_QUANTITY}
                          aria-label="Un de plus"
                        >
                          <svg viewBox="0 0 24 24" fill="none" width="12" height="12" aria-hidden>
                            <path d="M12 6v12M6 12h12" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" />
                          </svg>
                        </button>
                      </span>
                      <RemoveButton label={`Retirer ${booster.name} du panier`} disabled={isBuying} onClick={() => setQuantity(booster.boosterId, 0)} />
                    </li>
                  );
                })}
                {cart.tokens > 0 && (
                  <li key="tokens" className={`${game.cabinPanel} ${styles.cartLine}`}>
                    <span className={`${styles.cartThumb} ${styles.cartThumbContain}`} style={{ "--art": `url("/assets/ui/icons/precon-token.webp")` } as React.CSSProperties} aria-hidden />
                    <span className={styles.cartInfo}>
                      <span className={styles.cartName}>Jeton de Préconstruit</span>
                      <span className={styles.cartPrice}>
                        <TideCoin size={14} />
                        {PRECON_TOKEN_PRICE_TIDES}
                      </span>
                    </span>
                    <span className={styles.stepper} role="group" aria-label="Quantité de Jetons de Préconstruit">
                      <button type="button" className={styles.stepperButton} onClick={() => stepTokens(-1)} disabled={isBuying || cart.tokens <= 0} aria-label="Un de moins">
                        <svg viewBox="0 0 24 24" fill="none" width="12" height="12" aria-hidden>
                          <path d="M6 12h12" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" />
                        </svg>
                      </button>
                      <span className={styles.stepperValue} aria-live="polite">
                        {cart.tokens}
                      </span>
                      <button type="button" className={styles.stepperButton} onClick={() => stepTokens(1)} disabled={isBuying || cart.tokens >= MAX_PRECON_TOKENS_PER_PURCHASE} aria-label="Un de plus">
                        <svg viewBox="0 0 24 24" fill="none" width="12" height="12" aria-hidden>
                          <path d="M12 6v12M6 12h12" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" />
                        </svg>
                      </button>
                    </span>
                    <RemoveButton label="Retirer les Jetons du panier" disabled={isBuying} onClick={() => setCart((current) => ({ ...current, tokens: 0 }))} />
                  </li>
                )}
                {deckLines.map((entry) => (
                  <li key={`deck:${entry.deck.id}`} className={`${game.cabinPanel} ${styles.cartLine}`}>
                    <span
                      className={`${styles.cartThumb} ${styles.cartThumbArt}`}
                      style={{ "--art": `url("${nameplateArtUrl(entry.deck.cardIds, entry.deck.shipId) ?? ""}")` } as React.CSSProperties}
                      aria-hidden
                    />
                    <span className={styles.cartInfo}>
                      <span className={styles.cartName}>{entry.deck.name}</span>
                      <span className={styles.cartPrice}>
                        <PreconToken size={14} />1 Jeton
                      </span>
                    </span>
                    <RemoveButton label={`Retirer ${entry.deck.name} du panier`} disabled={isBuying} onClick={() => toggleDeck(entry.deck.id)} />
                  </li>
                ))}
                {cosmeticLines.map((row) => (
                  <li key={`cosmetic:${row.key}`} className={`${game.cabinPanel} ${styles.cartLine}`}>
                    <span
                      className={`${styles.cartThumb} ${row.family === "cardBack" ? styles.cartThumbArt : styles.cartThumbContain}`}
                      style={{ "--art": `url("${row.option.src}")` } as React.CSSProperties}
                      aria-hidden
                    />
                    <span className={styles.cartInfo}>
                      <span className={styles.cartName}>{row.option.label}</span>
                      <span className={styles.cartPrice}>
                        <CosmeticPrice option={row.option} size={14} />
                      </span>
                    </span>
                    <RemoveButton label={`Retirer ${row.option.label} du panier`} disabled={isBuying} onClick={() => toggleCosmetic(row.key)} />
                  </li>
                ))}
              </ul>

              <div className={styles.checkout}>
                {tokensTotal > 0 && (
                  <span className={styles.totalBlock}>
                    <span className={styles.totalLabel}>Jetons</span>
                    <span className={styles.totalValue} data-short={shortTokens > 0 ? "true" : "false"}>
                      <PreconToken size={20} />
                      {tokensTotal}
                    </span>
                  </span>
                )}
                <span className={styles.totalBlock}>
                  <span className={styles.totalLabel}>Sous-total</span>
                  <span className={styles.totalValue} data-short={shortTides > 0 ? "true" : "false"}>
                    <TideCoin size={20} />
                    {tidesTotal}
                  </span>
                </span>
                <button
                  type="button"
                  className={`${game.premium} ${game.buttonLg} ${styles.buyButton}`}
                  onClick={() => void handleCheckout()}
                  disabled={isBuying || itemCount === 0 || shortTides > 0 || shortTokens > 0}
                >
                  {isBuying ? <MicroLoader active label="Achat…" placement="inline" delayMs={0} /> : "Acheter"}
                </button>
              </div>
            </div>

          </section>
        )}
      </div>

      <ScreenToast message={toast} onDismiss={() => setToast(null)} />
      {contentsOf && <BoosterContentsDialog booster={contentsOf} owned={ownedSet} ownedArtworks={ownedArtworkSet} onClose={() => setContentsOf(null)} />}
    </GameScreen>
  );
}

/** Laboratoire : un panier garni des trois rayons, pour voir toutes ses sortes de lignes. */
function sampleCart(inventory: BoosterInventory, catalog: DeckCatalogSummary, collectables: CollectablesView): Cart {
  const boosters = inventory.boosters.filter((booster) => booster.isPurchasable && booster.price !== null).slice(0, 2);
  const deck = catalog.decks.find((entry) => !entry.unlocked && entry.deck.offer === "shop");
  const cosmetic = collectables.families
    .flatMap((family) =>
      family.options
        .filter((option) => (option.priceTides !== null || option.priceTokens !== null) && !option.owned && !option.masked)
        .map((option) => cosmeticKey(family.kind, option.id))
    )
    .at(0);
  return {
    boosters: Object.fromEntries(boosters.map((booster, index) => [booster.boosterId, index === 0 ? 3 : 1])),
    tokens: 1,
    decks: deck ? [deck.deck.id] : [],
    cosmetics: cosmetic ? [cosmetic] : [],
  };
}

/** Prix d'un cosmétique, dans SA monnaie : Jetons de Préconstruit s'il en a un, Tides sinon. */
function CosmeticPrice({ option, size }: { option: CollectablesView["families"][number]["options"][number]; size: number }) {
  if (option.priceTokens !== null) {
    return (
      <>
        <PreconToken size={size} /> {option.priceTokens} Jeton{option.priceTokens > 1 ? "s" : ""}
      </>
    );
  }
  return (
    <>
      <TideCoin size={size} /> {option.priceTides}
    </>
  );
}

function RemoveButton({ label, disabled, onClick }: { label: string; disabled: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      className={styles.removeButton}
      onClick={() => {
        playButtonClick();
        onClick();
      }}
      disabled={disabled}
      aria-label={label}
    >
      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" aria-hidden>
        <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth={2} strokeLinecap="round" />
      </svg>
    </button>
  );
}

/**
 * LA VITRINE EN BOUCLE (retour du 13/10/2026). Trois socles au milieu ; les
 * articles qui n'y ont pas leur place attendent DEHORS, de part et d'autre
 * du ponton, plus petits et dans la pénombre — ils prennent la place au
 * défilement. La rangée ne s'arrête jamais : après le dernier article
 * revient le premier, dans les deux sens.
 *
 * Mécanique : chaque emplacement porte un indice VIRTUEL (`start + slot`),
 * clé React comprise. Avancer d'un cran décale tous les éléments d'un
 * emplacement — la transition CSS les fait glisser — et un nouvel indice
 * entre par un emplacement caché du bord, l'ancien sort par l'autre. Les
 * articles sont donc rendus « en boucle » sans piste à recaler.
 *
 * Gestes : flèches (un article par cran), glisser au doigt ou à la souris
 * (la vitrine suit le doigt, puis se cale sur l'emplacement le plus
 * proche), défilement horizontal du pavé tactile, flèches du clavier.
 * Toucher un article du dehors l'amène sur le socle le plus proche.
 */
function Showcase({
  count,
  render,
  label,
  footer,
  emptyText,
  dock,
}: {
  count: number;
  /** L'article d'indice `index`, posé à l'emplacement `slot` (0 à 2 : les socles). */
  render: (index: number, slot: number) => ReactNode;
  /** Ce que la vitrine présente, pour les flèches (« boosters suivants »). */
  label: string;
  footer?: ReactNode;
  emptyText?: string;
  dock?: "decks";
}) {
  const [start, setStart] = useState(0);
  const [drag, setDrag] = useState<number | null>(null);
  const plateRef = useRef<HTMLDivElement>(null);
  const gesture = useRef<{ x: number; y: number; id: number; moved: boolean } | null>(null);
  const suppressClick = useRef(false);
  const wheel = useRef(0);

  const loops = count > PACKS_PER_PLATE;
  const visible = Math.min(count, PACKS_PER_PLATE + OUTSIDE_SLOTS.length);
  const visibleSlots = loops ? [0, 1, 2, ...OUTSIDE_SLOTS.slice(0, visible - PACKS_PER_PLATE)] : [];
  const low = loops ? Math.min(...visibleSlots) : 0;
  const high = loops ? Math.max(...visibleSlots) : count - 1;

  const shift = (steps: number) => {
    if (!loops || steps === 0) return;
    playButtonClick();
    setStart((current) => current + steps);
  };

  /** Largeur d'un cran : l'écart entre deux socles. */
  const stepWidth = () => (plateRef.current?.clientWidth ?? 900) * 0.259;

  if (count === 0) {
    return (
      <div className={`${game.cabinFrame} ${game.empty} ${styles.notice}`}>
        <p className={game.emptyTitle}>{emptyText ?? "Rien en vente pour l'instant"}</p>
        {footer && <p className={game.muted}>{footer}</p>}
      </div>
    );
  }

  // Sans débordement, les socles se partagent les articles comme avant :
  // un seul au centre, deux sur les socles extrêmes.
  if (!loops) {
    return (
      <div className={styles.showcase}>
        <div className={styles.plate} data-dock={dock}>
          {Array.from({ length: count }, (_, index) => {
            const slot = count === 1 ? 1 : count === 2 ? index * 2 : index;
            return (
              <div key={index} className={styles.pedestal} data-slot={slot}>
                {render(index, slot)}
              </div>
            );
          })}
        </div>
        {footer && (
          <div className={styles.showcaseFoot}>
            <span className={styles.stageLink}>{footer}</span>
          </div>
        )}
      </div>
    );
  }

  const slots: number[] = [];
  for (let slot = low - 1; slot <= high + 1; slot += 1) slots.push(slot);

  function onPointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    gesture.current = { x: event.clientX, y: event.clientY, id: event.pointerId, moved: false };
    suppressClick.current = false;
  }

  function onPointerMove(event: React.PointerEvent<HTMLDivElement>) {
    const current = gesture.current;
    if (!current || current.id !== event.pointerId) return;
    const dx = event.clientX - current.x;
    const dy = event.clientY - current.y;
    if (!current.moved) {
      // Un geste vertical reste au défilement de la page.
      if (Math.abs(dx) < 8 || Math.abs(dx) < Math.abs(dy)) return;
      current.moved = true;
      event.currentTarget.setPointerCapture(event.pointerId);
    }
    setDrag(dx);
  }

  function endGesture(event: React.PointerEvent<HTMLDivElement>) {
    const current = gesture.current;
    if (!current || current.id !== event.pointerId) return;
    gesture.current = null;
    if (!current.moved) return;
    suppressClick.current = true;
    const dx = event.clientX - current.x;
    const steps = -Math.round(dx / stepWidth());
    setDrag(null);
    shift(steps === 0 && Math.abs(dx) > 40 ? -Math.sign(dx) : steps);
  }

  function onWheel(event: React.WheelEvent<HTMLDivElement>) {
    if (Math.abs(event.deltaX) <= Math.abs(event.deltaY)) return;
    wheel.current += event.deltaX;
    if (Math.abs(wheel.current) < 60) return;
    shift(Math.sign(wheel.current));
    wheel.current = 0;
  }

  return (
    <div className={styles.showcase}>
      <div
        ref={plateRef}
        className={styles.plate}
        data-dock={dock}
        data-loop="true"
        data-dragging={drag !== null ? "true" : undefined}
        style={{ "--drag": `${drag ?? 0}px` } as CSSProperties}
        role="region"
        aria-roledescription="carrousel"
        aria-label={`Vitrine des ${label}`}
        tabIndex={0}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endGesture}
        onPointerCancel={endGesture}
        onWheel={onWheel}
        onKeyDown={(event) => {
          if (event.key === "ArrowRight") shift(1);
          else if (event.key === "ArrowLeft") shift(-1);
        }}
        onClickCapture={(event) => {
          // Un glisser n'est pas un clic : rien ne part au panier.
          if (suppressClick.current) {
            suppressClick.current = false;
            event.preventDefault();
            event.stopPropagation();
          }
        }}
      >
        {slots.map((slot) => {
          const virtual = start + slot;
          const index = ((virtual % count) + count) % count;
          const shown = slot >= low && slot <= high;
          const outside = slot < 0 || slot >= PACKS_PER_PLATE;
          return (
            <div
              key={virtual}
              className={styles.pedestal}
              data-pos={slot}
              data-outside={outside ? "true" : undefined}
              data-hidden={shown ? undefined : "true"}
              aria-hidden={outside ? true : undefined}
              onClickCapture={
                outside
                  ? (event) => {
                      // Un article du dehors : on l'amène d'abord sur un socle.
                      event.preventDefault();
                      event.stopPropagation();
                      if (shown) shift(slot < 0 ? slot : slot - (PACKS_PER_PLATE - 1));
                    }
                  : undefined
              }
            >
              {render(index, slot)}
            </div>
          );
        })}
        <button type="button" className={`${styles.showcaseArrow} ${styles.showcaseArrowLeft}`} onClick={() => shift(-1)} aria-label={`${label} précédents`}>
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none" aria-hidden>
            <path d="M14.5 5.5L8 12l6.5 6.5" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <button type="button" className={`${styles.showcaseArrow} ${styles.showcaseArrowRight}`} onClick={() => shift(1)} aria-label={`${label} suivants`}>
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none" aria-hidden>
            <path d="M9.5 5.5L16 12l-6.5 6.5" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>
      <div className={styles.showcaseFoot}>
        <span className={styles.showcaseCount} aria-live="polite">
          {(((start % count) + count) % count) + 1}–{((((start + 2) % count) + count) % count) + 1} sur {count}
        </span>
        {footer && <span className={styles.stageLink}>{footer}</span>}
      </div>
    </div>
  );
}

/**
 * Un booster debout sur son socle. Le toucher en met un au panier ; la
 * pastille dit combien y sont déjà.
 */
function PedestalItem({
  booster,
  inCart,
  disabled,
  onAdd,
  ownedInPool,
  poolSize,
  onShowContents,
}: {
  booster: BoosterInventoryEntry;
  inCart: number;
  disabled: boolean;
  onAdd: () => void;
  ownedInPool: number;
  poolSize: number;
  onShowContents: () => void;
}) {
  /* Ce que ce sachet peut encore apporter ne s'affiche PAS ici. Un badge
     « 13 nouvelles » y a vécu deux jours : posé sur l'illustration du
     sachet, il chargeait le rayon d'un chiffre à lire sur chacun des
     quatre, et son mot mentait à moitié — « nouveau » dit « récemment
     sorti » dans un jeu de cartes, pas « tu ne l'as pas ». L'information
     reste d'un geste, dans la fiche « Contenu », là où on vient
     justement la chercher. */
  return (
    <>
      <button
        type="button"
        className={styles.pack}
        data-in-cart={inCart > 0 ? "true" : "false"}
        onClick={onAdd}
        disabled={disabled}
        aria-label={`Ajouter un ${booster.name} au panier (${booster.price} Tides)`}
      >
        <span className={styles.packArt} style={closedPackVariables(getBoosterPackVisual(booster.boosterId))} aria-hidden />
        {inCart > 0 && (
          <span key={inCart} className={styles.cartBadge} aria-hidden>
            ×{inCart}
          </span>
        )}
      </button>
      <span className={`${game.cabinPanel} ${styles.label}`}>
        <span className={styles.labelName}>{booster.name}</span>
        <span className={styles.labelPrice}>
          <TideCoin size={16} />
          {booster.price}
        </span>
        {/* Sur un téléphone couché, le libellé s'efface et le bouton se
            réduit à son pictogramme, à côté du prix : la ligne qu'il
            prenait sous le socle passait hors du ponton. Le compte reste
            porté par le nom accessible et l'infobulle. */}
        {poolSize > 0 && (
          <button
            type="button"
            className={styles.contentsButton}
            onClick={onShowContents}
            title={`Voir les cartes obtenables — ${ownedInPool}/${poolSize} déjà en collection`}
            aria-label={`Contenu du booster : ${ownedInPool} cartes sur ${poolSize} déjà en collection`}
          >
            <svg viewBox="0 0 24 24" width="13" height="13" fill="none" aria-hidden>
              <rect x="4" y="5" width="11" height="15" rx="1.5" stroke="currentColor" strokeWidth={1.6} />
              <path d="M9 3h9.5A1.5 1.5 0 0 1 20 4.5V17" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" />
            </svg>
            <span className={styles.contentsLabel}>
              Contenu · {ownedInPool}/{poolSize}
            </span>
          </button>
        )}
      </span>
    </>
  );
}

/**
 * Un préconstruit sur son socle : la boîte de deck, son nom, son style, son
 * prix (un Jeton) et le bouton qui le met au panier — ou la mention
 * « Débloqué ». Toucher la boîte fait la même chose que le bouton, comme
 * toucher un sachet le met au panier.
 */
function DeckGoods({
  entry,
  facing,
  inCart,
  disabled,
  onToggle,
}: {
  entry: CatalogDeckView;
  facing: "left" | "right";
  inCart: boolean;
  disabled: boolean;
  onToggle: () => void;
}) {
  const art = nameplateArtUrl(entry.deck.cardIds, entry.deck.shipId);
  return (
    <>
      <button
        type="button"
        className={styles.pack}
        data-in-cart={inCart ? "true" : "false"}
        onClick={onToggle}
        disabled={disabled || entry.unlocked}
        title={entry.unlocked ? "Déjà débloqué" : undefined}
        aria-label={entry.unlocked ? `${entry.deck.name} — débloqué` : inCart ? `Retirer ${entry.deck.name} du panier` : `Mettre ${entry.deck.name} au panier (1 Jeton de Préconstruit)`}
      >
        <DeckBox art={art} facing={facing} badge={entry.unlocked ? "Débloqué" : undefined} className={styles.deckBox} />
        {inCart && (
          <span className={styles.cartBadge} aria-hidden>
            ✓
          </span>
        )}
      </button>
      <span className={`${game.cabinPanel} ${styles.label}`}>
        <span className={styles.labelName}>{entry.deck.name}</span>
        <span className={styles.labelSub}>{entry.deck.style}</span>
        <span className={styles.labelPrice}>
          <PreconToken size={16} /> 1 Jeton
        </span>
        {!entry.unlocked && (
          <button type="button" className={styles.contentsButton} data-in-cart={inCart ? "true" : "false"} onClick={onToggle} disabled={disabled}>
            {inCart ? "Retirer du panier" : "Au panier"}
          </button>
        )}
      </span>
    </>
  );
}

/**
 * Un article autre qu'un sachet — cosmétique à Tides — posé sur le socle,
 * sans cadre ni fond : l'objet lui-même, debout sur son pied. Possédé : on
 * le dit, on ne le revend pas. Sinon, un bouton qui le met au panier.
 */
function GoodsItem({
  name,
  subtitle,
  art,
  fit,
  price,
  owned,
  ownedLabel,
  inCart,
  disabled,
  onToggle,
}: {
  name: string;
  subtitle?: string;
  art: string | null;
  fit: "cover" | "contain";
  price: ReactNode;
  owned: boolean;
  ownedLabel: string;
  inCart: boolean;
  disabled: boolean;
  onToggle: () => void;
}) {
  // Le halo « Possédé » épouse l'objet peint, pas son fichier : un cadre de
  // Navire n'occupe qu'une partie de son image transparente.
  const silhouette = useOpaqueBox(owned ? art : null);
  return (
    <>
      <button
        type="button"
        className={`${styles.pack} ${styles.goods}`}
        data-owned={owned ? "true" : "false"}
        data-in-cart={inCart ? "true" : "false"}
        onClick={onToggle}
        disabled={disabled || owned}
        title={owned ? "Déjà possédé" : undefined}
        aria-label={owned ? `${name} — possédé` : inCart ? `Retirer ${name} du panier` : `Mettre ${name} au panier`}
      >
        <span className={styles.goodsArt} data-fit={fit} style={art ? { backgroundImage: `url("${art}")` } : undefined} aria-hidden />
        {owned && silhouette && (
          <span className={styles.goodsFit} data-fit={fit} aria-hidden>
            <span className={styles.goodsImage} style={{ "--ratio": silhouette.ratio } as CSSProperties}>
              <span
                className={styles.goodsStatus}
                style={{
                  left: `${silhouette.left * 100}%`,
                  top: `${silhouette.top * 100}%`,
                  right: `${silhouette.right * 100}%`,
                  bottom: `${silhouette.bottom * 100}%`,
                }}
              >
                <StatusTag tone="owned">{ownedLabel}</StatusTag>
              </span>
            </span>
          </span>
        )}
        {inCart && (
          <span className={styles.cartBadge} aria-hidden>
            ✓
          </span>
        )}
      </button>
      <span className={`${game.cabinPanel} ${styles.label}`}>
        <span className={styles.labelName}>{name}</span>
        {subtitle && <span className={styles.labelSub}>{subtitle}</span>}
        <span className={styles.labelPrice}>{price}</span>
        {!owned && (
          <button type="button" className={styles.contentsButton} data-in-cart={inCart ? "true" : "false"} onClick={onToggle} disabled={disabled}>
            {inCart ? "Retirer du panier" : "Au panier"}
          </button>
        )}
      </span>
    </>
  );
}
