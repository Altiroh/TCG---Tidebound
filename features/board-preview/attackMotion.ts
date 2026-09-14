/**
 * Mise en scène d'une attaque — reprise de l'ancien board
 * (`features/match/AttackImpactLayer.tsx`, `useAttackPresentation.ts`) :
 * la VRAIE carte se soulève, prend un élan à l'opposé de sa cible, frappe,
 * puis revient ; au choc, la cible tremble et s'illumine.
 *
 * Web Animations API directement sur les éléments du plateau : aucun rendu
 * React par frame. Ici pas de `transform: scale()` global (contrairement à
 * `BoardStage`) : les distances viewport sont directement celles à parcourir.
 */

/** Découpage de l'ancien board (retour de test du 13/09). */
export const ATTACK_TIMINGS = { lift: 170, windup: 210, strike: 140, back: 400 } as const;
export const ATTACK_IMPACT_AT_MS = ATTACK_TIMINGS.lift + ATTACK_TIMINGS.windup + ATTACK_TIMINGS.strike;
export const ATTACK_TOTAL_MS = ATTACK_IMPACT_AT_MS + ATTACK_TIMINGS.back;

function center(rect: DOMRect) {
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
}

export function animateAttacker(attackerEl: HTMLElement, targetEl: HTMLElement): Animation {
  const attackerRect = attackerEl.getBoundingClientRect();
  const targetRect = targetEl.getBoundingClientRect();
  const from = center(attackerRect);
  const to = center(targetRect);
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const distance = Math.hypot(dx, dy) || 1;
  const ux = dx / distance;
  const uy = dy / distance;
  // S'arrête quand la carte "touche" sa cible (légère interpénétration), pas en plein centre.
  const contact = ((attackerRect.height + targetRect.height) / 2) * 0.7;
  const reach = Math.max(distance * 0.4, distance - contact);
  // Élan proportionné à la carte (26 px pour une carte de ~190 px sur l'ancien board).
  const windup = attackerRect.height * 0.14;
  const lift = attackerRect.height * 0.05;
  const tilt = ux >= 0 ? -4 : 4;

  const t = ATTACK_TOTAL_MS;
  const liftAt = ATTACK_TIMINGS.lift / t;
  const windupAt = (ATTACK_TIMINGS.lift + ATTACK_TIMINGS.windup) / t;
  const impactAt = ATTACK_IMPACT_AT_MS / t;

  const previousZ = attackerEl.style.zIndex;
  attackerEl.style.zIndex = "60";

  const animation = attackerEl.animate(
    [
      { transform: "translate(0px, 0px) scale(1) rotate(0deg)", easing: "cubic-bezier(.2,.8,.3,1)" },
      { offset: liftAt, transform: `translate(0px, ${-lift}px) scale(1.08) rotate(0deg)`, filter: "drop-shadow(0 16px 14px rgba(0,0,0,.55))", easing: "cubic-bezier(.4,0,.6,1)" },
      {
        offset: windupAt,
        transform: `translate(${-ux * windup}px, ${-uy * windup - lift}px) scale(1.1) rotate(${tilt}deg)`,
        filter: "drop-shadow(0 20px 16px rgba(0,0,0,.55))",
        easing: "cubic-bezier(.55,0,1,.45)",
      },
      { offset: impactAt, transform: `translate(${ux * reach}px, ${uy * reach}px) scale(1.04) rotate(0deg)`, filter: "drop-shadow(0 8px 8px rgba(0,0,0,.5))", easing: "cubic-bezier(.2,.8,.25,1)" },
      { transform: "translate(0px, 0px) scale(1) rotate(0deg)" },
    ],
    { duration: t }
  );
  const restore = () => {
    attackerEl.style.zIndex = previousZ;
  };
  animation.onfinish = restore;
  animation.oncancel = restore;
  return animation;
}

/** Léger tremblement + flash, joué au choc sur la cible (et sur l'attaquant en cas de riposte). */
export function shake(el: HTMLElement) {
  el.animate(
    [
      { transform: "translateX(0)", filter: "brightness(1)" },
      { transform: "translateX(-6px)", filter: "brightness(1.9)", offset: 0.15 },
      { transform: "translateX(5px)", filter: "brightness(1.5)", offset: 0.35 },
      { transform: "translateX(-3px)", offset: 0.55 },
      { transform: "translateX(2px)", offset: 0.75 },
      { transform: "translateX(0)", filter: "brightness(1)" },
    ],
    { duration: 320, easing: "ease-out" }
  );
}
