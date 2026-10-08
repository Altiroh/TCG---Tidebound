/**
 * EMPLACEMENTS DU RANG (décision du 08/10/2026) — le joueur choisit OÙ il
 * pose sa carte, cases vides comprises : « tout à droite » reste tout à
 * droite. Une carte posée garde sa case (`CardInstance.slot`) ; elle ne
 * glisse plus vers la gauche quand une voisine quitte le plateau.
 *
 * Aucune règle ne lit la position (pas de « voisine », pas d'« adjacente ») :
 * la case est une affaire de PRÉSENTATION, que le moteur retient pour que
 * les deux joueurs voient le même plateau.
 *
 * Une carte arrivée sans case (jeton, retour du Cimetière, prise de
 * contrôle) ou dont la case est déjà prise prend la première case libre
 * en partant de la gauche, dans l'ordre du plateau.
 */
export function boardSlotLayout<T extends { slot?: number }>(permanents: readonly T[], capacity: number): (T | undefined)[] {
  const layout: (T | undefined)[] = Array.from({ length: Math.max(capacity, permanents.length) }, () => undefined);
  const waiting: T[] = [];
  for (const card of permanents) {
    const slot = card.slot;
    if (slot !== undefined && Number.isInteger(slot) && slot >= 0 && slot < capacity && layout[slot] === undefined) {
      layout[slot] = card;
    } else {
      waiting.push(card);
    }
  }
  for (const card of waiting) {
    const free = layout.indexOf(undefined);
    if (free >= 0) layout[free] = card;
    else layout.push(card);
  }
  return layout;
}

/**
 * La case où poser une carte : celle demandée si elle est libre, sinon la
 * case libre la plus proche de `near` (un Équipement à côté de son porteur,
 * à droite d'abord), sinon la première libre. `undefined` : rang plein.
 */
export function chooseBoardSlot(
  permanents: readonly { slot?: number }[],
  capacity: number,
  wanted?: number,
  near?: number
): number | undefined {
  const layout = boardSlotLayout(permanents, capacity).slice(0, capacity);
  const isFree = (slot: number) => slot >= 0 && slot < capacity && layout[slot] === undefined;
  if (wanted !== undefined && Number.isInteger(wanted) && isFree(wanted)) return wanted;
  if (near !== undefined) {
    for (let d = 1; d < capacity; d += 1) {
      if (isFree(near + d)) return near + d;
      if (isFree(near - d)) return near - d;
    }
  }
  const first = layout.indexOf(undefined);
  return first >= 0 ? first : undefined;
}
