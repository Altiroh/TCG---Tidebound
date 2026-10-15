"use client";

import { useMemo, useState } from "react";
import { CORE_SET } from "@/game/cards/sets/core";
import { boosterExtension } from "@/game/boosters/extensions";
import { loginBoosterName } from "@/game/progression";
import { getBoosterPackVisual } from "@/features/boosters/opening/boosterPackVisuals";
import { cardIllustrationThumbUrl } from "@/features/decks/cardArtUrl";
import { sendAdminMail } from "@/features/mail/actions";
import {
  MAIL_BODY_MAX,
  MAIL_BOOSTER_IDS,
  MAIL_BOOSTER_MAX,
  MAIL_TITLE_MAX,
  cardThumbnail,
  normalizeMailDraft,
  thumbnailCardId,
  type MailAudience,
  type MailDraft,
} from "@/features/mail/mailDraft";
import { Dialog } from "@/features/shell/Dialog";
import { ScrollArea } from "@/features/shell/ScrollArea";
import game from "@/features/shell/GameScreen.module.css";
import styles from "@/features/mail/Mail.module.css";
import { playButtonClick } from "@/lib/sound";

/** Illustrations montrées à la fois dans le sélecteur : la recherche affine le reste. */
const ILLUSTRATIONS_SHOWN = 48;

function boosterName(boosterId: string): string {
  return boosterExtension(boosterId)?.name ?? loginBoosterName(boosterId);
}

