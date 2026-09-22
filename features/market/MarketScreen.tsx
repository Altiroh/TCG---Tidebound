"use client";

import { useEffect, useMemo, useState, useTransition, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { GameScreen } from "@/features/shell/GameScreen";
import game from "@/features/shell/GameScreen.module.css";
import styles from "@/features/market/Market.module.css";
import { PreconToken, TideCoin } from "@/features/shell/GameIcons";
import { ScreenToast, type ScreenToastMessage } from "@/features/shell/ScreenToast";
import { purchaseBooster, type BoosterInventory, type BoosterInventoryEntry } from "@/features/boosters/actions";
import { MAX_PURCHASE_QUANTITY } from "@/features/boosters/constants";
import { closedPackVariables, getBoosterPackVisual } from "@/features/boosters/opening/boosterPackVisuals";
import { purchaseCollectable } from "@/features/cosmetics/collectablesActions";
import type { CollectablesView } from "@/features/cosmetics/collectablesService";
import { unlockPreconstructedDeck, type DeckCatalogSummary } from "@/features/decks/catalogActions";
import type { CatalogDeckView } from "@/features/decks/catalogService";
import { DeckBox } from "@/features/decks/DeckBox";
import { nameplateArtUrl } from "@/features/decks/nameplateArt";
import { notifyProgressionChanged } from "@/features/progression/progressionSync";
import { playAddToCart, playButtonClick, playMarketBuy, playTabClick } from "@/lib/sound";
import { BoosterContentsDialog } from "@/features/market/BoosterContentsDialog";

interface MarketScreenProps {
  inventory: BoosterInventory;
  /** Les préconstruits à Jeton — le rayon Decks. */
  catalog: DeckCatalogSummary;
  /** Les Collectables, dont ceux en vente — le rayon Cosmétiques. */
  collectables: CollectablesView;
}

/**
 * Le panier, commun aux trois rayons : il survit au changement de rayon,
 * pour tout acheter d'un coup. Les boosters s'y mettent par quantité, les
 * decks (un Jeton chacun) et les cosmétiques (des Tides) à l'unité.
 */
interface Cart {
  boosters: Record<string, number>;
  decks: string[];
  /** Clés `famille:id`. */
  cosmetics: string[];
}

const EMPTY_CART: Cart = { boosters: {}, decks: [], cosmetics: [] };

/** Trois socles par ponton (`market/pedestals.webp`) : au-delà, un ponton de plus, à droite, qu'on atteint par les flèches. */
const PACKS_PER_PLATE = 3;

/** Les rayons qui se tiennent dans cet écran. */
type SectionId = "boosters" | "decks" | "cosmetics";

/*
 * Rayons de la boutique.
 *
 * Les trois premiers se tiennent ICI : changer de rayon change ce qui est
 * posé sur les socles — sachets, decks à Jeton, cosmétiques à Tides — et le
 * panier reste le même. Les écrans Decks et Collectables restent les
 * vitrines complètes (fiches, équipement, possession) : un lien discret
 * sous le ponton y mène.
 *
 * Un rayon sans `section` est annoncé mais pas ouvert : il reste visible
 * et désactivé, parce qu'une boutique dont on ne devine pas le programme
 * n'appelle pas à revenir.
 */
const SECTIONS: Array<{ id: string; label: string; icon: ReactNode; section?: SectionId }> = [
  {
    id: "boosters",
    label: "Boosters",
    section: "boosters",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" aria-hidden>
        <path d="M6 3.5h12l-.8 2 .8 2v11l-.8 2 .8 2H6l.8-2-.8-2v-11l.8-2z" stroke="currentColor" strokeWidth={1.5} strokeLinejoin="round" />
        <path d="M9 12.5l3-3 3 3-3 3z" stroke="currentColor" strokeWidth={1.4} strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    id: "decks",
    label: "Decks",
    section: "decks",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" aria-hidden>
        <rect x="4" y="6" width="11" height="15" rx="1.6" stroke="currentColor" strokeWidth={1.5} transform="rotate(-10 9.5 13.5)" />
        <rect x="9" y="4" width="11" height="15" rx="1.6" stroke="currentColor" strokeWidth={1.5} />
      </svg>
    ),
  },
  {
    id: "cosmetics",
    label: "Cosmétiques",
    section: "cosmetics",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" aria-hidden>
        <path d="M7 19c-3-2.5-4-6.5-2.5-10.5M17 19c3-2.5 4-6.5 2.5-10.5M4.5 8.5L3 6.5M19.5 8.5L21 6.5M5.5 13L3.5 12.5M18.5 13l2-.5M8 17.5l-1.8 1M16 17.5l1.8 1" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" />
        <circle cx="12" cy="11" r="3" stroke="currentColor" strokeWidth={1.4} />
      </svg>
    ),
  },
  {
    id: "currency",
    label: "Monnaie",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" aria-hidden>
        <ellipse cx="9" cy="16.5" rx="5.5" ry="2.5" stroke="currentColor" strokeWidth={1.5} />
        <path d="M3.5 16.5v-3c0-1.4 2.5-2.5 5.5-2.5s5.5 1.1 5.5 2.5v3" stroke="currentColor" strokeWidth={1.5} />
        <ellipse cx="15" cy="8" rx="5.5" ry="2.5" stroke="currentColor" strokeWidth={1.5} />
        <path d="M9.5 8v3M20.5 8v3c0 1.1-1.5 2-3.6 2.4" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" />
      </svg>
    ),
  },
  {
    id: "offers",
    label: "Offres spéciales",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" aria-hidden>
        <rect x="4" y="9" width="16" height="11" rx="1.4" stroke="currentColor" strokeWidth={1.5} />
        <path d="M3 9h18M12 9v11M12 9c-1.5-3.5-5.5-4-5.5-1.5S10 9 12 9zM12 9c1.5-3.5 5.5-4 5.5-1.5S14 9 12 9z" stroke="currentColor" strokeWidth={1.4} strokeLinejoin="round" />
      </svg>
    ),
  },
];

