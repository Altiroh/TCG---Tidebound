"use client";

import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";

/**
 * État d'écran MÉMORISÉ sur l'appareil — les filtres et tris que le joueur
 * a choisis, retrouvés tels quels à son retour, où que ce soit dans l'app
 * (demande du 24/09/2026).
 *
 * Même parti que `lib/settings.ts` : c'est un confort du poste de jeu, pas
 * une donnée du compte — il vit en `localStorage`, jamais en base.
 *
 * Trois garde-fous :
 *  - le rendu serveur et le premier rendu client utilisent la valeur par
 *    défaut ; la valeur mémorisée n'arrive qu'après le montage, sans
 *    désaccord d'hydratation ;
 *  - tout ce qui est relu passe par `decode`, qui écarte une valeur
 *    corrompue ou périmée (un filtre d'une ancienne version, un booster
 *    retiré du catalogue) plutôt que de la laisser vider l'écran ;
 *  - stockage indisponible (navigation privée stricte) : l'état marche
 *    normalement, il n'est simplement pas retenu.
 */

const PREFIX = "tidebound:filtres:";

export interface PersistCodec<T> {
  /** Ce qui est écrit — par défaut l'état tel quel. Sert à écarter un champ (la recherche tapée) ou à sérialiser un `Set`. */
  encode?: (value: T) => unknown;
  /** Relit une valeur stockée ; `undefined` = inutilisable, on garde la valeur par défaut. */
  decode: (raw: unknown) => T | undefined;
}

/**
 * `useState`, retenu sous `key`. `key` à `null` : un `useState` ordinaire
 * (un écran qui partage le hook sans vouloir mémoriser).
 */
export function usePersistedState<T>(
  key: string | null,
  initial: T | (() => T),
  codec: PersistCodec<T>
): [T, Dispatch<SetStateAction<T>>] {
  const [state, setState] = useState<T>(initial);
  // Rien n'est écrit avant d'avoir relu : sinon la valeur par défaut du
  // premier rendu écraserait ce que le joueur avait choisi. Un ÉTAT et non
  // une ref : l'écriture n'est permise qu'au rendu SUIVANT la relecture —
  // même quand le mode strict rejoue les effets de montage.
  const [hydrated, setHydrated] = useState(false);
  const codecRef = useRef(codec);
  codecRef.current = codec;

  useEffect(() => {
    if (key === null) return;
    try {
      const raw = window.localStorage.getItem(PREFIX + key);
      if (raw !== null) {
        const value = codecRef.current.decode(JSON.parse(raw));
        if (value !== undefined) setState(value);
      }
    } catch {
      // JSON corrompu ou stockage indisponible : on garde la valeur par défaut.
    }
    setHydrated(true);
  }, [key]);

  useEffect(() => {
    if (key === null || !hydrated) return;
    try {
      const { encode } = codecRef.current;
      window.localStorage.setItem(PREFIX + key, JSON.stringify(encode ? encode(state) : state));
    } catch {
      // Quota ou stockage indisponible : l'état n'est simplement pas retenu.
    }
  }, [key, state, hydrated]);

  return [state, setState];
}
