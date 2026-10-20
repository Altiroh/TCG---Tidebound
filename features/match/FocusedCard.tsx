"use client";

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { type CardInstance, type TideStateName } from "@/game";
import { CardTile } from "@/features/match/CardTile";
import { playButtonClick } from "@/lib/sound";
import styles from "@/features/match/FocusedCard.module.css";

/**
 * LA CARTE EN MAIN DU JOUEUR, posée à droite de l'écran (retour du 12/10/2026).
 *
 * Plus de fenêtre par-dessus la table pour activer un effet : on touche la
 * carte qui luit (effet d'arrivée en réserve), on lâche un Objet sur le
 * Cimetière (Bris), et la carte VOLE de sa place jusqu'au centre droit de
 * l'écran, ses boutons dessous. « Annuler » la renvoie en vol à sa place ;
 * l'action engagée, elle reste là le temps que l'effet parte d'elle (les
 * sorts la prennent pour origine, `data-focus-card`), puis rentre.
 *
 * Le vol se mesure sur le VRAI plateau, au départ comme au retour : la carte
 * a pu bouger entre-temps, ou quitter le plateau (un Objet brisé rentre au
 * Cimetière). Pendant qu'elle est ici, sa place sur le plateau est vide.
 */

export interface FocusedCardAction {
  label: string;
  tone?: "accept" | "neutral" | "danger";
  disabled?: boolean;
  onClick: () => void;
}

export interface FocusedCardProps {
  card: CardInstance;
  tideState: TideStateName;
  /** Petite ligne au-dessus de la carte (« Effet d'arrivée », « Briser »…). */
  eyebrow: string;
  /** Ce que fera l'action, sous la carte. */
  detail?: ReactNode;
  /** Consigne en cours (« Touche une cible »), à la place des boutons quand ils sont masqués. */
  hint?: string;
  actions: FocusedCardAction[];
  /**
   * « Choisissez : A ou B » : chaque mode est une LIGNE de choix (son texte,
   * en clair), pas un bouton — un toucher l'active. Absent : un seul effet.
   */
  options?: FocusedCardAction[];
  /** Une cible se désigne sur le plateau : la carte luit en attendant le choix. */
  waiting?: boolean;
  /** Vrai : la carte rentre (à sa place, ou au Cimetière si elle n'est plus sur le plateau), puis `onDone`. */
  leaving: boolean;
  onDone: () => void;
}

/** Durée du vol aller et retour. */
const FLIGHT_MS = 460;

/** Élément de la carte sur la table : unité du plateau, sinon carte de main. */
function tableElementOf(instanceId: string): HTMLElement | null {
  return (
    document.querySelector<HTMLElement>(`[data-board-unit="${instanceId}"]`) ?? document.querySelector<HTMLElement>(`[data-card-id="${instanceId}"]`)
  );
}

/** Où rentre une carte qui n'est plus sur la table : le Cimetière du joueur (le plus bas à l'écran). */
function graveyardElement(): HTMLElement | null {
  const piles = Array.from(document.querySelectorAll<HTMLElement>("[data-graveyard]"));
  return piles.sort((a, b) => b.getBoundingClientRect().top - a.getBoundingClientRect().top)[0] ?? null;
}

/** Transformation qui pose `el` (à sa place finale) exactement sur `from`. */
function offsetFrom(el: HTMLElement, from: DOMRect): string {
  const to = el.getBoundingClientRect();
  const dx = from.left + from.width / 2 - (to.left + to.width / 2);
  const dy = from.top + from.height / 2 - (to.top + to.height / 2);
  const scale = to.width > 0 ? from.width / to.width : 1;
  return `translate(${dx}px, ${dy}px) scale(${scale})`;
}

