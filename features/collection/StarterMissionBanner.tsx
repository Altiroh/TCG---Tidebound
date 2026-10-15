"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { STARTER_DECKS } from "@/game";
import { Dialog } from "@/features/shell/Dialog";
import { shipNameOf } from "@/features/ships/ShipPortrait";
import { nameplateArtUrl } from "@/features/decks/nameplateArt";
import { getPreference, hydratePreferences, setPreference } from "@/lib/preferences";
import { playButtonClick } from "@/lib/sound";
import game from "@/features/shell/GameScreen.module.css";
import styles from "@/features/collection/StarterMissionBanner.module.css";

/**
 * Préférence de COMPTE (`lib/preferences.ts`) : l'annonce de la première
 * mission a été vue. Sur le compte et non sur l'appareil, pour qu'un joueur
 * qui change de navigateur ne la revoie pas.
 */
export const STARTER_MISSION_SEEN_KEY = "tb:mission-starters-vue";

/**
 * ANNONCE DE LA PREMIÈRE MISSION (15/10/2026), dans la Collection.
 *
 * Remplace le choix gratuit d'un préconstruit : à la sortie du tutoriel —
 * terminé ou passé —, le serveur a déjà débloqué les trois starters
 * (`features/onboarding/starterMission.ts`). Il n'y a plus rien à choisir,
 * seulement à DIRE ce qui vient d'arriver, une fois.
 *
 * Le serveur décide si la mission est accomplie (`show`) ; la préférence du
 * compte décide si elle a déjà été annoncée. On attend la relecture du
 * compte avant d'ouvrir le bandeau : sur un nouvel appareil, la copie
 * locale est vide, et l'annonce reviendrait à tort.
 */
export function StarterMissionBanner({ show }: { show: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!show || getPreference(STARTER_MISSION_SEEN_KEY)) return;
    let cancelled = false;
    void hydratePreferences().then(() => {
      if (!cancelled && !getPreference(STARTER_MISSION_SEEN_KEY)) setOpen(true);
    });
    return () => {
      cancelled = true;
    };
  }, [show]);

  if (!open) return null;

  function close() {
    setPreference(STARTER_MISSION_SEEN_KEY, true);
    setOpen(false);
  }

  return (
    <Dialog
      title="Première mission accomplie — trois équipages t'attendent"
      description="Ces trois préconstruits sont à toi : joue-les tout de suite. Les cartes que tu ne possèdes pas encore restent prêtées, chaque booster en remplace une par une carte bien à toi."
      variant="banner"
      onClose={close}
      actions={
        <>
          <button type="button" className={game.secondary} onClick={close}>
            Plus tard
          </button>
          <button
            type="button"
            className={game.primary}
            onClick={() => {
              playButtonClick();
              close();
              router.push("/decks");
            }}
          >
            Voir mes decks
          </button>
        </>
      }
    >
      <ul className={styles.crews} aria-label="Les trois starters">
        {STARTER_DECKS.map((deck) => {
          const art = nameplateArtUrl(deck.cardIds, deck.shipId);
          return (
            <li key={deck.id} className={styles.crew}>
              <span className={styles.crewArt} style={art ? { backgroundImage: `url("${art}")` } : undefined} aria-hidden />
              <span className={styles.crewName}>{deck.name}</span>
              <span className={styles.crewMeta}>{shipNameOf(deck.shipId)}</span>
              <span className={styles.crewMeta}>{deck.style}</span>
            </li>
          );
        })}
      </ul>
    </Dialog>
  );
}
