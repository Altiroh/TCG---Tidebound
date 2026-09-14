"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { GameScreen } from "@/features/shell/GameScreen";
import game from "@/features/shell/GameScreen.module.css";
import styles from "@/features/market/Market.module.css";
import { purchaseBooster, type BoosterInventory, type BoosterInventoryEntry } from "@/features/boosters/actions";
import { MAX_PURCHASE_QUANTITY } from "@/features/boosters/constants";
import { closedPackVariables, getBoosterPackVisual } from "@/features/boosters/opening/boosterPackVisuals";
import { playButtonClick } from "@/lib/sound";

interface MarketScreenProps {
  inventory: BoosterInventory;
}

/**
 * MARKET — la boutique, et rien d'autre : on y ACHÈTE des boosters contre
 * des Tides. Les ouvrir se fait dans « Mes boosters » (`/boosters`), écran
 * séparé. Cette séparation est l'objet même de l'écran : un seul écran qui
 * proposait « Ouvrir » et « Acheter » sur la même tuile ne disait jamais
 * lequel des deux on était en train de faire.
 *
 * Rien de l'économie n'est décidé ici : le prix et le solde sont affichés
 * tels que la base les donne, et `purchaseBooster` → `purchase_booster`
 * (Postgres, atomique) revérifie prix, disponibilité et solde avant de
 * débiter. Le sélecteur de quantité ne fait que choisir un nombre — un
 * total calculé à l'écran n'est qu'une indication.
 */
export function MarketScreen({ inventory }: MarketScreenProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [busyBoosterId, setBusyBoosterId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [purchased, setPurchased] = useState<{ name: string; quantity: number } | null>(null);

  // Un booster non achetable (le Mini Booster de Bienvenue, offert) n'a rien
  // à faire dans une boutique : il s'obtient, il ne se vend pas.
  const onSale = inventory.boosters.filter((booster) => booster.isPurchasable && booster.price !== null);

  async function handlePurchase(booster: BoosterInventoryEntry, quantity: number) {
    playButtonClick();
    setError(null);
    setPurchased(null);
    setBusyBoosterId(booster.boosterId);

    const result = await purchaseBooster(booster.boosterId, quantity);
    setBusyBoosterId(null);

    if (!result.ok) {
      setError(result.error ?? "Achat impossible.");
      return;
    }

    setPurchased({ name: booster.name, quantity });
    // `revalidatePath` côté action a invalidé le cache : on rafraîchit pour
    // lire le nouveau solde et la nouvelle réserve plutôt que de les deviner.
    startTransition(() => router.refresh());
  }

  return (
    <GameScreen active="market" nav="minimal">
      <div className={styles.layout}>
        <div className={styles.layoutInner}>
          <div className={game.pageHead}>
            <div>
              <p className={game.eyebrow}>Boutique</p>
              <h1 className={game.title}>Market</h1>
            </div>
            {inventory.isSignedIn && (
              <span className={styles.balance} aria-label={`Solde : ${inventory.balance} Tides`}>
                {inventory.balance}
                <span className={styles.balanceLabel}>Tides</span>
              </span>
            )}
          </div>

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
              {error && <p className={game.error}>{error}</p>}
              {purchased && !error && (
                <p className={game.success}>
                  {purchased.quantity} × {purchased.name} ajouté{purchased.quantity > 1 ? "s" : ""} à ta réserve.{" "}
                  <Link href="/boosters" className={game.link} onClick={() => playButtonClick()}>
                    Ouvrir maintenant →
                  </Link>
                </p>
              )}

              <div className={styles.shelf}>
                {onSale.map((booster) => (
                  <MarketStall
                    key={booster.boosterId}
                    booster={booster}
                    balance={inventory.balance}
                    busy={busyBoosterId === booster.boosterId || isPending}
                    onBuy={(quantity) => void handlePurchase(booster, quantity)}
                  />
                ))}
              </div>
            </>
          )}

          <div className={styles.footRow}>
            <Link href="/boosters" className={game.link} onClick={() => playButtonClick()}>
              Voir mes boosters →
            </Link>
            <Link href="/quetes" className={game.link} onClick={() => playButtonClick()} style={{ marginLeft: "auto" }}>
              Gagner des Tides avec les quêtes →
            </Link>
          </div>
        </div>
      </div>
    </GameScreen>
  );
}