export function FocusedCard({ card, tideState, eyebrow, detail, hint, actions, options, waiting = false, leaving, onDone }: FocusedCardProps) {
  const flyer = useRef<HTMLDivElement>(null);
  const [arrived, setArrived] = useState(false);

  // ALLER : de la carte du plateau jusqu'ici. Sa place reste vide le temps du séjour.
  useLayoutEffect(() => {
    const el = flyer.current;
    const source = tableElementOf(card.instanceId);
    if (source) source.style.visibility = "hidden";
    if (!el) return;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (!source || reduce) {
      setArrived(true);
      return;
    }
    const start = offsetFrom(el, source.getBoundingClientRect());
    const animation = el.animate(
      [
        { transform: start, offset: 0 },
        // Elle décolle : un peu plus grande, inclinée, comme soulevée par le vent.
        { transform: `translate(0, -18px) rotate(-6deg) scale(1.06)`, offset: 0.62 },
        { transform: "none", offset: 1 },
      ],
      { duration: FLIGHT_MS, easing: "cubic-bezier(0.2, 0.75, 0.25, 1)" }
    );
    animation.onfinish = () => setArrived(true);
    return () => animation.cancel();
  }, [card.instanceId]);

  // Démontée sans être rentrée (la partie a avancé) : la place se rallume quand même.
  useEffect(
    () => () => {
      const source = tableElementOf(card.instanceId);
      if (source) source.style.visibility = "";
    },
    [card.instanceId]
  );

  // RETOUR : à sa place si elle y est encore, sinon au Cimetière.
  const doneRef = useRef(onDone);
  doneRef.current = onDone;
  useEffect(() => {
    if (!leaving) return;
    const el = flyer.current;
    const source = tableElementOf(card.instanceId);
    const target = source ?? graveyardElement();
    const finish = () => {
      if (source) source.style.visibility = "";
      doneRef.current();
    };
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (!el || !target || reduce) {
      finish();
      return;
    }
    const end = offsetFrom(el, target.getBoundingClientRect());
    const animation = el.animate(
      [
        { transform: "none", opacity: 1 },
        { transform: `translate(0, -14px) rotate(5deg) scale(1.04)`, opacity: 1, offset: 0.35 },
        { transform: end, opacity: source ? 1 : 0.2 },
      ],
      { duration: FLIGHT_MS, easing: "cubic-bezier(0.45, 0, 0.25, 1)", fill: "forwards" }
    );
    animation.onfinish = finish;
    return () => animation.cancel();
  }, [leaving, card.instanceId]);

  // Échap vaut le premier bouton neutre (« Annuler »).
  useEffect(() => {
    const cancel = actions.find((action) => action.tone === "neutral");
    if (!cancel || leaving) return;
    function onKey(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      cancel!.onClick();
    }
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [actions, leaving]);

  const press = (action: FocusedCardAction) => () => {
    playButtonClick();
    action.onClick();
  };

  return (
    <div className={styles.stage} data-leaving={leaving || undefined} aria-live="polite">
      <div className={styles.column} data-waiting={waiting || undefined}>
        <div ref={flyer} className={styles.card} data-focus-card={card.instanceId} data-arrived={arrived || undefined} data-waiting={waiting || undefined}>
          <CardTile instance={card} tideState={tideState} widthClassName="w-full" scaleOnHover={false} badgeSize={44} />
        </div>
        {/* Un seul panneau de verre : ce que fait la carte, ses choix, ses boutons. */}
        <div className={styles.panel} data-shown={arrived && !leaving ? "" : undefined} data-waiting={waiting || undefined}>
          <p className={styles.eyebrow}>{eyebrow}</p>
          {detail && <p className={styles.detail}>{detail}</p>}
          {options && options.length > 0 && (
            <div className={styles.options} role="group" aria-label="Choisissez un effet">
              {options.map((option) => (
                <button key={option.label} type="button" className={styles.option} disabled={option.disabled || leaving} onClick={press(option)}>
                  <span>{option.label}</span>
                  <span aria-hidden className={styles.optionArrow}>
                    ›
                  </span>
                </button>
              ))}
            </div>
          )}
          {hint && <p className={styles.hint}>{hint}</p>}
          {actions.length > 0 && (
            <div className={styles.actions}>
              {actions.map((action) => (
                <button
                  key={action.label}
                  type="button"
                  className={styles.button}
                  data-tone={action.tone ?? "accept"}
                  disabled={action.disabled || leaving}
                  onClick={press(action)}
                >
                  {action.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