/** Insensible aux accents et à la casse. */
function normalize(value: string): string {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/** Un champ numérique vide vaut zéro. */
function toCount(value: string): number {
  const parsed = Number(value);
  return value.trim() === "" || !Number.isFinite(parsed) ? 0 : Math.max(0, Math.trunc(parsed));
}

/** Les cartes à illustration, triées par nom (les jetons n'en sont pas). */
const ILLUSTRATED_CARDS = CORE_SET.filter((card) => !card.token)
  .map((card) => ({ id: card.id, name: card.name }))
  .sort((a, b) => a.name.localeCompare(b.name, "fr"));

/**
 * ÉCRIRE UN COURRIER (Admin) : titre, texte, une illustration du jeu en
 * miniature si l'on veut, et des cadeaux — Tides, XP, boosters (choisis sur
 * leur visuel). À soi seul pour essayer, ou à tous les joueurs, après
 * confirmation dans le bandeau noir.
 */
export function MailComposer({ onSent }: { onSent: () => void }) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [thumbnail, setThumbnail] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const [query, setQuery] = useState("");
  const [tides, setTides] = useState("");
  const [xp, setXp] = useState("");
  const [boosters, setBoosters] = useState<Record<string, number>>({});
  const [audience, setAudience] = useState<MailAudience>("self");
  const [confirming, setConfirming] = useState<MailDraft | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<string | null>(null);

  const draft: MailDraft = {
    title,
    body,
    thumbnail,
    gifts: {
      tides: toCount(tides),
      xp: toCount(xp),
      boosters: Object.entries(boosters).map(([boosterId, count]) => ({ boosterId, count })),
    },
    audience,
  };

  const shownCards = useMemo(() => {
    const needle = normalize(query.trim());
    return (needle ? ILLUSTRATED_CARDS.filter((card) => normalize(card.name).includes(needle)) : ILLUSTRATED_CARDS).slice(0, ILLUSTRATIONS_SHOWN);
  }, [query]);
  const pickedCardId = thumbnailCardId(thumbnail);
  const pickedName = pickedCardId ? ILLUSTRATED_CARDS.find((card) => card.id === pickedCardId)?.name : null;

  function setBoosterCount(boosterId: string, count: number) {
    setBoosters((current) => {
      const next = { ...current };
      const clamped = Math.min(MAIL_BOOSTER_MAX, Math.max(0, count));
      if (clamped > 0) next[boosterId] = clamped;
      else delete next[boosterId];
      return next;
    });
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    playButtonClick();
    setSent(null);
    const checked = normalizeMailDraft(draft);
    if (!checked.ok) {
      setError(checked.error);
      return;
    }
    setError(null);
    // À tous : on confirme dans le bandeau noir ; à soi seul, on envoie.
    if (checked.draft.audience === "all") setConfirming(checked.draft);
    else void send(checked.draft);
  }

  async function send(checked: MailDraft) {
    setConfirming(null);
    setBusy(true);
    try {
      const result = await sendAdminMail(checked);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setSent(checked.audience === "all" ? "Courrier envoyé à tous les joueurs." : "Courrier envoyé dans votre boîte.");
      setTitle("");
      setBody("");
      setThumbnail(null);
      setTides("");
      setXp("");
      setBoosters({});
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
        <input className={styles.input} value={title} maxLength={MAIL_TITLE_MAX} placeholder="Ex. : Bienvenue à bord !" onChange={(event) => setTitle(event.target.value)} required />
      </label>

      <label className={styles.label}>
        Description
        <textarea
          className={`${styles.input} ${styles.textarea}`}
          value={body}
          maxLength={MAIL_BODY_MAX}
          placeholder="Le message que liront les joueurs."
          onChange={(event) => setBody(event.target.value)}
        />
        <span className={styles.counter}>
          {body.length} / {MAIL_BODY_MAX}
        </span>
      </label>

      <fieldset className={styles.fieldset}>
        <legend className={styles.legend}>Miniature (facultative)</legend>
        {pickedCardId && (
          <div className={styles.thumbChosen}>
            {/* eslint-disable-next-line @next/next/no-img-element -- illustration locale */}
            <img className={styles.thumbPreview} src={cardIllustrationThumbUrl(pickedCardId)} alt="" />
            <span className={styles.thumbName}>{pickedName}</span>
            <button type="button" className={`${game.secondary} ${game.buttonSm}`} onClick={() => setThumbnail(null)}>
              Retirer
            </button>
          </div>
        )}
        {picking ? (
          <>
            <input className={styles.input} value={query} placeholder="Chercher une carte…" autoFocus onChange={(event) => setQuery(event.target.value)} />
            <ScrollArea style={{ maxHeight: 260 }}>
            <ul className={styles.artGrid} aria-label="Illustrations">
              {shownCards.map((card) => (
                <li key={card.id}>
                  <button
                    type="button"
                    className={styles.artTile}
                    aria-pressed={card.id === pickedCardId}
                    title={card.name}
                    onClick={() => {
                      playButtonClick();
                      setThumbnail(cardThumbnail(card.id));
                      setPicking(false);
                    }}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element -- illustration locale */}
                    <img src={cardIllustrationThumbUrl(card.id)} alt={card.name} loading="lazy" draggable={false} />
                  </button>
                </li>
              ))}
            </ul>
            </ScrollArea>
            {shownCards.length === 0 && <p className={styles.itemMeta}>Aucune carte ne porte ce nom.</p>}
            <div className={styles.row}>
              <button type="button" className={`${game.secondary} ${game.buttonSm}`} onClick={() => setPicking(false)}>
                Fermer
              </button>
            </div>
          </>
        ) : (
          <div className={styles.row}>
            <button type="button" className={`${game.secondary} ${game.buttonSm}`} onClick={() => setPicking(true)}>
              {pickedCardId ? "Changer d'illustration" : "Choisir une illustration"}
            </button>
          </div>
        )}
      </fieldset>

      <fieldset className={styles.fieldset}>
        <legend className={styles.legend}>Cadeaux (facultatifs)</legend>
        <div className={styles.row}>
          <label className={`${styles.label} ${styles.grow}`}>
            Tides
            <input className={styles.input} type="number" min={0} inputMode="numeric" placeholder="0" value={tides} onChange={(event) => setTides(event.target.value)} />
          </label>
          <label className={`${styles.label} ${styles.grow}`}>
            XP
            <input className={styles.input} type="number" min={0} inputMode="numeric" placeholder="0" value={xp} onChange={(event) => setXp(event.target.value)} />
          </label>
        </div>
        <span className={styles.label}>Boosters</span>
        <ul className={styles.packGrid}>
          {MAIL_BOOSTER_IDS.map((boosterId) => {
            const count = boosters[boosterId] ?? 0;
            const name = boosterName(boosterId);
            return (
              <li key={boosterId} className={styles.pack} data-picked={count > 0 || undefined}>
                <button type="button" className={styles.packArt} title={name} aria-label={`Ajouter un booster ${name}`} onClick={() => setBoosterCount(boosterId, count + 1)}>
                  {/* eslint-disable-next-line @next/next/no-img-element -- sachet local */}
                  <img src={getBoosterPackVisual(boosterId).assets.closed} alt="" draggable={false} />
                </button>
                <span className={styles.packName}>{name}</span>
                <span className={styles.stepper}>
                  <button type="button" aria-label={`Un booster ${name} de moins`} disabled={count === 0} onClick={() => setBoosterCount(boosterId, count - 1)}>
                    −
                  </button>
                  <b>{count}</b>
                  <button type="button" aria-label={`Un booster ${name} de plus`} disabled={count >= MAIL_BOOSTER_MAX} onClick={() => setBoosterCount(boosterId, count + 1)}>
                    +
                  </button>
                </span>
              </li>
            );
          })}
        </ul>
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

      {confirming && (
        // Le bandeau se ferme seul : son voile ne doit pas fermer aussi le panneau.
        <div data-mail-confirm onClick={(event) => event.stopPropagation()} role="presentation">
          <Dialog
            title="Envoyer à tous les joueurs ?"
            description={`« ${confirming.title} » arrivera dans la boîte de chaque joueur inscrit. Un courrier envoyé ne se reprend pas.`}
            variant="banner"
            onClose={() => setConfirming(null)}
            actions={
              <>
                <button type="button" className={game.secondary} onClick={() => setConfirming(null)}>
                  Annuler
                </button>
                <button type="button" className={game.primary} onClick={() => void send(confirming)}>
                  Envoyer à tous
                </button>
              </>
            }
          />
        </div>
      )}
    </form>
  );
}