/**
 * Un étal : le sachet, ce qu'il contient, son prix à l'unité, un sélecteur
 * de quantité et l'achat. Le total est recalculé à chaque cran — voir
 * combien on va dépenser AVANT de cliquer est la moitié du travail d'une
 * boutique.
 */
function MarketStall({
  booster,
  balance,
  busy,
  onBuy,
}: {
  booster: BoosterInventoryEntry;
  balance: number;
  busy: boolean;
  onBuy: (quantity: number) => void;
}) {
  const price = booster.price ?? 0;
  const [quantity, setQuantity] = useState(1);

  // Ce que le solde permet, borné par le maximum d'un achat. Zéro quand on
  // ne peut même pas s'en offrir un — le bouton le dit alors franchement.
  const affordable = price > 0 ? Math.min(MAX_PURCHASE_QUANTITY, Math.floor(balance / price)) : MAX_PURCHASE_QUANTITY;
  const total = price * quantity;
  const canAfford = total <= balance;

  function step(delta: number) {
    playButtonClick();
    setQuantity((current) => Math.min(MAX_PURCHASE_QUANTITY, Math.max(1, current + delta)));
  }

  return (
    <article className={`${game.panelRaised} ${styles.stall}`} aria-label={booster.name}>
      <span className={styles.stallPack} style={closedPackVariables(getBoosterPackVisual(booster.boosterId))} aria-hidden />

      <h2 className={styles.stallName}>{booster.name}</h2>
      <p className={styles.stallMeta}>
        {booster.cardCount} cartes
        {booster.owned > 0 && (
          <>
            <span aria-hidden> · </span>
            <span className={styles.stallOwned}>{booster.owned} en réserve</span>
          </>
        )}
      </p>

      <p className={styles.stallPrice}>
        {price}
        <span className={styles.stallPriceUnit}>Tides / unité</span>
      </p>

      <div className={styles.quantity} role="group" aria-label={`Quantité de ${booster.name}`}>
        <button
          type="button"
          className={styles.quantityStep}
          onClick={() => step(-1)}
          disabled={busy || quantity <= 1}
          aria-label="Un de moins"
        >
          <svg viewBox="0 0 24 24" fill="none" width="13" height="13" aria-hidden>
            <path d="M6 12h12" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" />
          </svg>
        </button>
        <span className={styles.quantityValue} aria-live="polite">
          {quantity}
        </span>
        <button
          type="button"
          className={styles.quantityStep}
          onClick={() => step(1)}
          disabled={busy || quantity >= MAX_PURCHASE_QUANTITY}
          aria-label="Un de plus"
        >
          <svg viewBox="0 0 24 24" fill="none" width="13" height="13" aria-hidden>
            <path d="M12 6v12M6 12h12" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" />
          </svg>
        </button>
      </div>

      <p className={`${styles.stallTotal} ${canAfford ? "" : styles.stallTotalShort}`}>
        Total <span className={styles.stallTotalValue}>{total}</span> Tides
      </p>

      <button
        type="button"
        className={game.primary}
        onClick={() => onBuy(quantity)}
        disabled={busy || !canAfford}
        title={canAfford ? undefined : "Solde de Tides insuffisant"}
      >
        {busy ? "Achat…" : canAfford ? "Acheter" : "Tides insuffisants"}
      </button>

      {/* Dit ce qu'on peut s'offrir plutôt que de laisser buter sur un
          bouton éteint. */}
      {!canAfford && (
        <p className={styles.stallHint}>
          {affordable > 0 ? `Tu peux en prendre ${affordable} avec ton solde.` : "Il te manque des Tides — les quêtes en donnent."}
        </p>
      )}
    </article>
  );
}
