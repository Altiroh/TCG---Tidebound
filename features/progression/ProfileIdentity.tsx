"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { getCardDefinition } from "@/game";
import { cardIllustrationUrl } from "@/features/decks/nameplateArt";
import { updateProfileIdentity } from "@/features/progression/profileActions";
import { notifyProgressionChanged } from "@/features/progression/progressionSync";
import game from "@/features/shell/GameScreen.module.css";
import styles from "@/features/progression/ProfileIdentity.module.css";
import { playButtonClick } from "@/lib/sound";

interface ProfileIdentityProps {
  displayName: string | null;
  avatarCardId: string | null;
  /** Après une modification acceptée. Par défaut : relecture de la page. */
  onChanged?: () => void;
  /** Ouvre le choix d'illustration, dans la partie droite du profil (`IllustrationPicker`). */
  onPickIllustration: () => void;
  /** Titre porté, en toutes lettres, ou `null`. */
  titleName?: string | null;
  /** Ouvre le choix du titre (`TitlePicker`). Absent : pas de ligne de titre. */
  onPickTitle?: () => void;
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
 * Tête du Profil : l'illustration À CÔTÉ du pseudo, sans cadre — un
 * portrait, pas une enseigne. Toucher l'illustration la change, le crayon
 * change le pseudo.
 *
 * L'illustration est une carte QU'ON POSSÈDE — c'est un trophée, pas un
 * réglage : elle raconte ce qu'on a ouvert. Le sélecteur ne montre donc que
 * la collection réelle, et le serveur revérifie la possession
 * (`set_profile_identity`) : le navigateur ne peut pas s'attribuer une
 * carte qu'il n'a pas.
 */
export function ProfileIdentity({ displayName, avatarCardId, onChanged, onPickIllustration, titleName = null, onPickTitle }: ProfileIdentityProps) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [draftName, setDraftName] = useState(displayName ?? "");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

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
      // Le bandeau porte le pseudo et l'avatar sur TOUS les écrans : il relit.
      notifyProgressionChanged();
      if (onChanged) onChanged();
      else router.refresh();
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

  const initial = (displayName?.trim()?.[0] ?? "?").toUpperCase();

  return (
    <>
      <div className={styles.identity}>
        <button
          type="button"
          className={styles.avatar}
          style={avatarCardId ? { backgroundImage: `url("${cardIllustrationUrl(avatarCardId)}")` } : undefined}
          onClick={() => {
            playButtonClick();
            setError(null);
            onPickIllustration();
          }}
          aria-label={avatarCardId ? `Illustration : ${cardName(avatarCardId)} — changer` : "Choisir une illustration"}
          title={avatarCardId ? `${cardName(avatarCardId)} — changer d'illustration` : "Choisir une illustration"}
        >
          {!avatarCardId && <span className={styles.avatarInitial}>{initial}</span>}
          <span className={styles.avatarEdit} aria-hidden>
            <svg viewBox="0 0 24 24" width="11" height="11" fill="none">
              <path d="M4 20h4L19 9a2.1 2.1 0 0 0-3-3L5 17v3z" stroke="currentColor" strokeWidth={2} strokeLinejoin="round" />
            </svg>
          </span>
        </button>

        <div className={styles.identityText}>
          <p className={styles.eyebrow}>Carnet de bord</p>
          {editing ? (
            <div className={styles.nameEdit}>
              <input
                value={draftName}
                onChange={(event) => setDraftName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") saveName();
                  if (event.key === "Escape") {
                    event.stopPropagation();
                    setDraftName(displayName ?? "");
                    setEditing(false);
                  }
                }}
                aria-label="Pseudo"
                className={styles.nameInput}
                maxLength={24}
                autoFocus
              />
              <button type="button" className={styles.nameSave} onClick={saveName} disabled={isPending} aria-label="Valider le pseudo">
                {isPending ? "…" : "✓"}
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
                <svg viewBox="0 0 24 24" width="13" height="13" fill="none" aria-hidden>
                  <path d="M4 20h4L19 9a2.1 2.1 0 0 0-3-3L5 17v3z" stroke="currentColor" strokeWidth={1.8} strokeLinejoin="round" />
                </svg>
              </button>
            </div>
          )}
          {/* Le titre, sous le nom : le toucher ouvre le choix. */}
          {onPickTitle && (
            <button
              type="button"
              className={titleName ? styles.titleLine : styles.titleLineEmpty}
              onClick={() => {
                playButtonClick();
                setError(null);
                onPickTitle();
              }}
              aria-label={titleName ? `Titre : ${titleName} — changer` : "Choisir un titre"}
              title={titleName ? "Changer de titre" : "Choisir un titre"}
            >
              <span className={styles.titleText}>{titleName ?? "Choisir un titre"}</span>
              <svg viewBox="0 0 24 24" width="11" height="11" fill="none" aria-hidden>
                <path d="M4 20h4L19 9a2.1 2.1 0 0 0-3-3L5 17v3z" stroke="currentColor" strokeWidth={2} strokeLinejoin="round" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {error && <p className={game.error}>{error}</p>}

    </>
  );
}
