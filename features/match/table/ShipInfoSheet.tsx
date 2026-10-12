"use client";

import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { reasonCeiling, slotsUsed, type PlayerState, type ShipDefinition, type TideStateName } from "@/game";
import { TIDE_STATE_LABELS } from "@/features/match/cardDisplay";
import { shipIllustrationUrl } from "@/features/ships/shipFrame";
import { shipTraits } from "@/features/ships/shipText";
import { useShipFrameGeometryFor } from "@/features/cosmetics/MatchCosmeticsProvider";
import styles from "@/features/match/table/Table.module.css";
import dock from "@/features/match/table/ShipInfoSheet.module.css";

interface ShipInfoSheetProps {
  player: PlayerState;
  ship: ShipDefinition;
  /** Emplacements utilisables en ce moment (condamnés ou ajoutés compris). Défaut : ceux du Navire. */
  capacity?: number;
  /** « Ton Navire », « Navire adverse »… */
  ownerLabel: string;
  onClose: () => void;
}

/** Attribut `data-kind` de chaque trait d'identité — il porte la couleur de la ligne. */
const TRAIT_KIND = { Passif: "passive", "Capacité": "capacity", Faiblesse: "weakness" } as const;

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
 * Fiche d'un Navire en partie — le sien, ou celui d'en face. Réduite, en
 * verre liquide, posée à côté du Navire (12/10/2026) : on la lit sans
 * perdre le plateau de vue (`ShipInfoSheet.module.css`).
 *
 * Tout ce qu'on doit pouvoir savoir de l'adversaire sans le lui demander :
 * Ancrage et Raison (avec leurs plafonds), emplacements occupés, taille de
 * main, de pioche et de cimetière, et surtout ce que fait son Navire —
 * passif, capacité, faiblesse, réactions à la Marée. Rien de caché n'y
 * figure : ce sont des informations publiques de la table.
 */
