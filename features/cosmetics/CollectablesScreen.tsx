"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { equipCardBack } from "@/features/progression/profileActions";
import { useCardBack } from "@/features/cosmetics/CardBackProvider";
import type { CollectablesView } from "@/features/cosmetics/collectablesService";
import { GameScreen } from "@/features/shell/GameScreen";
import browser from "@/features/collection/CardBrowser.module.css";
import game from "@/features/shell/GameScreen.module.css";
import styles from "@/features/cosmetics/Collectables.module.css";
import { playButtonClick } from "@/lib/sound";

type CollectableKind = "cardBack" | "shipFrame";

const KINDS: Array<{ id: CollectableKind; label: string; hint: string }> = [
  { id: "cardBack", label: "Dos de carte", hint: "Visible par ton adversaire dès le premier tour." },
  { id: "shipFrame", label: "Cadres de navire", hint: "Le cadre qui porte ton Navire sur le plateau." },
];

/**
 * COLLECTABLES — ce que la collection compte d'autre que des cartes.
 *
 * Même écran que les Cartes : les familles d'objets en colonne à gauche
 * (comme les filtres), la vitrine à droite. Un objet verrouillé reste
 * visible, avec le palier qui le débloque — un cosmétique qu'on ne voit pas
 * ne donne envie de rien.
 *
 * L'équipement d'un dos est appliqué à l'écran dès que le serveur a dit oui,
 * sans rechargement (`CardBackProvider`). Les cadres de navire n'ont encore
 * qu'un visuel en jeu, celui d'origine : ceux qui sont obtenus sans visuel
 * le disent.
 */
export function CollectablesScreen({ view }: { view: CollectablesView }) {
  const [kind, setKind] = useState<CollectableKind>("cardBack");
  const counts: Record<CollectableKind, { owned: number; total: number }> = {
    cardBack: { owned: view.cardBacks.options.filter((option) => option.owned).length, total: view.cardBacks.options.length },
    shipFrame: { owned: view.shipFrames.filter((frame) => frame.owned).length, total: view.shipFrames.length },
  };
  const current = KINDS.find((entry) => entry.id === kind)!;

  return (
    <GameScreen active="collectables">
      <div className={browser.workspace}>
        <aside className={`${game.panel} ${browser.sidebar}`} aria-label="Familles de collectables">
          <div className={browser.sidebarInner}>
            <section className={browser.filterSection}>
              <h2 className={browser.sectionTitle}>Collectables</h2>
              <div className={browser.filterList}>
                {KINDS.map((entry) => (
                  <button
                    key={entry.id}
                    type="button"
                    className={`${browser.filterRow} ${kind === entry.id ? browser.filterRowActive : ""}`}
                    aria-pressed={kind === entry.id}
                    onClick={() => {
                      playButtonClick();
                      setKind(entry.id);
                    }}
                  >
                    <span className={browser.filterLabel}>{entry.label}</span>
                    <span className={browser.filterCount}>
                      {view.isSignedIn ? `${counts[entry.id].owned}/${counts[entry.id].total}` : counts[entry.id].total}
                    </span>
                  </button>
                ))}
              </div>
            </section>
          </div>
        </aside>

        <main className={`${game.panel} ${browser.main}`}>
          <div className={browser.toolbar}>
            <p className={browser.count}>
              <strong>{current.label}</strong> · {current.hint}
            </p>
          </div>

          <div className={styles.showcase}>
            {!view.isSignedIn && (
              <p className={game.muted}>
                <Link href="/connexion" className={game.link} onClick={() => playButtonClick()}>
                  Connecte-toi
                </Link>{" "}
                pour équiper tes collectables : ils sont enregistrés sur ton compte.
              </p>
            )}
            {kind === "cardBack" ? <CardBackShowcase view={view} /> : <ShipFrameShowcase view={view} />}
          </div>
        </main>
      </div>
    </GameScreen>
  );
}

/** Condition de déblocage d'un objet verrouillé. */
function lockHint(unlockLevel: number | undefined, level: number): string {
  if (!unlockLevel) return "Verrouillé";
  return `Niveau ${unlockLevel}${level < unlockLevel ? ` · encore ${unlockLevel - level}` : ""}`;
}

function CardBackShowcase({ view }: { view: CollectablesView }) {
  const { id: current, apply } = useCardBack();
  const [busy, setBusy] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  // Cet écran LIT la base : le miroir local du dos équipé est réaligné sur
  // elle — un appareil neuf, ou un déblocage obtenu ailleurs, repart juste.
  useEffect(() => {
    if (view.isSignedIn) apply(view.cardBacks.equipped);
  }, [view.isSignedIn, view.cardBacks.equipped, apply]);

  function choose(id: string) {
    if (id === current || !view.isSignedIn) return;
    playButtonClick();
    setFailure(null);
    setBusy(id);
    void equipCardBack(id)
      .then((result) => {
        if (!result.ok) {
          setFailure(result.error ?? "Équipement impossible.");
          return;
        }
        apply(result.equipped ?? id);
      })
      .finally(() => setBusy(null));
  }

  return (
    <>
      <ul className={styles.grid}>
        {view.cardBacks.options.map((option) => {
          const selected = option.id === current;
          return (
            <li key={option.id}>
              <button
                type="button"
                className={styles.item}
                data-selected={selected ? "true" : undefined}
                data-locked={option.owned ? undefined : "true"}
                onClick={() => choose(option.id)}
                disabled={!option.owned || busy !== null || !view.isSignedIn}
                aria-pressed={selected}
              >
                <span className={styles.cardBackFrame}>
                  {/* eslint-disable-next-line @next/next/no-img-element -- asset local, taille pilotée par le conteneur */}
                  <img src={option.src} alt="" aria-hidden draggable={false} className={styles.cardBackImage} />
                  {selected && <span className={styles.badge}>Équipé</span>}
                </span>
                <span className={styles.itemName}>{option.label}</span>
                <span className={styles.itemText}>{option.description}</span>
                <span className={styles.itemHint}>
                  {option.owned ? (selected ? "Équipé" : busy === option.id ? "…" : "Équiper") : lockHint(option.unlockLevel, view.level)}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      {failure && <p className={game.error}>{failure}</p>}
    </>
  );
}

function ShipFrameShowcase({ view }: { view: CollectablesView }) {
  return (
    <ul className={styles.grid}>
      {view.shipFrames.map((frame) => (
        <li key={frame.id}>
          <div className={styles.item} data-selected={frame.equipped ? "true" : undefined} data-locked={frame.owned ? undefined : "true"}>
            <span className={styles.shipFrameBox}>
              {frame.src ? (
                // eslint-disable-next-line @next/next/no-img-element -- cadre réel du plateau
                <img src={frame.src} alt="" aria-hidden draggable={false} className={styles.shipFrameImage} />
              ) : (
                <span className={styles.shipFramePending}>Visuel à venir</span>
              )}
              {frame.equipped && <span className={styles.badge}>En jeu</span>}
            </span>
            <span className={styles.itemName}>{frame.label}</span>
            <span className={styles.itemText}>{frame.description}</span>
            <span className={styles.itemHint}>
              {frame.owned ? (frame.equipped ? "Cadre affiché en partie" : "Obtenu · visuel à venir") : lockHint(frame.unlockLevel, view.level)}
            </span>
          </div>
        </li>
      ))}
    </ul>
  );
}
