"use client";

import { useMemo, useState, useTransition, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { GameScreen } from "@/features/shell/GameScreen";
import game from "@/features/shell/GameScreen.module.css";
import styles from "@/features/market/Market.module.css";
import { TideCoin } from "@/features/shell/HeaderPlayer";
import { ScreenToast, type ScreenToastMessage } from "@/features/shell/ScreenToast";
import { purchaseBooster, type BoosterInventory, type BoosterInventoryEntry } from "@/features/boosters/actions";
import { MAX_PURCHASE_QUANTITY } from "@/features/boosters/constants";
import { closedPackVariables, getBoosterPackVisual } from "@/features/boosters/opening/boosterPackVisuals";
import { notifyProgressionChanged } from "@/features/progression/progressionSync";
import { playButtonClick } from "@/lib/sound";
import { BoosterContentsDialog } from "@/features/market/BoosterContentsDialog";

interface MarketScreenProps {
  inventory: BoosterInventory;
}

/** Quantités du panier, par id de booster. Un booster absent vaut 0. */
type Cart = Record<string, number>;

/** Trois socles par ponton (`market/pedestals.webp`) : au-delà, un ponton de plus en dessous. */
const PACKS_PER_PLATE = 3;

/** Rayons de la boutique. Seuls les boosters sont en vente aujourd'hui : les autres sont annoncés, pas cachés. */
const SECTIONS: Array<{ id: string; label: string; icon: ReactNode; available: boolean }> = [
  {
    id: "boosters",
    label: "Boosters",
    available: true,
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
    available: false,
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
    available: false,
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
    available: false,
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
    available: false,
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

/**
 * MARKET — la boutique : on y ACHÈTE des boosters contre des Tides. Les
 * ouvrir se fait dans « Mes boosters » (`/boosters`), toujours à portée
 * depuis le panneau de gauche.
 *
 * Un quai de nuit (`market/background.webp`) :
 *   - à gauche, l'ENSEIGNE de bois : les rayons de la boutique ;
 *   - au centre, le PONTON : chaque booster debout sur son socle, nom et
 *     prix gravés dessous. Toucher un booster en met un au panier ;
 *   - en bas, le PANIER dans son cadre de laiton : une vignette par booster
 *     choisi, quantité, sous-total et achat.
 *
 * Le solde n'est PAS répété ici : le bandeau le porte, et il est relu
 * après chaque achat (`notifyProgressionChanged`).
 *
 * Rien de l'économie n'est décidé ici : `purchaseBooster` →
 * `purchase_booster` (Postgres, atomique) revérifie prix, disponibilité et
 * solde avant de débiter. Le total affiché n'est qu'une indication.
 */
export function MarketScreen({ inventory }: MarketScreenProps) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [cart, setCart] = useState<Cart>({});
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

  const total = onSale.reduce((sum, booster) => sum + (booster.price ?? 0) * (cart[booster.boosterId] ?? 0), 0);
  const itemCount = onSale.reduce((sum, booster) => sum + (cart[booster.boosterId] ?? 0), 0);
  const shortBy = Math.max(0, total - inventory.balance);
  /** Exemplaires en réserve, tous types confondus — offerts compris (Bienvenue). */
  const ownedCount = inventory.boosters.reduce((sum, booster) => sum + booster.owned, 0);
  const cartLines = onSale.filter((booster) => (cart[booster.boosterId] ?? 0) > 0);

  function setQuantity(boosterId: string, quantity: number) {
    setCart((current) => ({ ...current, [boosterId]: Math.min(MAX_PURCHASE_QUANTITY, Math.max(0, quantity)) }));
  }

  function step(boosterId: string, delta: number) {
    playButtonClick();
    setQuantity(boosterId, (cart[boosterId] ?? 0) + delta);
  }

  function showToast(tone: ScreenToastMessage["tone"], text: React.ReactNode, action?: React.ReactNode) {
    setToast({ id: Date.now(), tone, text, action });
  }

  async function handleCheckout() {
    if (isBuying || itemCount === 0) return;
    playButtonClick();
    setIsBuying(true);

    // Un appel par type de booster : chacun est une transaction atomique
    // côté base. On s'arrête au premier refus — la suite du panier reste
    // en place, rien n'a été débité pour elle.
    let bought = 0;
    let failure: string | null = null;
    const remaining: Cart = { ...cart };

    for (const booster of cartLines) {
      const quantity = cart[booster.boosterId] ?? 0;
      const result = await purchaseBooster(booster.boosterId, quantity);
      if (!result.ok) {
        failure = result.error ?? "Achat impossible.";
        break;
      }
      bought += quantity;
      remaining[booster.boosterId] = 0;
    }

    setIsBuying(false);
    setCart(remaining);

    if (bought > 0) {
      notifyProgressionChanged();
      // `revalidatePath` côté action a invalidé le cache : on relit la
      // réserve plutôt que de la deviner.
      startTransition(() => router.refresh());
    }

    if (failure) {
      showToast("error", bought > 0 ? `${bought} booster${bought > 1 ? "s" : ""} acheté${bought > 1 ? "s" : ""}, puis : ${failure}` : failure);
      return;
    }

    showToast(
      "success",
      <>
        {bought} booster{bought > 1 ? "s" : ""} ajouté{bought > 1 ? "s" : ""} à ta réserve
      </>,
      <Link href="/boosters" onClick={() => playButtonClick()}>
        Ouvrir →
      </Link>
    );
  }

  return (
    <GameScreen active="market" nav="minimal" className={styles.screen}>
      <div className={styles.market}>
        {/* ── L'enseigne : les rayons ─────────────────────────── */}
        <aside className={styles.side} aria-label="Rayons du Market">
          <div className={styles.sideInner}>
            <h1 className={styles.sideTitle}>Market</h1>
            <nav className={styles.sections}>
              {SECTIONS.map((section) => (
                <button
                  key={section.id}
                  type="button"
                  className={styles.section}
                  data-active={section.id === "boosters" ? "true" : undefined}
                  disabled={!section.available}
                  aria-current={section.id === "boosters" ? "page" : undefined}
                  title={section.available ? undefined : "Bientôt disponible"}
                >
                  <span className={styles.sectionIcon}>{section.icon}</span>
                  <span className={styles.sectionLabel}>{section.label}</span>
                  {!section.available && <span className="sr-only">(bientôt disponible)</span>}
                </button>
              ))}
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

        {/* ── Le ponton : les boosters sur leurs socles ─────────── */}
        <section className={styles.stage} aria-label="Boosters en vente">
          {!inventory.isSignedIn ? (
            <div className={`${game.panel} ${game.empty} ${styles.notice}`}>
              <p className={game.emptyTitle}>Connecte-toi pour acheter des boosters</p>
              <p className={game.muted}>Tes Tides, tes boosters et ta collection sont enregistrés sur ton compte.</p>
              <Link href="/connexion" className={game.primary} onClick={() => playButtonClick()} style={{ marginTop: 6 }}>
                Se connecter
              </Link>
            </div>
          ) : onSale.length === 0 ? (
            <div className={`${game.panel} ${game.empty} ${styles.notice}`}>
              <p className={game.emptyTitle}>Rien en vente pour l&apos;instant</p>
              <p className={game.muted}>
                Le catalogue de boosters est vide en base. Applique les migrations Supabase, puis lance <code>npm run seed:cards</code>.
              </p>
            </div>
          ) : (
            <div className={styles.plates}>
              {chunk(onSale, PACKS_PER_PLATE).map((plateBoosters, plateIndex) => (
                <div key={plateIndex} className={styles.plate} data-count={plateBoosters.length}>
                  {plateBoosters.map((booster, index) => (
                    <PedestalItem
                      key={booster.boosterId}
                      booster={booster}
                      slot={plateBoosters.length === 1 ? 1 : plateBoosters.length === 2 ? index * 2 : index}
                      inCart={cart[booster.boosterId] ?? 0}
                      disabled={isBuying || (cart[booster.boosterId] ?? 0) >= MAX_PURCHASE_QUANTITY}
                      onAdd={() => step(booster.boosterId, 1)}
                      ownedInPool={new Set(booster.pool.map((entry) => entry.cardId).filter((id) => ownedSet.has(id))).size}
                      poolSize={new Set(booster.pool.map((entry) => entry.cardId)).size}
                      onShowContents={() => {
                        playButtonClick();
                        setContentsOf(booster);
                      }}
                    />
                  ))}
                </div>
              ))}
            </div>
          )}
        </section>

        {/* ── Le panier ───────────────────────────────────────── */}
        {inventory.isSignedIn && onSale.length > 0 && (
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
              <button
                type="button"
                className={styles.clearButton}
                onClick={() => {
                  playButtonClick();
                  setCart({});
                }}
                disabled={isBuying || itemCount === 0}
              >
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" aria-hidden>
                  <path d="M4 7h16M9 7V4.5h6V7M6.5 7l1 13h9l1-13M10 11v6M14 11v6" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                Vider
              </button>
            </header>

            <div className={styles.cartBody}>
              <ul className={styles.cartLines}>
                {cartLines.length === 0 && <li className={styles.cartEmpty}>Ton panier est vide.</li>}
                {cartLines.map((booster) => {
                  const quantity = cart[booster.boosterId] ?? 0;
                  return (
                    <li key={booster.boosterId} className={styles.cartLine}>
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
                      <button
                        type="button"
                        className={styles.removeButton}
                        onClick={() => {
                          playButtonClick();
                          setQuantity(booster.boosterId, 0);
                        }}
                        disabled={isBuying}
                        aria-label={`Retirer ${booster.name} du panier`}
                      >
                        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" aria-hidden>
                          <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth={2} strokeLinecap="round" />
                        </svg>
                      </button>
                    </li>
                  );
                })}
              </ul>

              <div className={styles.checkout}>
                <span className={styles.totalBlock}>
                  <span className={styles.totalLabel}>Sous-total</span>
                  <span className={styles.totalValue} data-short={shortBy > 0 ? "true" : "false"}>
                    <TideCoin size={20} />
                    {total}
                  </span>
                </span>
                <button type="button" className={styles.buyButton} onClick={() => void handleCheckout()} disabled={isBuying || itemCount === 0 || shortBy > 0}>
                  {isBuying ? "Achat…" : "Acheter"}
                </button>
              </div>
            </div>

            <p className={styles.cartHint} data-short={shortBy > 0 ? "true" : "false"}>
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" aria-hidden>
                <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth={1.5} />
                <path d="M12 11v5.5M12 7.8v.2" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" />
              </svg>
              {shortBy > 0 ? `Il manque ${shortBy} Tides pour ce panier.` : "Touchez un booster pour l'ajouter au panier."}
            </p>
          </section>
        )}
      </div>

      <ScreenToast message={toast} onDismiss={() => setToast(null)} />
      {contentsOf && <BoosterContentsDialog booster={contentsOf} owned={ownedSet} onClose={() => setContentsOf(null)} />}
    </GameScreen>
  );
}

/**
 * Un booster debout sur son socle. Le toucher en met un au panier ; la
 * pastille dit combien y sont déjà. `slot` : le socle occupé (0, 1, 2 — de
 * gauche à droite) ; un booster seul prend celui du milieu.
 */
function PedestalItem({
  booster,
  slot,
  inCart,
  disabled,
  onAdd,
  ownedInPool,
  poolSize,
  onShowContents,
}: {
  booster: BoosterInventoryEntry;
  slot: number;
  inCart: number;
  disabled: boolean;
  onAdd: () => void;
  ownedInPool: number;
  poolSize: number;
  onShowContents: () => void;
}) {
  return (
    <div className={styles.pedestal} data-slot={slot}>
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
        {poolSize > 0 && (
          <button type="button" className={styles.contentsButton} onClick={onShowContents} title="Voir les cartes obtenables">
            <svg viewBox="0 0 24 24" width="13" height="13" fill="none" aria-hidden>
              <rect x="4" y="5" width="11" height="15" rx="1.5" stroke="currentColor" strokeWidth={1.6} />
              <path d="M9 3h9.5A1.5 1.5 0 0 1 20 4.5V17" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" />
            </svg>
            Contenu · {ownedInPool}/{poolSize}
          </button>
        )}
      </span>
    </div>
  );
}
