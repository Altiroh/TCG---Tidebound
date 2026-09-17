"use client";

import { useEffect, type CSSProperties } from "react";
import { reasonCeiling, type PlayerState, type ShipDefinition, type TideStateName } from "@/game";
import { TIDE_STATE_LABELS } from "@/features/match/cardDisplay";
import { shipIllustrationUrl } from "@/features/ships/shipFrame";
import { useShipFrameGeometryFor } from "@/features/cosmetics/MatchCosmeticsProvider";
import styles from "@/features/match/table/Table.module.css";
import sheet from "@/features/match/table/TableSheet.module.css";

interface ShipInfoSheetProps {
  player: PlayerState;
  ship: ShipDefinition;
  /** « Ton Navire », « Navire adverse »… */
  ownerLabel: string;
  onClose: () => void;
}

/** Effets de Marée du Navire, en clair : ce qui le protège, ce qui l'use. */
function tideTraits(ship: ShipDefinition): Array<{ label: string; bad: boolean }> {
  const traits: Array<{ label: string; bad: boolean }> = [];
  for (const [state, amount] of Object.entries(ship.resistanceByState ?? {})) {
    traits.push({ label: `${TIDE_STATE_LABELS[state as TideStateName]} : −${amount} dégât d'Ancrage`, bad: false });
  }
  for (const [state, amount] of Object.entries(ship.weaknessByState ?? {})) {
    traits.push({ label: `${TIDE_STATE_LABELS[state as TideStateName]} : +${amount} dégât d'Ancrage`, bad: true });
  }
  for (const [state, amount] of Object.entries(ship.reasonWeaknessByState ?? {})) {
    traits.push({ label: `${TIDE_STATE_LABELS[state as TideStateName]} : −${amount} Raison en plus`, bad: true });
  }
  if (ship.directAttackWeakness) traits.push({ label: `Attaque directe : +${ship.directAttackWeakness} dégât`, bad: true });
  if (ship.deraisonDamageReduction) traits.push({ label: `Déraison : −${ship.deraisonDamageReduction} dégât`, bad: false });
  return traits;
}

/**
 * Fiche d'un Navire en partie — le sien, ou celui d'en face.
 *
 * Tout ce qu'on doit pouvoir savoir de l'adversaire sans le lui demander :
 * Ancrage et Raison (avec leurs plafonds), emplacements occupés, taille de
 * main, de pioche et de cimetière, et surtout ce que fait son Navire —
 * passif, capacité, faiblesse, réactions à la Marée. Rien de caché n'y
 * figure : ce sont des informations publiques de la table.
 */
export function ShipInfoSheet({ player, ship, ownerLabel, onClose }: ShipInfoSheetProps) {
  useEffect(() => {
    // En capture, et sans propagation : Échap ferme la fiche, il n'ouvre pas
    // AUSSI le menu de pause du plateau (qui écoute la même touche).
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      event.stopImmediatePropagation();
      onClose();
    }
    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [onClose]);

  // Le cadre du Navire consulté : celui de SON propriétaire, adversaire compris.
  const frame = useShipFrameGeometryFor(player.id);
  const ceiling = reasonCeiling(player);
  const traits = tideTraits(ship);
  const ratio = (value: number, max: number) => `${Math.max(0, Math.min(1, max > 0 ? value / max : 0)) * 100}%`;

  return (
    <div className={sheet.backdrop} onClick={onClose} role="presentation">
      <div className={sheet.sheetNarrow} role="dialog" aria-modal aria-label={`${ownerLabel} — ${ship.name}`} onClick={(event) => event.stopPropagation()}>
        <header className={sheet.head}>
          <div className={sheet.headText}>
            <p className={sheet.subtitle}>{ownerLabel}</p>
            <h2 className={sheet.title}>{ship.name}</h2>
          </div>
          <button type="button" className={sheet.close} onClick={onClose} aria-label="Fermer">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" aria-hidden>
              <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth={2} strokeLinecap="round" />
            </svg>
          </button>
        </header>

        <div className={sheet.body}>
          <div className={sheet.ship}>
            <div className={sheet.shipFrame} style={{ "--frame-aspect": frame.aspect } as CSSProperties} aria-hidden>
              <div className={styles.shipArt} style={{ ...frame.zone, clipPath: frame.clip }}>
                {ship.illustration && (
                  // eslint-disable-next-line @next/next/no-img-element -- illustration locale du Navire
                  <img src={shipIllustrationUrl(ship.illustration)} alt="" draggable={false} className={styles.fill} />
                )}
              </div>
              {/* eslint-disable-next-line @next/next/no-img-element -- cadre du plateau */}
              <img src={frame.src} alt="" draggable={false} className={styles.shipFrame} />
            </div>

            <div>
              <div className={sheet.gauges}>
                <div className={sheet.gauge} data-kind="anchor">
                  <span className={sheet.gaugeLabel}>Ancrage</span>
                  <span className={sheet.gaugeValue}>
                    {player.anchor} <small>/ {ship.startingAnchor}</small>
                  </span>
                  <span className={sheet.gaugeBar}>
                    <span className={sheet.gaugeFill} style={{ width: ratio(player.anchor, ship.startingAnchor) }} />
                  </span>
                </div>
                <div className={sheet.gauge} data-kind="reason" data-debt={player.reason < 0 ? "true" : "false"}>
                  <span className={sheet.gaugeLabel}>Raison</span>
                  <span className={sheet.gaugeValue}>
                    {player.reason} <small>/ {ceiling}</small>
                  </span>
                  <span className={sheet.gaugeBar}>
                    <span className={sheet.gaugeFill} style={{ width: ratio(player.reason, ceiling) }} />
                  </span>
                </div>
                <div className={sheet.gauge} data-kind="slots">
                  <span className={sheet.gaugeLabel}>Emplacements</span>
                  <span className={sheet.gaugeValue}>
                    {player.board.length} <small>/ {ship.slotCount}</small>
                  </span>
                  <span className={sheet.gaugeBar}>
                    <span className={sheet.gaugeFill} style={{ width: ratio(player.board.length, ship.slotCount) }} />
                  </span>
                </div>
              </div>

              <p className={sheet.counts}>
                <span>
                  Main <b>{player.hand.length}</b>
                </span>
                <span>
                  Pioche <b>{player.deck.length}</b>
                </span>
                <span>
                  Cimetière <b>{player.graveyard.length}</b>
                </span>
              </p>

              {ship.text && <p className={sheet.profile}>{ship.text}</p>}

              <dl className={sheet.traits}>
                {ship.passiveText && (
                  <div className={sheet.trait} data-kind="passive">
                    <dt>Passif</dt>
                    <dd>{ship.passiveText}</dd>
                  </div>
                )}
                {ship.capacityText && (
                  <div className={sheet.trait} data-kind="capacity">
                    <dt>Capacité</dt>
                    <dd>{ship.capacityText}</dd>
                  </div>
                )}
                {ship.weaknessText && (
                  <div className={sheet.trait} data-kind="weakness">
                    <dt>Faiblesse</dt>
                    <dd>{ship.weaknessText}</dd>
                  </div>
                )}
              </dl>

              {traits.length > 0 && (
                <div className={sheet.tides}>
                  {traits.map((trait) => (
                    <span key={trait.label} className={sheet.tideTag} data-kind={trait.bad ? "bad" : "good"}>
                      {trait.label}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
