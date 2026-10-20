"use client";

import { useEffect, useState } from "react";
import { editionKey, editionLabel, isClassicEdition, type CardEdition } from "@/game/cosmetics/editions";
import { fetchMyShowcase, updateShowcase } from "@/features/friends/showcaseActions";
import { emptyShowcase, type Showcase } from "@/features/friends/showcaseRules";
import { ShowcaseShelf } from "@/features/friends/ShowcaseShelf";
import { socialLocked } from "@/features/friends/socialLock";
import { useDevMode } from "@/features/admin/useDevMode";
import { notifyProgressionChanged } from "@/features/progression/progressionSync";
import game from "@/features/shell/GameScreen.module.css";
import styles from "@/features/collection/card-detail/CardDetail.module.css";
import { playButtonClick } from "@/lib/sound";

interface CardDetailShowcaseProps {
  cardId: string;
  /** L'édition montrée par la fiche : c'est elle qu'on expose. */
  edition: CardEdition;
  /** Exemplaires possédés de cette édition : sans exemplaire, rien à exposer. */
  owned: number;
}

/**
 * « MA VITRINE » dans la fiche d'une carte de la Collection : c'est d'ici
 * qu'on expose une carte (le « + » de sa fiche de capitaine y mène). Les six
 * emplacements, en petit : un toucher pose l'édition montrée dans
 * l'emplacement (une même édition ne s'expose qu'une fois — elle y change de
 * place) ; « Retirer » l'en sort. Volet social réservé au mode Dev.
 */
export function CardDetailShowcase({ cardId, edition, owned }: CardDetailShowcaseProps) {
  const locked = socialLocked(useDevMode());
  const [showcase, setShowcase] = useState<Showcase | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  useEffect(() => {
    if (locked) return;
    let cancelled = false;
    fetchMyShowcase()
      .then((current) => !cancelled && setShowcase(current ?? emptyShowcase()))
      .catch(() => !cancelled && setShowcase(emptyShowcase()));
    return () => {
      cancelled = true;
    };
  }, [locked]);

  if (locked || owned < 1 || !showcase) return null;

  const key = editionKey(edition);
  const isThis = (entry: Showcase[number]) => entry !== null && entry.cardId === cardId && editionKey(entry) === key;
  const exposedAt = showcase.findIndex(isThis);

  async function save(next: Showcase, done: string) {
    setSaving(true);
    setMessage(null);
    const result = await updateShowcase(next).catch(() => ({ ok: false, error: "Le serveur est injoignable." }));
    setSaving(false);
    if (!result.ok) {
      setMessage({ tone: "error", text: result.error ?? "Échec." });
      return;
    }
    setShowcase(next);
    setMessage({ tone: "ok", text: done });
    notifyProgressionChanged();
  }

  function place(slot: number) {
    if (saving) return;
    playButtonClick();
    const next = showcase!.map((entry) => (isThis(entry) ? null : entry));
    next[slot] = { cardId, ...edition };
    void save(next, "Exposée dans ta vitrine.");
  }

  function remove() {
    playButtonClick();
    void save(
      showcase!.map((entry) => (isThis(entry) ? null : entry)),
      "Retirée de ta vitrine."
    );
  }

  return (
    <section className={styles.showcaseSection} aria-label="Ma vitrine">
      <h3 className={styles.sectionLabel}>Ma vitrine</h3>
      <p className={game.caption}>
        {exposedAt >= 0
          ? `Exposée à l'emplacement ${exposedAt + 1}. Touche un autre emplacement pour l'y déplacer.`
          : `Touche un emplacement pour y exposer ${isClassicEdition(edition) ? "cette carte" : `l'édition ${editionLabel(edition)}`}.`}
      </p>
      <ShowcaseShelf showcase={showcase} compact selectedSlot={exposedAt >= 0 ? exposedAt : null} onSelectSlot={place} emptyLabel="+" />
      {exposedAt >= 0 && (
        <button type="button" className={game.ghost} disabled={saving} onClick={remove}>
          Retirer de ma vitrine
        </button>
      )}
      {message && <p className={message.tone === "ok" ? game.success : game.error}>{message.text}</p>}
    </section>
  );
}