function chunk<T>(items: readonly T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) chunks.push(items.slice(index, index + size));
  return chunks;
}

const cosmeticKey = (family: string, id: string) => `${family}:${id}`;

function plural(count: number, singular: string, pluralForm = `${singular}s`): string {
  return `${count} ${count > 1 ? pluralForm : singular}`;
}

/**
 * MARKET — la boutique. Trois rayons sur un même quai de nuit
 * (`market/background.webp`) :
 *   - à gauche, l'ENSEIGNE de bois : les rayons ; en changer change ce qui
 *     est posé sur les socles, sans quitter l'écran ni vider le panier ;
 *   - au centre, le PONTON : trois socles ; au-delà de trois articles, un
 *     ponton de plus glisse depuis la droite (flèches) ;
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
export function MarketScreen({ inventory, catalog, collectables }: MarketScreenProps) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [section, setSection] = useState<SectionId>("boosters");
  const [cart, setCart] = useState<Cart>(EMPTY_CART);
  const [isBuying, setIsBuying] = useState(false);
  const [toast, setToast] = useState<ScreenToastMessage | null>(null);
  /** Booster dont on consulte le contenu. */
  const [contentsOf, setContentsOf] = useState<BoosterInventoryEntry | null>(null);
  const ownedSet = useMemo(() => new Set(inventory.ownedCardIds), [inventory.ownedCardIds]);

  // Un booster non achetable (le Mini Booster de Bienvenue, offert) n'a rien
  // à faire dans une boutique : il s'obtient, il ne se vend pas.
  const onSale = useMemo(
    () => inventory.boosters.filter((booster) => booster.isPurchasable && booster.price !== null),
    [inventory.boosters]
  );

  /** Les cosmétiques EN VENTE, toutes familles confondues. */
  const cosmeticsOnSale = useMemo(
    () =>
      collectables.families.flatMap((family) =>
        family.options
          .filter((option) => option.priceTides !== null && !option.masked)
          .map((option) => ({ key: cosmeticKey(family.kind, option.id), family: family.kind, familyLabel: family.label, option }))
      ),
    [collectables.families]
  );

  // ── Le panier, ligne par ligne ───────────────────────────────────
  const boosterLines = onSale.filter((booster) => (cart.boosters[booster.boosterId] ?? 0) > 0);
  const deckLines = catalog.precon.filter((entry) => cart.decks.includes(entry.deck.id) && !entry.unlocked);
  const cosmeticLines = cosmeticsOnSale.filter((row) => cart.cosmetics.includes(row.key) && !row.option.owned);

  const boosterCount = boosterLines.reduce((sum, booster) => sum + (cart.boosters[booster.boosterId] ?? 0), 0);
  const itemCount = boosterCount + deckLines.length + cosmeticLines.length;
  const tidesTotal =
    boosterLines.reduce((sum, booster) => sum + (booster.price ?? 0) * (cart.boosters[booster.boosterId] ?? 0), 0) +
    cosmeticLines.reduce((sum, row) => sum + (row.option.priceTides ?? 0), 0);
  const tokensTotal = deckLines.length;
  const shortTides = Math.max(0, tidesTotal - inventory.balance);
  const shortTokens = Math.max(0, tokensTotal - catalog.preconTokens);
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

    const bought = { boosters: 0, decks: 0, cosmetics: 0, tides: 0, tokens: 0 };
    let failure: string | null = null;
    const remaining: Cart = { boosters: { ...cart.boosters }, decks: [...cart.decks], cosmetics: [...cart.cosmetics] };

    for (const booster of boosterLines) {
      const quantity = cart.boosters[booster.boosterId] ?? 0;
      const result = await purchaseBooster(booster.boosterId, quantity);
      if (!result.ok) {
        failure = result.error ?? "Achat impossible.";
        break;
      }
      bought.boosters += quantity;
      bought.tides += (booster.price ?? 0) * quantity;
      remaining.boosters[booster.boosterId] = 0;
    }

    if (!failure) {
      for (const entry of deckLines) {
        const result = await unlockPreconstructedDeck(entry.deck.id);
        if (!result.ok) {
          failure = result.error ?? "Déblocage impossible.";
          break;
        }
        bought.decks += 1;
        bought.tokens += 1;
        remaining.decks = remaining.decks.filter((id) => id !== entry.deck.id);
      }
    }

    if (!failure) {
      for (const row of cosmeticLines) {
        const result = await purchaseCollectable(row.family, row.option.id);
        if (!result.ok) {
          failure = result.error ?? "Achat impossible.";
          break;
        }
        bought.cosmetics += 1;
        bought.tides += row.option.priceTides ?? 0;
        remaining.cosmetics = remaining.cosmetics.filter((key) => key !== row.key);
      }
    }

    setIsBuying(false);
    setCart(remaining);

    const boughtCount = bought.boosters + bought.decks + bought.cosmetics;
    if (boughtCount > 0) {
      // Même partiel, un achat a eu lieu : il s'entend.
      playMarketBuy();
      notifyProgressionChanged();
      // `revalidatePath` côté action a invalidé le cache : on relit la
      // réserve, le rayon des decks et les collectables plutôt que de deviner.
      startTransition(() => router.refresh());
    }

    const recap = [
      bought.boosters > 0 ? plural(bought.boosters, "booster") : "",
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
      ) : bought.decks > 0 ? (
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

  const stageLabel = section === "boosters" ? "Boosters en vente" : section === "decks" ? "Decks à Jeton" : "Cosmétiques en vente";
  const shortage = [shortTokens > 0 ? plural(shortTokens, "Jeton") : "", shortTides > 0 ? `${shortTides} Tides` : ""].filter(Boolean).join(" et ");

  return (
    <GameScreen active="market" nav="minimal" className={`${styles.screen}${section === "decks" ? ` ${styles.screenDecks}` : ""}`}>
      <div className={styles.market}>
        {/* ── L'enseigne : les rayons ─────────────────────────── */}
        <aside className={styles.side} aria-label="Rayons du Market">
          <div className={styles.sideInner}>
            <h1 className={styles.sideTitle}>Market</h1>
            <nav className={styles.sections}>
              {SECTIONS.map((entry) => {
                const inner = (
                  <>
                    <span className={styles.sectionIcon}>{entry.icon}</span>
                    <span className={styles.sectionLabel}>{entry.label}</span>
                    {!entry.section && <span className="sr-only">(bientôt disponible)</span>}
                  </>
                );
                if (!entry.section) {
                  return (
                    <button key={entry.id} type="button" className={styles.section} disabled title="Bientôt disponible">
                      {inner}
                    </button>
                  );
                }
                const active = entry.section === section;
                return (
                  <button
                    key={entry.id}
                    type="button"
                    className={styles.section}
                    data-active={active ? "true" : undefined}
                    aria-pressed={active}
                    onClick={() => {
                      if (active) return;
                      playTabClick();
                      setSection(entry.section!);
                    }}
                  >
                    {inner}
                  </button>
                );
              })}
            </nav>

            {inventory.isSignedIn && (
              <Link href="/boosters" className={styles.reserveLink} data-waiting={ownedCount > 0 ? "true" : "false"} onClick={() => playButtonClick()}>
                <span className={styles.reserveIcon} style={closedPackVariables(getBoosterPackVisual("standard"))} aria-hidden />
                <span className={styles.reserveText}>
                  <span className={styles.reserveTitle}>Mes boosters</span>
                  <span className={styles.reserveCount}>{ownedCount > 0 ? `${ownedCount} à ouvrir` : "Réserve vide"}</span>
                </span>
                <span aria-hidden>→</span>
              </Link>
            )}
          </div>
        </aside>

        {/* ── Le ponton : les articles du rayon sur leurs socles ─── */}
        <section className={styles.stage} aria-label={stageLabel}>
          {!inventory.isSignedIn ? (
            <div className={`${game.panel} ${game.empty} ${styles.notice}`}>
              <p className={game.emptyTitle}>Connecte-toi pour acheter</p>
              <p className={game.muted}>Tes Tides, tes boosters et ta collection sont enregistrés sur ton compte.</p>
              <Link href="/connexion" className={game.primary} onClick={() => playButtonClick()} style={{ marginTop: 6 }}>
                Se connecter
              </Link>
            </div>
          ) : section === "boosters" ? (
            onSale.length === 0 ? (
              <div className={`${game.panel} ${game.empty} ${styles.notice}`}>
                <p className={game.emptyTitle}>Rien en vente pour l&apos;instant</p>
                <p className={game.muted}>
                  Le catalogue de boosters est vide en base. Applique les migrations Supabase, puis lance <code>npm run seed:cards</code>.
                </p>
              </div>
            ) : (
              <Showcase
                key="boosters"
                items={onSale.map((booster) => (
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
                ))}
              />
            )
          ) : section === "decks" ? (
            /* Le rayon Decks : les préconstruits en BOÎTES, trois par ponton,
               tous au même rang — un Jeton chacun. Les deux boîtes de gauche
               regardent vers la droite, celle de droite vers la gauche. */
            <Showcase
              key="decks"
              dock="decks"
              items={catalog.precon.map((entry, position) => (
                <DeckGoods
                  key={entry.deck.id}
                  entry={entry}
                  facing={position % PACKS_PER_PLATE === 2 ? "left" : "right"}
                  inCart={cart.decks.includes(entry.deck.id)}
                  disabled={isBuying}
                  onToggle={() => toggleDeck(entry.deck.id)}
                />
              ))}
              footer={
                <Link href="/decks" className={game.link} onClick={() => playButtonClick()}>
                  Fiches complètes et decks d&apos;emprunt dans Decks →
                </Link>
              }
            />
          ) : (
            <Showcase
              key="cosmetics"
              items={cosmeticsOnSale.map(({ key, familyLabel, option, family }) => (
                <GoodsItem
                  key={key}
                  name={option.label}
                  subtitle={familyLabel}
                  art={option.src}
                  fit={family === "cardBack" ? "cover" : "contain"}
                  price={
                    <>
                      <TideCoin size={16} /> {option.priceTides}
                    </>
                  }
                  owned={option.owned}
                  ownedLabel="Possédé"
                  inCart={cart.cosmetics.includes(key)}
                  disabled={isBuying}
                  onToggle={() => toggleCosmetic(key)}
                />
              ))}
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
              <span className={styles.cartTitle}>
                <svg viewBox="0 0 24 24" width="22" height="22" fill="none" aria-hidden>
                  <path d="M3 4h2.2l2.1 10.2a1.5 1.5 0 0 0 1.5 1.2h8.4a1.5 1.5 0 0 0 1.4-1.1L20.5 8H6.1" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />
                  <circle cx="9.5" cy="19.5" r="1.4" fill="currentColor" />
                  <circle cx="17" cy="19.5" r="1.4" fill="currentColor" />
                </svg>
                Panier ({itemCount})
              </span>
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
                    <li key={`booster:${booster.boosterId}`} className={styles.cartLine}>
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
                {deckLines.map((entry) => (
                  <li key={`deck:${entry.deck.id}`} className={styles.cartLine}>
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
                  <li key={`cosmetic:${row.key}`} className={styles.cartLine}>
                    <span
                      className={`${styles.cartThumb} ${row.family === "cardBack" ? styles.cartThumbArt : styles.cartThumbContain}`}
                      style={{ "--art": `url("${row.option.src}")` } as React.CSSProperties}
                      aria-hidden
                    />
                    <span className={styles.cartInfo}>
                      <span className={styles.cartName}>{row.option.label}</span>
                      <span className={styles.cartPrice}>
                        <TideCoin size={14} />
                        {row.option.priceTides}
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
                  className={styles.buyButton}
                  onClick={() => void handleCheckout()}
                  disabled={isBuying || itemCount === 0 || shortTides > 0 || shortTokens > 0}
                >
                  {isBuying ? "Achat…" : "Acheter"}
                </button>
              </div>
            </div>

            <p className={styles.cartHint} data-short={shortage ? "true" : "false"}>
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" aria-hidden>
                <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth={1.5} />
                <path d="M12 11v5.5M12 7.8v.2" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" />
              </svg>
              {shortage
                ? `Il manque ${shortage} pour ce panier.`
                : "Touchez un article pour l'ajouter au panier — le panier suit d'un rayon à l'autre, tout s'achète d'un coup."}
            </p>
          </section>
        )}
      </div>

      <ScreenToast message={toast} onDismiss={() => setToast(null)} />
      {contentsOf && <BoosterContentsDialog booster={contentsOf} owned={ownedSet} onClose={() => setContentsOf(null)} />}
    </GameScreen>
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
 * La vitrine : des pontons de trois socles, un seul visible, les autres à
 * sa droite. Les flèches font glisser le suivant depuis la droite ; sans
 * quatrième article, il n'y a pas de flèches du tout. Le rayon change → on
 * repart du premier ponton (la clé sur `Showcase` s'en charge).
 */
function Showcase({ items, footer, emptyText, dock }: { items: ReactNode[]; footer?: ReactNode; emptyText?: string; dock?: "decks" }) {
  const plates = chunk(items, PACKS_PER_PLATE);
  const [index, setIndex] = useState(0);
  // Le rayon a rétréci (achat, rafraîchissement) : on ne reste pas sur un ponton qui n'existe plus.
  useEffect(() => {
    if (index > Math.max(0, plates.length - 1)) setIndex(Math.max(0, plates.length - 1));
  }, [index, plates.length]);

  if (items.length === 0) {
    return (
      <div className={`${game.panel} ${game.empty} ${styles.notice}`}>
        <p className={game.emptyTitle}>{emptyText ?? "Rien en vente pour l'instant"}</p>
        {footer && <p className={game.muted}>{footer}</p>}
      </div>
    );
  }

  const go = (delta: number) => {
    playButtonClick();
    setIndex((current) => Math.min(plates.length - 1, Math.max(0, current + delta)));
  };

  return (
    <div className={styles.showcase}>
      <div className={styles.showcaseWindow}>
        <div className={styles.showcaseTrack} style={{ transform: `translateX(-${index * 100}%)` }}>
          {plates.map((plateItems, plateIndex) => (
            <div key={plateIndex} className={styles.plate} data-dock={dock} data-count={plateItems.length} aria-hidden={plateIndex !== index}>
              {plateItems.map((item, slotIndex) => (
                <div key={slotIndex} className={styles.pedestal} data-slot={plateItems.length === 1 ? 1 : plateItems.length === 2 ? slotIndex * 2 : slotIndex}>
                  {item}
                </div>
              ))}
            </div>
          ))}
        </div>
        {plates.length > 1 && (
          <>
            <button type="button" className={`${styles.showcaseArrow} ${styles.showcaseArrowLeft}`} onClick={() => go(-1)} disabled={index === 0} aria-label="Ponton précédent">
              <svg viewBox="0 0 24 24" width="22" height="22" fill="none" aria-hidden>
                <path d="M14.5 5.5L8 12l6.5 6.5" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            <button
              type="button"
              className={`${styles.showcaseArrow} ${styles.showcaseArrowRight}`}
              onClick={() => go(1)}
              disabled={index >= plates.length - 1}
              aria-label="Ponton suivant"
            >
              <svg viewBox="0 0 24 24" width="22" height="22" fill="none" aria-hidden>
                <path d="M9.5 5.5L16 12l-6.5 6.5" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </>
        )}
      </div>
      {(plates.length > 1 || footer) && (
        <div className={styles.showcaseFoot}>
          {plates.length > 1 && (
            <span className={styles.showcaseDots} aria-label={`Ponton ${index + 1} sur ${plates.length}`}>
              {plates.map((_, dot) => (
                <span key={dot} className={dot === index ? styles.showcaseDotActive : styles.showcaseDot} />
              ))}
            </span>
          )}
          {footer && <span className={styles.stageLink}>{footer}</span>}
        </div>
      )}
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
      <span className={styles.label}>
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
      <span className={styles.label}>
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
        {owned && <span className={styles.goodsOwned}>{ownedLabel}</span>}
        {inCart && (
          <span className={styles.cartBadge} aria-hidden>
            ✓
          </span>
        )}
      </button>
      <span className={styles.label}>
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
