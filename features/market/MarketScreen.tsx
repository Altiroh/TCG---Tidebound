"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { GameScreen } from "@/features/shell/GameScreen";
import game from "@/features/shell/GameScreen.module.css";
import styles from "@/features/market/Market.module.css";
import shelf from "@/features/shell/Shelf.module.css";
import { TideCoin } from "@/features/shell/HeaderPlayer";
import { ScreenToast, type ScreenToastMessage } from "@/features/shell/ScreenToast";
import { purchaseBooster, type BoosterInventory, type BoosterInventoryEntry } from "@/features/boosters/actions";
import { MAX_PURCHASE_QUANTITY } from "@/features/boosters/constants";
import { splitIntoShelves } from "@/features/boosters/stackedShelf";
import { closedPackVariables, getBoosterPackVisual } from "@/features/boosters/opening/boosterPackVisuals";
import { notifyProgressionChanged } from "@/features/progression/progressionSync";
import { playButtonClick } from "@/lib/sound";

interface MarketScreenProps {
  inventory: BoosterInventory;
}

/** Quantités du panier, par id de booster. Un booster absent vaut 0. */
type Cart = Record<string, number>;

/**
 * MARKET — la boutique, et rien d'autre : on y ACHÈTE des boosters contre
 * des Tides. Les ouvrir se fait dans « Mes boosters » (`/boosters`).
 *
 * Deux plans, de haut en bas :
 *   - l'ÉTAGÈRE : les sachets en vente posés sur une planche, chacun avec
 *     son étiquette de prix. Cliquer un sachet en met un au panier ;
 *   - le PANIER : une ligne par booster (quantité, sous-total), et en bas à
 *     droite le coût total de la transaction avec le bouton d'achat.
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

  // Un booster non achetable (le Mini Booster de Bienvenue, offert) n'a rien
  // à faire dans une boutique : il s'obtient, il ne se vend pas.
  const onSale = useMemo(
    () => inventory.boosters.filter((booster) => booster.isPurchasable && booster.price !== null),
    [inventory.boosters]
  );

  const total = onSale.reduce((sum, booster) => sum + (booster.price ?? 0) * (cart[booster.boosterId] ?? 0), 0);
  const itemCount = onSale.reduce((sum, booster) => sum + (cart[booster.boosterId] ?? 0), 0);
  const shortBy = Math.max(0, total - inventory.balance);

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
    const lines = onSale.filter((booster) => (cart[booster.boosterId] ?? 0) > 0);
    let bought = 0;
    let failure: string | null = null;
    const remaining: Cart = { ...cart };

    for (const booster of lines) {
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
    <GameScreen active="market" nav="minimal">
      <div className={styles.layout}>
        <div className={styles.layoutInner}>
          <h1 className={game.title}>Market</h1>

          {!inventory.isSignedIn ? (
            <div className={`${game.panel} ${game.empty}`}>
              <p className={game.emptyTitle}>Connecte-toi pour acheter des boosters</p>
              <p className={game.muted}>Tes Tides, tes boosters et ta collection sont enregistrés sur ton compte.</p>
              <Link href="/connexion" className={game.primary} onClick={() => playButtonClick()} style={{ marginTop: 6 }}>
                Se connecter
              </Link>
            </div>
          ) : onSale.length === 0 ? (
            <div className={`${game.panel} ${game.empty}`}>
              <p className={game.emptyTitle}>Rien en vente pour l&apos;instant</p>
              <p className={game.muted}>
                Le catalogue de boosters est vide en base. Applique les migrations Supabase, puis lance{" "}
                <code>npm run seed:cards</code>.
              </p>
            </div>
          ) : (
            <>
              {/* Cinq sachets par étagère ; au-delà, une étagère en dessous et on défile. */}
              <section className={styles.stage} aria-label="Boosters en vente">
                {splitIntoShelves(onSale).map((shelfBoosters, shelfIndex) => (
                  <div key={shelfIndex} className={styles.shelfUnit}>
                    <div className={styles.shelfItems}>
                      {shelfBoosters.map((booster) => (
                        <ShelfItem
                          key={booster.boosterId}
                          booster={booster}
                          inCart={cart[booster.boosterId] ?? 0}
                          disabled={isBuying || (cart[booster.boosterId] ?? 0) >= MAX_PURCHASE_QUANTITY}
                          onAdd={() => step(booster.boosterId, 1)}
                        />
                      ))}
                    </div>
                    <div className={shelf.plank} aria-hidden />
                    <div className={styles.shelfLabels}>
                      {shelfBoosters.map((booster) => (
                        <div key={booster.boosterId} className={styles.shelfLabel}>
                          <span className={styles.shelfName}>{booster.name}</span>
                          <span className={styles.shelfPrice}>
                            <TideCoin size={12} />
                            {booster.price}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </section>

              <section className={`${game.panel} ${styles.cart}`} aria-label="Panier">
                {/* Seulement ce qui est au panier : les boosters en vente sont déjà sur l'étagère. */}
                {itemCount === 0 && <p className={styles.cartEmpty}>Touche un booster pour l&apos;ajouter au panier.</p>}
                <ul className={styles.cartLines} hidden={itemCount === 0}>
                  {onSale.filter((booster) => (cart[booster.boosterId] ?? 0) > 0).map((booster) => {
                    const quantity = cart[booster.boosterId] ?? 0;
                    return (
                      <li key={booster.boosterId} className={styles.cartLine}>
                        <span className={styles.cartName}>{booster.name}</span>
                        <span className={styles.stepper} role="group" aria-label={`Quantité de ${booster.name}`}>
                          <button
                            type="button"
                            className={styles.stepperButton}
                            onClick={() => step(booster.boosterId, -1)}
                            disabled={isBuying || quantity <= 0}
                            aria-label="Un de moins"
                          >
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
                        <span className={styles.cartSubtotal}>{(booster.price ?? 0) * quantity}</span>
                      </li>
                    );
                  })}
                </ul>

                <div className={styles.checkout}>
                  <div className={styles.totalBlock}>
                    <span className={styles.totalValue} data-short={shortBy > 0 ? "true" : "false"}>
                      <TideCoin size={18} />
                      {total}
                    </span>
                    {/* Une seule indication, et seulement quand elle empêche d'acheter. */}
                    {shortBy > 0 && <span className={styles.totalHint}>Il manque {shortBy} Tides</span>}
                  </div>
                  <button
                    type="button"
                    className={styles.clearButton}
                    onClick={() => {
                      playButtonClick();
                      setCart({});
                    }}
                    disabled={isBuying || itemCount === 0}
                  >
                    Vider
                  </button>
                  <button
                    type="button"
                    className={game.primary}
                    onClick={() => void handleCheckout()}
                    disabled={isBuying || itemCount === 0 || shortBy > 0}
                  >
                    {isBuying ? "Achat…" : itemCount > 1 ? `Acheter (${itemCount})` : "Acheter"}
                  </button>
                </div>
              </section>
            </>
          )}
        </div>
      </div>

      <ScreenToast message={toast} onDismiss={() => setToast(null)} />
    </GameScreen>
  );
}

/** Un sachet posé sur l'étagère. Le toucher en met un au panier ; la pastille dit combien y sont déjà. */
function ShelfItem({
  booster,
  inCart,
  disabled,
  onAdd,
}: {
  booster: BoosterInventoryEntry;
  inCart: number;
  disabled: boolean;
  onAdd: () => void;
}) {
  return (
    <button
      type="button"
      className={styles.shelfItem}
      data-in-cart={inCart > 0 ? "true" : "false"}
      onClick={onAdd}
      disabled={disabled}
      aria-label={`Ajouter un ${booster.name} au panier`}
    >
      <span className={styles.shelfPack} style={closedPackVariables(getBoosterPackVisual(booster.boosterId))} aria-hidden />
      {inCart > 0 && (
        <span key={inCart} className={styles.cartBadge} aria-hidden>
          ×{inCart}
        </span>
      )}
    </button>
  );
}
