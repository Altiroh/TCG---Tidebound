"use client";

import { useState } from "react";
import { boosterExtension } from "@/game/boosters/extensions";
import { loginBoosterName } from "@/game/progression";
import { sendAdminMail } from "@/features/mail/actions";
import {
  MAIL_BODY_MAX,
  MAIL_BOOSTER_IDS,
  MAIL_THUMBNAIL_MAX,
  MAIL_TITLE_MAX,
  normalizeMailDraft,
  type MailAudience,
  type MailBoosterGift,
  type MailDraft,
} from "@/features/mail/mailDraft";
import game from "@/features/shell/GameScreen.module.css";
import styles from "@/features/mail/Mail.module.css";
import { playButtonClick } from "@/lib/sound";

/** Côté le plus long de la miniature : assez pour le bandeau, assez léger pour la base. */
const THUMB_MAX_SIDE = 640;

function boosterName(boosterId: string): string {
  return boosterExtension(boosterId)?.name ?? loginBoosterName(boosterId);
}

/**
 * Réduit l'image choisie et la ré-encode en WebP (data URL) : la miniature
 * vit dans la ligne du courrier, sans stockage de fichiers à part.
 */
async function toThumbnail(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, THUMB_MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  for (const quality of [0.85, 0.7, 0.55, 0.4]) {
    const url = canvas.toDataURL("image/webp", quality);
    if (url.length <= MAIL_THUMBNAIL_MAX) return url;
  }
  throw new Error("Image trop lourde, même réduite.");
}

/** Un champ numérique vide vaut zéro. */
function toCount(value: string): number {
  const parsed = Number(value);
  return value.trim() === "" || !Number.isFinite(parsed) ? 0 : Math.trunc(parsed);
}

/**
 * ÉCRIRE UN COURRIER (Admin) : titre, texte, miniature facultative, et des
 * cadeaux si l'on veut — Tides, XP, boosters. À tous les joueurs, ou à soi
 * seul pour essayer un courrier avant de l'envoyer à tout le monde.
 */
export function MailComposer({ onSent }: { onSent: () => void }) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [thumbnail, setThumbnail] = useState<string | null>(null);
  const [tides, setTides] = useState("");
  const [xp, setXp] = useState("");
  const [boosters, setBoosters] = useState<MailBoosterGift[]>([]);
  const [audience, setAudience] = useState<MailAudience>("self");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<string | null>(null);

  const draft: MailDraft = { title, body, thumbnail, gifts: { tides: toCount(tides), xp: toCount(xp), boosters }, audience };

  async function pickImage(file: File | undefined) {
    setError(null);
    if (!file) return;
    try {
      setThumbnail(await toThumbnail(file));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Image illisible.");
    }
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    playButtonClick();
    setSent(null);
    const checked = normalizeMailDraft(draft);
    if (!checked.ok) {
      setError(checked.error);
      return;
    }
    if (audience === "all" && !window.confirm(`Envoyer « ${checked.draft.title} » à tous les joueurs ?`)) return;
    setBusy(true);
    setError(null);
    try {
      const result = await sendAdminMail(checked.draft);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setSent(audience === "all" ? "Courrier envoyé à tous les joueurs." : "Courrier envoyé dans votre boîte.");
      setTitle("");
      setBody("");
      setThumbnail(null);
      setTides("");
      setXp("");
      setBoosters([]);
      onSent();
    } catch {
      setError("Envoi impossible pour le moment.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className={styles.form} onSubmit={submit}>
      <label className={styles.label}>
        Titre
        <input className={game.input} value={title} maxLength={MAIL_TITLE_MAX} onChange={(event) => setTitle(event.target.value)} required />
      </label>

      <label className={styles.label}>
        Description
        <textarea className={`${game.input} ${styles.textarea}`} value={body} maxLength={MAIL_BODY_MAX} onChange={(event) => setBody(event.target.value)} />
        <span className={styles.counter}>
          {body.length} / {MAIL_BODY_MAX}
        </span>
      </label>

      <fieldset className={styles.fieldset}>
        <legend className={styles.legend}>Miniature (facultative)</legend>
        {thumbnail ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element -- aperçu en data URL */}
            <img className={styles.thumbPreview} src={thumbnail} alt="Aperçu de la miniature" />
            <div className={styles.row}>
              <button type="button" className={`${game.secondary} ${game.buttonSm}`} onClick={() => setThumbnail(null)}>
                Retirer l&apos;image
              </button>
            </div>
          </>
        ) : (
          <input type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => pickImage(event.target.files?.[0])} />
        )}
      </fieldset>

      <fieldset className={styles.fieldset}>
        <legend className={styles.legend}>Cadeaux (facultatifs)</legend>
        <div className={styles.row}>
          <label className={`${styles.label} ${styles.grow}`}>
            Tides
            <input className={`${game.input} ${styles.number}`} type="number" min={0} inputMode="numeric" value={tides} onChange={(event) => setTides(event.target.value)} />
          </label>
          <label className={`${styles.label} ${styles.grow}`}>
            XP
            <input className={`${game.input} ${styles.number}`} type="number" min={0} inputMode="numeric" value={xp} onChange={(event) => setXp(event.target.value)} />
          </label>
        </div>
        {boosters.map((entry, index) => (
          <div key={index} className={styles.row}>
            <select
              className={`${game.input} ${styles.grow}`}
              value={entry.boosterId}
              aria-label="Booster offert"
              onChange={(event) => setBoosters((list) => list.map((item, i) => (i === index ? { ...item, boosterId: event.target.value } : item)))}
            >
              {MAIL_BOOSTER_IDS.map((id) => (
                <option key={id} value={id}>
                  {boosterName(id)}
                </option>
              ))}
            </select>
            <input
              className={`${game.input} ${styles.number}`}
              type="number"
              min={1}
              aria-label="Nombre de boosters"
              value={entry.count}
              onChange={(event) => setBoosters((list) => list.map((item, i) => (i === index ? { ...item, count: toCount(event.target.value) } : item)))}
            />
            <button type="button" className={`${game.secondary} ${game.buttonSm}`} aria-label="Retirer ce booster" onClick={() => setBoosters((list) => list.filter((_, i) => i !== index))}>
              ×
            </button>
          </div>
        ))}
        <div className={styles.row}>
          <button type="button" className={`${game.secondary} ${game.buttonSm}`} onClick={() => setBoosters((list) => [...list, { boosterId: MAIL_BOOSTER_IDS[0]!, count: 1 }])}>
            + Ajouter un booster
          </button>
        </div>
      </fieldset>

      <fieldset className={styles.fieldset}>
        <legend className={styles.legend}>Destinataires</legend>
        <label className={styles.radio}>
          <input type="radio" name="audience" checked={audience === "self"} onChange={() => setAudience("self")} />
          Moi seulement (pour essayer)
        </label>
        <label className={styles.radio}>
          <input type="radio" name="audience" checked={audience === "all"} onChange={() => setAudience("all")} />
          Tous les joueurs inscrits
        </label>
      </fieldset>

      {error && <p className={styles.error}>{error}</p>}
      {sent && <p className={styles.success}>{sent}</p>}

      <div className={styles.footer}>
        <button type="submit" className={game.primary} disabled={busy}>
          {busy ? "Envoi…" : "Envoyer"}
        </button>
      </div>
    </form>
  );
}
