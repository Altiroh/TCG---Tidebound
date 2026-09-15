"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { getCardDefinition } from "@/game";
import { cardIllustrationUrl, plateArtUrl } from "@/features/decks/nameplateArt";
import { updateProfileIdentity } from "@/features/progression/profileActions";
import { DEFAULT_SHIP_ID } from "@/features/decks/constants";
import { ArtPlate } from "@/features/shell/ArtPlate";
import { Dialog } from "@/features/shell/Dialog";
import game from "@/features/shell/GameScreen.module.css";
import styles from "@/features/progression/ProfileIdentity.module.css";
import { playButtonClick } from "@/lib/sound";

interface ProfileIdentityProps {
  displayName: string | null;
  avatarCardId: string | null;
  /** Cartes possédées — les seules proposées comme illustration. */
  ownedCardIds: readonly string[];
}

/** Nom lisible d'une carte, son identifiant à défaut — jamais d'exception à l'affichage. */
function cardName(cardId: string): string {
  try {
    return getCardDefinition(cardId).name;
  } catch {
    return cardId;
  }
}

/**
 * Tête du Profil : l'illustration, le pseudo, et de quoi changer les deux.
 *
 * L'illustration est une carte QU'ON POSSÈDE — c'est un trophée, pas un
 * réglage : elle raconte ce qu'on a ouvert. Le sélecteur ne montre donc que
 * la collection réelle, et le serveur revérifie la possession
 * (`set_profile_identity`) : le navigateur ne peut pas s'attribuer une
 * carte qu'il n'a pas.
 *
 * Même plaque que les decks (`ArtPlate`) : le joueur et ses decks se
 * présentent de la même façon, ce qui était tout l'objet de l'uniformisation.
 */
export function ProfileIdentity({ displayName, avatarCardId, ownedCardIds }: ProfileIdentityProps) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [picking, setPicking] = useState(false);
  const [draftName, setDraftName] = useState(displayName ?? "");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // Triées par nom : dans une collection de plusieurs dizaines de cartes,
  // l'ordre d'obtention ne veut plus rien dire.
  const options = useMemo(
    () => [...new Set(ownedCardIds)].map((cardId) => ({ cardId, name: cardName(cardId) })).sort((a, b) => a.name.localeCompare(b.name, "fr")),
    [ownedCardIds]
  );

  /** Une seule porte vers le serveur : les deux champs passent par là. */
  function commit(patch: { displayName?: string; avatarCardId?: string | null }, onDone?: () => void) {
    setError(null);
    startTransition(async () => {
      const result = await updateProfileIdentity(patch);
      if (!result.ok) {
        setError(result.error ?? "Modification impossible.");
        return;
      }
      onDone?.();
      router.refresh();
    });
  }

  function saveName() {
    playButtonClick();
    const trimmed = draftName.trim();
    // Rien n'a changé : inutile d'écrire, et la fermeture est immédiate.
    if (trimmed === (displayName ?? "")) {
      setEditing(false);
      return;
    }
    commit({ displayName: trimmed }, () => setEditing(false));
  }

  return (
    <>
      <ArtPlate artUrl={plateArtUrl(avatarCardId, DEFAULT_SHIP_ID)} className={styles.plate}>
        <p className={styles.eyebrow}>Carnet de bord</p>

        {editing ? (
          <div className={styles.nameEdit}>
            <input
              value={draftName}
              onChange={(event) => setDraftName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") saveName();
                if (event.key === "Escape") {
                  setDraftName(displayName ?? "");
                  setEditing(false);
                }
              }}
              aria-label="Pseudo"
              className={styles.nameInput}
              maxLength={24}
              autoFocus
            />
            <button type="button" className={game.primary} onClick={saveName} disabled={isPending}>
              {isPending ? "…" : "Valider"}
            </button>
            <button
              type="button"
              className={game.link}
              onClick={() => {
                setDraftName(displayName ?? "");
                setEditing(false);
                setError(null);
              }}
            >
              Annuler
            </button>
          </div>
        ) : (
          <div className={styles.nameRow}>
            <h1 className={styles.name}>{displayName ?? "Marin"}</h1>
            <button
              type="button"
              className={styles.pencil}
              onClick={() => {
                playButtonClick();
                setDraftName(displayName ?? "");
                setEditing(true);
              }}
              aria-label="Changer de pseudo"
              title="Changer de pseudo"
            >
              <svg viewBox="0 0 24 24" width="15" height="15" fill="none" aria-hidden>
                <path
                  d="M4 20h4L19 9a2.1 2.1 0 0 0-3-3L5 17v3z"
                  stroke="currentColor"
                  strokeWidth={1.8}
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          </div>
        )}

        <button
          type="button"
          className={styles.artLink}
          onClick={() => {
            playButtonClick();
            setError(null);
            setPicking(true);
          }}
        >
          {avatarCardId ? `Illustration : ${cardName(avatarCardId)}` : "Choisir une illustration"}
        </button>
      </ArtPlate>

      {error && <p className={game.error}>{error}</p>}

      {picking && (
        <Dialog
          title="Ton illustration de profil"
          width={820}
          onClose={() => setPicking(false)}
          actions={
            <>
              <button type="button" className={game.secondary} onClick={() => setPicking(false)}>
                Fermer
              </button>
              {avatarCardId && (
                <button
                  type="button"
                  className={game.link}
                  onClick={() => commit({ avatarCardId: null }, () => setPicking(false))}
                  disabled={isPending}
                >
                  Retirer l&apos;illustration
                </button>
              )}
            </>
          }
        >
          {options.length === 0 ? (
            <p className={game.muted}>
              Tu n&apos;as encore aucune carte. Ouvre un booster : chaque carte obtenue devient une illustration possible.
            </p>
          ) : (
            <div className={styles.picker}>
              {options.map(({ cardId, name }) => (
                <button
                  key={cardId}
                  type="button"
                  className={`${styles.option} ${cardId === avatarCardId ? styles.optionActive : ""}`}
                  onClick={() => commit({ avatarCardId: cardId }, () => setPicking(false))}
                  disabled={isPending}
                  title={name}
                >
                  <span className={styles.optionArt} style={{ backgroundImage: `url("${cardIllustrationUrl(cardId)}")` }} aria-hidden />
                  <span className={styles.optionName}>{name}</span>
                </button>
              ))}
            </div>
          )}
        </Dialog>
      )}
    </>
  );
}
