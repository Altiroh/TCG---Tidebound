"use client";

import { SHIP_SET } from "@/game";
import { Dialog } from "@/features/shell/Dialog";
import { ShipPortrait } from "@/features/ships/ShipPortrait";
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
 * maximale, Slots) et son profil. Aucune donnée n'est décidée ici — tout
 * vient de `game/environment/shipData.ts`. Cliquer un Navire le choisit et
 * ferme le dialogue.
 */
export function ShipPicker({ currentShipId, onSelect, onClose }: ShipPickerProps) {
  return (
    <Dialog title="Choisir le Navire" onClose={onClose} width={860}>
      <p className={game.muted}>Le Navire fixe l&apos;Ancrage, la Raison et les Slots de départ du deck.</p>
      <div className={styles.grid} role="listbox" aria-label="Navires disponibles">
        {SHIP_SET.map((ship) => {
          const active = ship.id === currentShipId;
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
              {active && <span className={game.tagCyan}>Actuel</span>}
            </button>
          );
        })}
      </div>
    </Dialog>
  );
}
