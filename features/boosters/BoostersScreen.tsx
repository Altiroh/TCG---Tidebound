"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PITY } from "@/game/boosters";
import { PaperSurface } from "@/features/shell/PaperSurface";
import { ScreenHeader } from "@/features/shell/ScreenHeader";
import { ScreenShell } from "@/features/shell/ScreenShell";
import { UtilityBar } from "@/features/shell/UtilityBar";
import shell from "@/features/shell/ScreenShell.module.css";
import styles from "@/features/boosters/Boosters.module.css";
import { purchaseBooster, type BoosterInventory } from "@/features/boosters/actions";
import { BoosterOpeningScene } from "@/features/boosters/opening/BoosterOpeningScene";
import { preloadBoosterOpeningAssets } from "@/features/boosters/opening/boosterOpeningAssets";
import { MOCK_BOOSTER_CARDS } from "@/features/boosters/opening/mockBoosterCards";
import { playButtonClick } from "@/lib/sound";

interface BoostersScreenProps {
  inventory: BoosterInventory;
}

/**
 * Écran Boosters — montée sur la même coquille que Collection et Decks.
 * L'objet posé sur le papier est ici un paquet scellé.
 *
 * PROTOTYPE : « Ouvrir » ne lance pour l'instant QUE la scène d'ouverture,
 * avec des cartes factices. Aucun appel serveur, aucune écriture : le
 * booster n'est pas consommé et la collection ne change pas.
 */
export function BoostersScreen({ inventory }: BoostersScreenProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [busyBoosterId, setBusyBoosterId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openingBoosterId, setOpeningBoosterId] = useState<string | null>(null);

  const hasOwnedBooster = inventory.boosters.some((booster) => booster.owned > 0);

  // Images de la scène chargées et décodées en avance : « Ouvrir » démarre sans flash.
  useEffect(() => {
    if (hasOwnedBooster) void preloadBoosterOpeningAssets();
  }, [hasOwnedBooster]);

  function handleOpen(boosterId: string) {
    if (openingBoosterId) return;
    playButtonClick();
    setError(null);
    // TODO(booster-serveur) : c'est ici que se branchera la vraie ouverture —
    // `openBooster(boosterId)` (`features/boosters/actions.ts`) consomme le
    // booster, tire le contenu et crédite la collection côté base. Son
    // résultat (`cards`, converties via `toOpeningRarity`) remplacera
    // `MOCK_BOOSTER_CARDS`. Pour le prototype, AUCUN appel.
    setOpeningBoosterId(boosterId);
  }

  function handleOpeningClosed() {
    setOpeningBoosterId(null);
    // TODO(booster-serveur) : une fois l'ouverture réelle branchée, rafraîchir
    // l'inventaire et la collection ici (`router.refresh()`). Rien n'a changé
    // côté serveur dans le prototype, donc rien à recharger.
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
    <ScreenShell>
      <ScreenHeader active="boosters" />

      <PaperSurface>
        <div className={shell.paperScrollFill}>
          {!inventory.isSignedIn ? (
            <div className={shell.emptyState}>
              <span className={shell.emptyStateTitle}>Connecte-toi pour ouvrir des boosters</span>
              <p>Tes boosters, tes Tides et ta collection sont enregistrés sur ton compte.</p>
              <Link href="/connexion" className={shell.primaryAction} onClick={() => playButtonClick()}>
                Se connecter
              </Link>
            </div>
          ) : inventory.boosters.length === 0 ? (
            <div className={shell.emptyState}>
              <span className={shell.emptyStateTitle}>Aucun booster disponible</span>
              <p>
                Le catalogue de boosters est vide en base. Applique les migrations Supabase, puis lance{" "}
                <code>npm run seed:cards</code>.
              </p>
            </div>
          ) : (
            <>
              {error && <p className={styles.error}>{error}</p>}

              <div className={styles.shelf}>
                {inventory.boosters.map((booster) => {
                  const busy = busyBoosterId === booster.boosterId || isPending;
                  const canAfford = booster.price !== null && inventory.balance >= booster.price;
                  const packClass = booster.owned > 0 ? `${styles.pack} ${styles.packOwned}` : `${styles.pack} ${styles.packEmpty}`;
                  // Le compteur de pity n'est montré qu'une fois le
                  // renforcement commencé : avant, c'est du bruit.
                  const showPity = booster.packsSinceAbyssal >= PITY.rampStartsAfterPacks;

                  return (
                    <div key={booster.boosterId} className={packClass}>
                      <button
                        type="button"
                        className={styles.packObject}
                        onClick={() => booster.owned > 0 && !busy && handleOpen(booster.boosterId)}
                        disabled={booster.owned === 0 || busy}
                        aria-label={
                          booster.owned > 0 ? `Ouvrir un ${booster.name}` : `${booster.name} — aucun exemplaire`
                        }
                        title={booster.owned > 0 ? "Ouvrir" : "Tu n'en possèdes aucun"}
                      >
                        {booster.owned > 0 && <span className={styles.packCount}>×{booster.owned}</span>}
                      </button>

                      <span className={styles.packName}>{booster.name}</span>
                      <span className={styles.packMeta}>
                        {booster.cardCount} cartes
                        {booster.price !== null && ` · ${booster.price} Tides`}
                      </span>

                      {showPity && (
                        <span className={styles.packPity}>
                          {booster.packsSinceAbyssal} sans Abyssale
                          {booster.packsSinceAbyssal >= PITY.guaranteeAtPack - 1
                            ? " · garantie au prochain"
                            : " · chance renforcée"}
                        </span>
                      )}

                      <div className={styles.packActions}>
                        {booster.owned > 0 && (
                          <button
                            type="button"
                            className={styles.packButtonPrimary}
                            onClick={() => handleOpen(booster.boosterId)}
                            disabled={busy}
                          >
                            {busy ? "Ouverture…" : "Ouvrir"}
                          </button>
                        )}
                        {booster.isPurchasable && booster.price !== null && (
                          <button
                            type="button"
                            className={styles.packButton}
                            onClick={() => handlePurchase(booster.boosterId)}
                            disabled={busy || !canAfford}
                            title={canAfford ? undefined : "Solde de Tides insuffisant"}
                          >
                            Acheter
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </PaperSurface>

      <UtilityBar
        left={
          <Link href="/collection" className={shell.ghostAction} onClick={() => playButtonClick()}>
            Voir la collection
          </Link>
        }
        right={
          inventory.isSignedIn ? (
            <span className={shell.progressionTides} style={{ justifyContent: "flex-end" }}>
              {inventory.balance}
              <span className={shell.progressionTidesLabel}>Tides</span>
            </span>
          ) : undefined
        }
      />

      {openingBoosterId && <BoosterOpeningScene cards={MOCK_BOOSTER_CARDS} onClose={handleOpeningClosed} />}
    </ScreenShell>
  );
}
