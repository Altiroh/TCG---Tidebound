"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getCardDefinition } from "@/game";
import { rarityForCardId } from "@/game/boosters";
import { CLASSIC_EDITION, editionKey, editionLabel, editionRank, type OwnedEdition } from "@/game/cosmetics/editions";
import { updateShowcase } from "@/features/friends/showcaseActions";
import { SHOWCASE_SIZE, type Showcase, type ShowcaseCard } from "@/features/friends/showcaseRules";
import { ShowcaseShelf, ShowcaseTile } from "@/features/friends/ShowcaseShelf";
import { GameScreen } from "@/features/shell/GameScreen";
import game from "@/features/shell/GameScreen.module.css";
import styles from "@/features/friends/Social.module.css";
import { playButtonClick } from "@/lib/sound";

/** Cartes montrées à la fois dans le choix : la recherche affine le reste. */
const MAX_CHOICES = 60;

const RARITY_ORDER = ["common", "uncommon", "rare", "epic", "legendary", "abyssal"];

interface ShowcaseEditorProps {
  initialShowcase: Showcase;
  ownedCounts: Record<string, number>;
  ownedEditions: Record<string, OwnedEdition[]>;
}

const sameCard = (a: ShowcaseCard | null, b: ShowcaseCard) => a !== null && a.cardId === b.cardId && editionKey(a) === editionKey(b);

/**
 * Composer sa VITRINE : six emplacements, chacun reçoit une carte possédée
 * dans l'une de ses éditions possédées. Les éditions les plus rares
 * viennent en tête du choix — c'est pour frimer.
 */
export function ShowcaseEditor({ initialShowcase, ownedCounts, ownedEditions }: ShowcaseEditorProps) {
  const router = useRouter();
  const [showcase, setShowcase] = useState<Showcase>(initialShowcase);
  const [selected, setSelected] = useState<number>(() => Math.max(0, initialShowcase.findIndex((card) => card === null)));
  const [query, setQuery] = useState("");
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [saving, startSaving] = useTransition();
  const dirty = JSON.stringify(showcase) !== JSON.stringify(initialShowcase);

  /** Toutes les éditions possédées, la plus rare d'abord. */
  const choices = useMemo(() => {
    const all: ShowcaseCard[] = [];
    for (const cardId of Object.keys(ownedCounts)) {
      if ((ownedCounts[cardId] ?? 0) < 1) continue;
      all.push({ cardId, ...CLASSIC_EDITION });
      for (const edition of ownedEditions[cardId] ?? []) all.push({ cardId, artwork: edition.artwork, finish: edition.finish });
    }
    const rarity = (id: string) => RARITY_ORDER.indexOf(rarityForCardId(id) ?? "common");
    return all
      .filter((card) => {
        try {
          getCardDefinition(card.cardId);
          return true;
        } catch {
          return false;
        }
      })
      .sort(
        (a, b) =>
          editionRank(b) - editionRank(a) ||
          rarity(b.cardId) - rarity(a.cardId) ||
          getCardDefinition(a.cardId).name.localeCompare(getCardDefinition(b.cardId).name, "fr")
      );
  }, [ownedCounts, ownedEditions]);

  const needle = query.trim().toLocaleLowerCase("fr");
  const shown = (needle ? choices.filter((card) => getCardDefinition(card.cardId).name.toLocaleLowerCase("fr").includes(needle)) : choices).slice(0, MAX_CHOICES);

  function place(card: ShowcaseCard) {
    playButtonClick();
    setMessage(null);
    // Déjà exposée ailleurs : elle change d'emplacement plutôt que d'apparaître deux fois.
    const next = showcase.map((entry) => (sameCard(entry, card) ? null : entry));
    next[selected] = card;
    setShowcase(next);
    const nextEmpty = next.findIndex((entry, slot) => entry === null && slot !== selected);
    if (nextEmpty >= 0) setSelected(nextEmpty);
  }

  function clearSlot() {
    playButtonClick();
    setShowcase((current) => current.map((entry, slot) => (slot === selected ? null : entry)));
  }

  function save() {
    playButtonClick();
    setMessage(null);
    startSaving(async () => {
      const result = await updateShowcase(showcase).catch(() => ({ ok: false, error: "Le serveur est injoignable." }));
      setMessage(result.ok ? { tone: "ok", text: "Vitrine enregistrée : tes amis et tes adversaires la verront." } : { tone: "error", text: result.error ?? "Échec." });
      if (result.ok) router.refresh();
    });
  }

  return (
    <GameScreen active="amis">
      <div className={game.content}>
        <div className={`${game.contentInner} ${styles.column}`}>
          <div className={game.pageHead}>
            <div>
              <p className={game.eyebrow}>Pour frimer</p>
              <h1 className={game.title}>Ma vitrine</h1>
            </div>
            <Link href="/amis" className={game.secondary} onClick={() => playButtonClick()}>
              ← Mes amis
            </Link>
          </div>

          <section className={`${game.panel} ${styles.section}`} aria-label="Vitrine">
            <p className={game.muted}>
              Six cartes de ta collection, dans l&apos;édition de ton choix. Tes amis les voient sur ta fiche, et ton adversaire les découvre avant chaque
              partie en ligne.
            </p>
            <ShowcaseShelf showcase={showcase} selectedSlot={selected} onSelectSlot={setSelected} emptyLabel="Choisir" />
            <div className={styles.row}>
              <span className={game.caption}>
                Emplacement {selected + 1} sur {SHOWCASE_SIZE} sélectionné : choisis une carte ci-dessous.
              </span>
              <span className={game.bannerActions}>
                <button type="button" className={game.ghost} disabled={!showcase[selected]} onClick={clearSlot}>
                  Retirer
                </button>
                <button type="button" className={game.primary} disabled={!dirty || saving} onClick={save}>
                  {saving ? "Enregistrement…" : "Enregistrer"}
                </button>
              </span>
            </div>
            {message && <p className={message.tone === "ok" ? game.success : game.error}>{message.text}</p>}
          </section>

          <section className={`${game.panel} ${styles.section}`} aria-label="Ta collection">
            <div className={styles.row}>
              <h2 className={game.sectionTitle}>Ta collection</h2>
              <input
                className={`${game.input} ${styles.search}`}
                style={{ maxWidth: 280 }}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Rechercher une carte"
                aria-label="Rechercher une carte"
              />
            </div>
            {shown.length === 0 ? (
              <p className={game.muted}>{choices.length === 0 ? "Ta collection est vide pour l'instant." : "Aucune carte ne correspond."}</p>
            ) : (
              <div className={styles.editionGrid}>
                {shown.map((card) => (
                  <div key={`${card.cardId}|${editionKey(card)}`} className={styles.slot}>
                    <ShowcaseTile card={card} onClick={() => place(card)} />
                    <span className={styles.slotLabel}>{editionLabel(card)}</span>
                  </div>
                ))}
              </div>
            )}
            {choices.length > shown.length && !needle && <p className={game.caption}>Les {MAX_CHOICES} plus rares sont affichées : cherche une carte par son nom pour les autres.</p>}
          </section>
        </div>
      </div>
    </GameScreen>
  );
}
