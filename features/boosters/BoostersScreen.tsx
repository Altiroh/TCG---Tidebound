"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PITY } from "@/game/boosters";
import { GameScreen } from "@/features/shell/GameScreen";
import game from "@/features/shell/GameScreen.module.css";
import styles from "@/features/boosters/Boosters.module.css";
import { purchaseBooster, type BoosterInventory } from "@/features/boosters/actions";
import { BoosterOpeningScene } from "@/features/boosters/opening/BoosterOpeningScene";
import { preloadBoosterOpeningAssets } from "@/features/boosters/opening/boosterOpeningAssets";
import { closedPackVariables, getBoosterPackVisual } from "@/features/boosters/opening/boosterPackVisuals";
import { drawTestBoosterCards } from "@/features/boosters/opening/testBoosterCards";
import type { BoosterOpeningCard } from "@/features/boosters/opening/types";
import { playButtonClick } from "@/lib/sound";

/**
 * Boutons « Tester l'animation » : rejouent la scène d'ouverture sans
 * posséder de booster ni être connecté. Purement visuels, comme « Ouvrir »
 * pour l'instant.
 * TODO(booster-serveur) : retirer (ou réserver au développement) une fois
 * l'ouverture réelle branchée.
 */
const OPENING_TEST_BOOSTERS = [
  { boosterId: "standard", label: "Standard" },
  { boosterId: "welcome_tutorial", label: "Bienvenue" },
] as const;

interface BoostersScreenProps {
  inventory: BoosterInventory;
}

/**
 * Market — les boosters, sur la coquille commune. Chaque booster est une
 * tuile : le sachet fermé, le nom, le contenu et le prix, puis Ouvrir /
 * Acheter. Le solde de Tides est en tête de page (et dans le bandeau).
 *
 * PROTOTYPE : « Ouvrir » ne lance pour l'instant QUE la scène d'ouverture,
 * avec des cartes du catalogue tirées au hasard localement. Aucun appel
 * serveur, aucune écriture : le booster n'est pas consommé.
 */
