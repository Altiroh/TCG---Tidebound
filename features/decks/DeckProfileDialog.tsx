"use client";

import { useState } from "react";
import { DECK_STYLES, deckProfile, type DeckStyleId } from "@/game";
import { Dialog } from "@/features/shell/Dialog";
import type { BrowserDeck } from "@/features/decks/deckEntries";
import game from "@/features/shell/GameScreen.module.css";
import styles from "@/features/decks/DecksList.module.css";

export interface DeckProfileDraft {
  styleId: DeckStyleId | null;
  difficulty: number | null;
  mechanics: string[] | null;
}

interface DeckProfileDialogProps {
  deck: BrowserDeck;
  busy: boolean;
  onSubmit: (draft: DeckProfileDraft) => void;
  onCancel: () => void;
}

const AUTO = "auto";

/**
 * MODIFIER LE PROFIL D'UN DECK — son type de jeu, sa difficulté, ses
 * mécaniques.
 *
 * Les trois sont DÉDUITS des cartes par défaut, et c'est très bien la
 * plupart du temps : rien à saisir, et un deck qui change de composition
 * voit son profil suivre. Mais une courbe basse ressemble à de l'agression
 * même quand on a monté un combo — la déduction ne lit que ce qui est
 * imprimé, pas l'intention.
 *
 * Chaque champ garde donc son « Laisser le jeu deviner », et c'est le
 * réglage de départ : écrire une valeur la FIGE, l'effacer rend la main.
 * Le type passe par une liste fermée (`DECK_STYLES`, la même en base) — du
 * texte libre, et « aggro » ne se retrouverait jamais avec « Agressif »
 * dans le filtre de gauche.
 */
export function DeckProfileDialog({ deck, busy, onSubmit, onCancel }: DeckProfileDialogProps) {
  const chosen = deck.mine?.profile ?? { styleId: null, difficulty: null, mechanics: null };
  const deduced = deckProfile(expand(deck));

  const [styleId, setStyleId] = useState<DeckStyleId | typeof AUTO>(chosen.styleId ?? AUTO);
  const [difficulty, setDifficulty] = useState<string>(chosen.difficulty === null ? AUTO : String(chosen.difficulty));
  const [customMechanics, setCustomMechanics] = useState(chosen.mechanics !== null);
  const [mechanics, setMechanics] = useState((chosen.mechanics ?? deduced?.mechanics ?? []).join(", "));

  const formId = `profil-${deck.id}`;

  function submit() {
    onSubmit({
      styleId: styleId === AUTO ? null : styleId,
      difficulty: difficulty === AUTO ? null : Number(difficulty),
      mechanics: customMechanics ? mechanics.split(",").map((entry) => entry.trim()) : null,
    });
  }

  return (
    <Dialog
      title="Profil du deck"
      onClose={onCancel}
      actions={
        <>
          <button type="button" className={game.secondary} onClick={onCancel}>
            Annuler
          </button>
          <button type="submit" form={formId} className={game.primary} disabled={busy}>
            Enregistrer
          </button>
        </>
      }
    >
      <form
        id={formId}
        className={styles.profileForm}
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <p className={game.muted}>
          Sans rien toucher, le jeu lit ces trois lignes dans tes cartes et les tient à jour tout seul. Ce que tu écris ici prend le pas sur
          lui, et ne bouge plus.
        </p>

        <div className={game.field}>
          <label className={game.fieldLabel} htmlFor={`${formId}-style`}>
            Type de jeu
          </label>
          <select
            id={`${formId}-style`}
            className={game.select}
            value={styleId}
            onChange={(event) => setStyleId(event.target.value as DeckStyleId | typeof AUTO)}
          >
            <option value={AUTO}>Laisser le jeu deviner{deduced ? ` — ${deduced.style}` : ""}</option>
            {DECK_STYLES.map((style) => (
              <option key={style.id} value={style.id}>
                {style.label}
              </option>
            ))}
          </select>
          <p className={game.fieldHint}>
            {styleId === AUTO ? "Lu dans la courbe de coût de tes cartes." : DECK_STYLES.find((style) => style.id === styleId)?.hint}
          </p>
        </div>

        <div className={game.field}>
          <label className={game.fieldLabel} htmlFor={`${formId}-difficulty`}>
            Difficulté
          </label>
          <select
            id={`${formId}-difficulty`}
            className={game.select}
            value={difficulty}
            onChange={(event) => setDifficulty(event.target.value)}
          >
            <option value={AUTO}>Laisser le jeu deviner{deduced ? ` — ${deduced.difficulty} / 5` : ""}</option>
            {[1, 2, 3, 4, 5].map((value) => (
              <option key={value} value={value}>
                {value} / 5
              </option>
            ))}
          </select>
          <p className={game.fieldHint}>Ce que le deck demande de SUIVRE en partie, pas sa puissance.</p>
        </div>

        <div className={game.field}>
          <label className={`${game.choice}`}>
            <input
              type="checkbox"
              className={game.choiceInput}
              checked={!customMechanics}
              onChange={(event) => setCustomMechanics(!event.target.checked)}
            />
            <span className={game.choiceBox} aria-hidden />
            Laisser le jeu deviner les mécaniques
          </label>
          {customMechanics && (
            <>
              <input
                className={game.input}
                value={mechanics}
                onChange={(event) => setMechanics(event.target.value)}
                placeholder="Garde, Sabordage, Manipulation de Marée"
                maxLength={180}
                aria-label="Mécaniques du deck"
              />
              <p className={game.fieldHint}>Séparées par des virgules, quatre au plus — ce sont des étiquettes, pas une description.</p>
            </>
          )}
        </div>
      </form>
    </Dialog>
  );
}

/** Un exemplaire par carte : `deckProfile` compte les cartes, pas les lignes. */
function expand(deck: BrowserDeck): string[] {
  const list: string[] = [];
  for (const card of deck.cards) for (let i = 0; i < card.quantity; i += 1) list.push(card.cardId);
  return list;
}
