"use client";

import { SHIP_SET } from "@/game";
import { Dialog } from "@/features/shell/Dialog";
import { ShipPortrait } from "@/features/ships/ShipPortrait";
import { shipTraits } from "@/features/ships/shipText";
import game from "@/features/shell/GameScreen.module.css";
import styles from "@/features/ships/ShipPicker.module.css";
import { playButtonClick } from "@/lib/sound";

interface ShipPickerProps {
  currentShipId: string;
  onSelect: (shipId: string) => void;
  onClose: () => void;
}

/**
 * Choix du Navire d'un deck : les Navires réels du jeu (`SHIP_SET`), chacun
 * dans son cadre, avec ses trois chiffres (Ancrage de départ, Raison
 * maximale, Slots), son profil ET ses traits — passif, capacité, faiblesse.
 * Ces traits sont la moitié de ce qui distingue deux Navires : les cacher
 * revenait à demander de choisir sur trois nombres.
 *
 * Aucune donnée n'est décidée ici — tout vient de
 * `game/environment/shipData.ts`, nettoyé de ses notes d'implémentation
 * par `shipTraits`. Cliquer un Navire le choisit et ferme le dialogue ; la
 * croix (et Échap, et le voile) referme sans rien changer.
 */
export function ShipPicker({ currentShipId, onSelect, onClose }: ShipPickerProps) {
  return (
    <Dialog title="Choisir le Navire" onClose={onClose} width={980}>
      <p className={game.muted}>Le Navire fixe l&apos;Ancrage, la Raison et les Slots de départ du deck.</p>
      <div className={styles.grid} role="listbox" aria-label="Navires disponibles">
        {SHIP_SET.map((ship) => {
          const active = ship.id === currentShipId;
          const traits = shipTraits(ship);
          return (
            <button
              key={ship.id}
              type="button"
              role="option"
              aria-selected={active}
              className={`${active ? game.tileActive : game.tile} ${styles.tile}`}
              onClick={() => {
                playButtonClick();
                onSelect(ship.id);
                onClose();
              }}
            >
              <ShipPortrait shipId={ship.id} width="100%" showName={false} />
              <span className={styles.name}>{ship.name}</span>
              <span className={styles.stats}>
                <span title="Ancrage de départ">⚓ {ship.startingAnchor}</span>
                <span title="Raison maximale">◐ {ship.reasonMax}</span>
                <span title="Slots">▣ {ship.slotCount}</span>
              </span>
              <span className={styles.profile}>{ship.text}</span>

              {traits.length > 0 && (
                <span className={styles.traits}>
                  {traits.map((trait) => (
                    <span
                      key={trait.label}
                      className={`${styles.trait} ${trait.label === "Faiblesse" ? styles.traitWeak : ""}`}
                    >
                      <span className={styles.traitLabel}>{trait.label}</span>
                      <span className={styles.traitText}>{trait.text}</span>
                    </span>
                  ))}
                </span>
              )}

              {active && <span className={game.tagCyan}>Actuel</span>}
            </button>
          );
        })}
      </div>
    </Dialog>
  );
}
