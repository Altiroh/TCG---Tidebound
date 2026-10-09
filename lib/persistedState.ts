"use client";

import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { getPreference, setPreference, subscribePreferences } from "@/lib/preferences";

/**
 * État d'écran MÉMORISÉ — les filtres et tris que le joueur a choisis,
 * retrouvés tels quels à son retour, où que ce soit dans l'app (demande du
 * 24/09/2026), et d'un navigateur à l'autre : ils suivent le COMPTE depuis
 * le 10/10/2026 (`lib/preferences.ts`), avec une copie sur l'appareil.
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

  // Dernière valeur écrite d'ici, sérialisée : une relecture du compte qui
  // la rapporte telle quelle ne refait pas de rendu, et l'écriture ne
  // repart pas vers le compte pour une valeur qui en vient.
  const lastWritten = useRef<string | null>(null);
  const stateRef = useRef(state);
  stateRef.current = state;

  useEffect(() => {
    if (key === null) return;
    // Rien de retenu : la valeur par défaut compte comme déjà écrite. Sinon
    // elle partirait vers le compte au montage, et écraserait le choix que
    // la relecture du compte s'apprête à rapporter.
    const { encode } = codecRef.current;
    lastWritten.current = JSON.stringify(encode ? encode(stateRef.current) : stateRef.current);
    const apply = (stored: unknown) => {
      if (stored === undefined) return;
      const value = codecRef.current.decode(stored);
      if (value === undefined) return;
      lastWritten.current = JSON.stringify(stored);
      setState(value);
    };
    apply(getPreference(PREFIX + key));
    setHydrated(true);
    // Le compte relu APRÈS le montage (premier écran de la session) : sa valeur l'emporte.
    return subscribePreferences((changed, origin) => {
      if (origin === "account" && changed === PREFIX + key) apply(getPreference(changed));
    });
  }, [key]);

  useEffect(() => {
    if (key === null || !hydrated) return;
    const { encode } = codecRef.current;
    const value = encode ? encode(state) : state;
    const serialized = JSON.stringify(value);
    if (serialized === lastWritten.current) return;
    lastWritten.current = serialized;
    setPreference(PREFIX + key, value);
  }, [key, state, hydrated]);

  return [state, setState];
}