export function BoostersScreen({ inventory }: BoostersScreenProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [busyBoosterId, setBusyBoosterId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** Ouverture en cours : cartes tirées UNE fois au clic, pour ne jamais changer en cours de scène. */
  const [opening, setOpening] = useState<{ boosterId: string; cards: BoosterOpeningCard[] } | null>(null);

  const ownedBoosterIds = inventory.boosters
    .filter((booster) => booster.owned > 0)
    .map((booster) => booster.boosterId)
    .join(",");

  // Images de la scène chargées et décodées en avance : « Ouvrir » démarre sans flash.
  useEffect(() => {
    if (!ownedBoosterIds) return;
    for (const boosterId of ownedBoosterIds.split(",")) {
      void preloadBoosterOpeningAssets(getBoosterPackVisual(boosterId));
    }
  }, [ownedBoosterIds]);

  function handleOpen(boosterId: string) {
    if (opening) return;
    playButtonClick();
    setError(null);
    // TODO(booster-serveur) : c'est ici que se branchera la vraie ouverture —
    // `openBooster(boosterId)` (`features/boosters/actions.ts`) consomme le
    // booster, tire le contenu et crédite la collection côté base. Son
    // résultat (`cards`, converties via `toOpeningRarity`) remplacera
    // `drawTestBoosterCards()`. Pour le prototype, AUCUN appel.
    setOpening({ boosterId, cards: drawTestBoosterCards(boosterId) });
  }

  function handleOpeningClosed() {
    setOpening(null);
    // TODO(booster-serveur) : une fois l'ouverture réelle branchée, rafraîchir
    // l'inventaire et la collection ici (`router.refresh()`).
  }

  function handlePurchase(boosterId: string) {
    playButtonClick();
    setError(null);
    setBusyBoosterId(boosterId);

    void purchaseBooster(boosterId)
      .then((result) => {
        if (!result.ok) {
          setError(result.error ?? "Achat impossible.");
          return;
        }
        // `revalidatePath` côté action a invalidé le cache ; on rafraîchit
        // pour voir le nouveau solde et le nouvel exemplaire.
        startTransition(() => router.refresh());
      })
      .finally(() => setBusyBoosterId(null));
  }

  return (
    <GameScreen active="boosters">
      <div className={game.content}>
        <div className={game.contentWide}>
          <div className={game.pageHead}>
            <div>
              <p className={game.eyebrow}>Market</p>
              <h1 className={game.title}>Boosters</h1>
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
              <p className={game.emptyTitle}>Connecte-toi pour ouvrir des boosters</p>
              <p className={game.muted}>Tes boosters, tes Tides et ta collection sont enregistrés sur ton compte.</p>
              <Link href="/connexion" className={game.primary} onClick={() => playButtonClick()} style={{ marginTop: 6 }}>
                Se connecter
              </Link>
            </div>
          ) : inventory.boosters.length === 0 ? (
            <div className={`${game.panel} ${game.empty}`}>
              <p className={game.emptyTitle}>Aucun booster disponible</p>
              <p className={game.muted}>
                Le catalogue de boosters est vide en base. Applique les migrations Supabase, puis lance <code>npm run seed:cards</code>.
              </p>
            </div>
          ) : (
            <>
              {error && <p className={game.error}>{error}</p>}

              <div className={styles.shelf}>
                {inventory.boosters.map((booster) => {
                  const busy = busyBoosterId === booster.boosterId || isPending;
                  const canAfford = booster.price !== null && inventory.balance >= booster.price;
                  const packClass = booster.owned > 0 ? `${styles.pack} ${styles.packOwned}` : `${styles.pack} ${styles.packEmpty}`;
                  // Le compteur de pity n'est montré qu'une fois le renforcement commencé : avant, c'est du bruit.
                  const showPity = booster.packsSinceAbyssal >= PITY.rampStartsAfterPacks;

                  return (
                    <article key={booster.boosterId} className={`${game.panelRaised} ${packClass}`} aria-label={booster.name}>
                      <button
                        type="button"
                        className={styles.packObject}
                        // Le sachet fermé de CE booster (le même visuel que l'animation d'ouverture), et non un dos de carte.
                        style={closedPackVariables(getBoosterPackVisual(booster.boosterId))}
                        onClick={() => booster.owned > 0 && !busy && handleOpen(booster.boosterId)}
                        disabled={booster.owned === 0 || busy}
                        aria-label={booster.owned > 0 ? `Ouvrir un ${booster.name}` : `${booster.name} — aucun exemplaire`}
                        title={booster.owned > 0 ? "Ouvrir" : "Tu n'en possèdes aucun"}
                      >
                        {booster.owned > 0 && <span className={styles.packCount}>×{booster.owned}</span>}
                      </button>

                      <span className={styles.packName}>{booster.name}</span>
                      <span className={styles.packMeta}>
                        <span>{booster.cardCount} cartes</span>
                        {booster.price !== null && (
                          <>
                            <span aria-hidden>·</span>
                            <span className={styles.packPrice}>{booster.price} Tides</span>
                          </>
                        )}
                        {booster.owned === 0 && <span className={game.tag}>Aucun</span>}
                      </span>

                      {showPity && (
                        <span className={styles.packPity}>
                          {booster.packsSinceAbyssal} sans Abyssale
                          {booster.packsSinceAbyssal >= PITY.guaranteeAtPack - 1 ? " · garantie au prochain" : " · chance renforcée"}
                        </span>
                      )}

                      <div className={styles.packActions}>
                        {booster.owned > 0 && (
                          <button type="button" className={game.primary} onClick={() => handleOpen(booster.boosterId)} disabled={busy}>
                            {busy ? "Ouverture…" : "Ouvrir"}
                          </button>
                        )}
                        {booster.isPurchasable && booster.price !== null && (
                          <button
                            type="button"
                            className={game.secondary}
                            onClick={() => handlePurchase(booster.boosterId)}
                            disabled={busy || !canAfford}
                            title={canAfford ? undefined : "Solde de Tides insuffisant"}
                          >
                            Acheter
                          </button>
                        )}
                      </div>
                    </article>
                  );
                })}
              </div>
            </>
          )}

          <div className={styles.testRow} role="group" aria-label="Tester l’animation d’ouverture">
            <span>Tester l&apos;animation d&apos;ouverture</span>
            {OPENING_TEST_BOOSTERS.map((test) => (
              <button key={test.boosterId} type="button" className={game.link} onClick={() => handleOpen(test.boosterId)} disabled={opening !== null}>
                {test.label}
              </button>
            ))}
            <Link href="/collection" className={game.link} onClick={() => playButtonClick()} style={{ marginLeft: "auto" }}>
              Voir la collection →
            </Link>
          </div>
        </div>
      </div>

      {opening && <BoosterOpeningScene cards={opening.cards} visual={getBoosterPackVisual(opening.boosterId)} onClose={handleOpeningClosed} />}
    </GameScreen>
  );
}