export function ShipInfoSheet({ player, ship, capacity = ship.slotCount, ownerLabel, onClose }: ShipInfoSheetProps) {
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
  // Passif / Capacité / Faiblesse passent par `shipTraits`, comme l'écran de
  // sélection : c'est lui qui retire les notes d'implémentation (« (non
  // appliqué : …) ») que la fiche affichait telles quelles au joueur, et qui
  // sait lire une capacité réellement câblée (`activatableAbility`) en plus
  // du `capacityText` de celles qui attendent encore le moteur.
  const identityTraits = shipTraits(ship);
  const ratio = (value: number, max: number) => `${Math.max(0, Math.min(1, max > 0 ? value / max : 0)) * 100}%`;

  // Accrochée À CÔTÉ du Navire consulté, à sa hauteur, sans sortir de l'écran ;
  // sans place à côté (téléphone étroit), elle se pose au bord gauche.
  const panelRef = useRef<HTMLDivElement>(null);
  const [place, setPlace] = useState<{ left: number; top: number } | null>(null);
  useLayoutEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;
    const margin = 12;
    const width = panel.offsetWidth;
    const height = panel.offsetHeight;
    const safe = getComputedStyle(document.documentElement);
    const inset = (name: string) => parseFloat(safe.getPropertyValue(name)) || 0;
    const minLeft = margin + inset("--tb-safe-left");
    const maxLeft = window.innerWidth - margin - inset("--tb-safe-right") - width;
    const minTop = margin + inset("--tb-safe-top");
    const maxTop = window.innerHeight - margin - inset("--tb-safe-bottom") - height;
    const shipEl = document.querySelector<HTMLElement>(`[data-ship-target="${player.id}"]`);
    const ship = shipEl?.getBoundingClientRect();
    const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
    if (!ship || ship.width === 0) {
      setPlace({ left: minLeft, top: clamp((window.innerHeight - height) / 2, minTop, maxTop) });
      return;
    }
    // À droite du Navire s'il y a la place, sinon à sa gauche, sinon par-dessus en bordure.
    const right = ship.right + margin;
    const left = right <= maxLeft ? right : ship.left - margin - width >= minLeft ? ship.left - margin - width : minLeft;
    setPlace({ left: clamp(left, minLeft, Math.max(minLeft, maxLeft)), top: clamp(ship.top + ship.height / 2 - height / 2, minTop, Math.max(minTop, maxTop)) });
  }, [player.id]);

  return (
    <>
      {/* Toucher le plateau referme la fiche : il reste visible, rien ne le voile. */}
      <div className={dock.catcher} onClick={onClose} role="presentation" />
      <div
        ref={panelRef}
        className={dock.panel}
        style={place ? { left: place.left, top: place.top } : { left: 0, top: 0, visibility: "hidden" }}
        role="dialog"
        aria-modal
        aria-label={`${ownerLabel} — ${ship.name}`}
      >
        <header className={dock.head}>
          <div className={dock.thumb} style={{ "--frame-aspect": frame.aspect } as CSSProperties} aria-hidden>
            <div className={styles.shipArt} style={{ ...frame.zone, clipPath: frame.clip }}>
              {ship.illustration && (
                // eslint-disable-next-line @next/next/no-img-element -- illustration locale du Navire
                <img src={shipIllustrationUrl(ship.illustration)} alt="" draggable={false} className={styles.fill} />
              )}
            </div>
            {/* eslint-disable-next-line @next/next/no-img-element -- cadre du plateau */}
            <img src={frame.src} alt="" draggable={false} className={styles.shipFrame} />
          </div>
          <div className={dock.headText}>
            <p className={dock.subtitle}>{ownerLabel}</p>
            <h2 className={dock.title}>{ship.name}</h2>
          </div>
          <button type="button" className={dock.close} onClick={onClose} aria-label="Fermer">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" aria-hidden>
              <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth={2} strokeLinecap="round" />
            </svg>
          </button>
        </header>

        <div className={dock.gauges}>
          <div className={dock.gauge} data-kind="anchor">
            <span className={dock.gaugeLabel}>Ancrage</span>
            <span className={dock.gaugeValue}>
              {player.anchor} <small>/ {ship.startingAnchor}</small>
            </span>
            <span className={dock.gaugeBar}>
              <span className={dock.gaugeFill} style={{ width: ratio(player.anchor, ship.startingAnchor) }} />
            </span>
          </div>
          <div className={dock.gauge} data-kind="reason" data-debt={player.reason < 0 ? "true" : "false"}>
            <span className={dock.gaugeLabel}>Raison</span>
            <span className={dock.gaugeValue}>
              {player.reason} <small>/ {ceiling}</small>
            </span>
            <span className={dock.gaugeBar}>
              <span className={dock.gaugeFill} style={{ width: ratio(player.reason, ceiling) }} />
            </span>
          </div>
          <div className={dock.gauge} data-kind="slots">
            <span className={dock.gaugeLabel}>Emplacements</span>
            <span className={dock.gaugeValue}>
              {slotsUsed(player.board)} <small>/ {capacity}</small>
            </span>
            <span className={dock.gaugeBar}>
              <span className={dock.gaugeFill} style={{ width: ratio(slotsUsed(player.board), capacity) }} />
            </span>
          </div>
        </div>

        <p className={dock.counts}>
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

        {ship.text && <p className={dock.profile}>{ship.text}</p>}

        <dl className={dock.traits}>
          {identityTraits.map((trait) => (
            <div key={trait.label} className={dock.trait} data-kind={TRAIT_KIND[trait.label]}>
              <dt>{trait.label}</dt>
              <dd>{trait.text}</dd>
            </div>
          ))}
        </dl>

        {traits.length > 0 && (
          <div className={dock.tides}>
            {traits.map((trait) => (
              <span key={trait.label} className={dock.tideTag} data-kind={trait.bad ? "bad" : "good"}>
                {trait.label}
              </span>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
