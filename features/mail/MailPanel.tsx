"use client";

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { loginRewardLabel } from "@/game/progression";
import { claimMailGift, fetchInbox, openMail } from "@/features/mail/actions";
import { hasGifts, mailGiftItems, thumbnailCardId, type InboxMail } from "@/features/mail/mailDraft";
import { cardIllustrationThumbUrl, cardIllustrationUrl } from "@/features/decks/cardArtUrl";
import { MailComposer } from "@/features/mail/MailComposer";
import { RewardIcon } from "@/features/progression/RewardIcon";
import { RewardReveal } from "@/features/progression/RewardReveal";
import { notifyProgressionChanged } from "@/features/progression/progressionSync";
import { Dialog } from "@/features/shell/Dialog";
import { ScrollArea } from "@/features/shell/ScrollArea";
import side from "@/features/shell/SidePanel.module.css";
import game from "@/features/shell/GameScreen.module.css";
import styles from "@/features/mail/Mail.module.css";
import { playButtonClick } from "@/lib/sound";

const ENVELOPE_CLOSED = "/assets/ui/icons/enveloppe-fermee.webp";
const ENVELOPE_OPEN = "/assets/ui/icons/enveloppe-ouverte.webp";

/** Miniature d'un courrier : l'illustration de la carte choisie (ou l'image encodée d'un ancien courrier). */
function thumbnailSrc(thumbnail: string, size: "mini" | "full"): string {
  const cardId = thumbnailCardId(thumbnail);
  if (!cardId) return thumbnail;
  return size === "mini" ? cardIllustrationThumbUrl(cardId) : cardIllustrationUrl(cardId);
}

const dateFormat = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

/**
 * COURRIER DE BORD — le panneau qu'ouvre l'enveloppe du bandeau : la boîte
 * de réception (liste des courriers reçus), et pour un Admin l'onglet
 * « Écrire ». Un courrier s'ouvre dans le bandeau noir du `Dialog` ; ses
 * cadeaux se réclament de là, et surgissent dans la révélation commune.
 */
export function MailPanel({ isAdmin, onClose }: { isAdmin: boolean; onClose: () => void }) {
  const [mounted, setMounted] = useState(false);
  const [tab, setTab] = useState<"inbox" | "write">("inbox");
  const [mails, setMails] = useState<InboxMail[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [claiming, setClaiming] = useState(false);
  const [claimError, setClaimError] = useState<string | null>(null);
  const [reveal, setReveal] = useState<InboxMail | null>(null);
  const opened = mails?.find((mail) => mail.id === openId) ?? null;

  const load = useCallback(() => {
    fetchInbox()
      .then((result) => {
        if (result.ok) {
          setMails(result.mails);
          setLoadError(null);
        } else setLoadError(result.error);
      })
      .catch(() => setLoadError("Courrier indisponible pour le moment."));
  }, []);

  useEffect(() => {
    setMounted(true);
    load();
  }, [load]);

  // Échap ferme le courrier ouvert d'abord (le `Dialog` s'en charge), le panneau ensuite.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !openId && !reveal && !document.querySelector("[data-mail-confirm]")) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, openId, reveal]);

  function open(mail: InboxMail) {
    playButtonClick();
    setClaimError(null);
    setOpenId(mail.id);
    if (!mail.read) {
      setMails((current) => current?.map((entry) => (entry.id === mail.id ? { ...entry, read: true } : entry)) ?? current);
      // L'enveloppe du bandeau relit son compteur une fois la lecture notée.
      openMail(mail.id).then(() => notifyProgressionChanged());
    }
  }

  async function claim(mail: InboxMail) {
    playButtonClick();
    setClaiming(true);
    setClaimError(null);
    try {
      const result = await claimMailGift(mail.id);
      if (!result.ok) {
        setClaimError(result.error);
        return;
      }
      setMails((current) => current?.map((entry) => (entry.id === mail.id ? { ...entry, claimed: true } : entry)) ?? current);
      setOpenId(null);
      setReveal(mail);
      notifyProgressionChanged();
    } catch {
      setClaimError("Réclamation impossible pour le moment.");
    } finally {
      setClaiming(false);
    }
  }

  if (!mounted) return null;

  const unread = mails?.filter((mail) => !mail.read).length ?? 0;

  return createPortal(
    <div className={side.veil} onClick={onClose} role="presentation">
      <div className={side.panel} role="dialog" aria-modal aria-label="Courrier" onClick={(event) => event.stopPropagation()}>
        <header className={side.head}>
          {/* eslint-disable-next-line @next/next/no-img-element -- icône locale */}
          <img className={side.headIcon} src={unread > 0 ? ENVELOPE_CLOSED : ENVELOPE_OPEN} alt="" draggable={false} />
          <h2 className={side.title}>Courrier</h2>
          <button type="button" className={side.close} onClick={onClose} aria-label="Fermer">
            ×
          </button>
        </header>

        {isAdmin && (
          <div className={styles.tabs} role="tablist">
            <button type="button" role="tab" className={styles.tab} aria-selected={tab === "inbox"} onClick={() => setTab("inbox")}>
              Boîte de réception{unread > 0 ? ` (${unread})` : ""}
            </button>
            <button type="button" role="tab" className={styles.tab} aria-selected={tab === "write"} onClick={() => setTab("write")}>
              Écrire
            </button>
          </div>
        )}

        <ScrollArea className={styles.scroll} contentClassName={styles.scrollContent}>
          {tab === "write" && isAdmin ? (
            <MailComposer onSent={load} />
          ) : loadError ? (
            <p className={styles.status}>{loadError}</p>
          ) : mails === null ? (
            <p className={styles.status}>Ouverture de la boîte…</p>
          ) : mails.length === 0 ? (
            <p className={styles.empty}>Aucun courrier pour l&apos;instant.</p>
          ) : (
            <ul className={styles.list}>
              {mails.map((mail) => (
                <li key={mail.id}>
                  <button type="button" className={styles.item} data-unread={!mail.read || undefined} onClick={() => open(mail)}>
                    {mail.thumbnail ? (
                      // eslint-disable-next-line @next/next/no-img-element -- miniature en data URL
                      <img className={styles.thumb} src={thumbnailSrc(mail.thumbnail, "mini")} alt="" draggable={false} />
                    ) : (
                      <span className={styles.thumbFallback}>
                        {/* eslint-disable-next-line @next/next/no-img-element -- icône locale */}
                        <img src={mail.read ? ENVELOPE_OPEN : ENVELOPE_CLOSED} alt="" draggable={false} />
                      </span>
                    )}
                    <span className={styles.itemText}>
                      <span className={styles.itemTitle}>{mail.title}</span>
                      <span className={styles.itemMeta}>{dateFormat.format(new Date(mail.sentAt))}</span>
                    </span>
                    {hasGifts(mail.gifts) && (
                      <span className={styles.giftTag} data-claimed={mail.claimed || undefined}>
                        {mail.claimed ? "Réclamé" : "Cadeau"}
                      </span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </ScrollArea>
      </div>

      {opened && (
        // Le bandeau se ferme seul : son voile ne doit pas fermer aussi le panneau.
        <div onClick={(event) => event.stopPropagation()} role="presentation">
          <MailLetter mail={opened} claiming={claiming} error={claimError} onClaim={() => claim(opened)} onClose={() => setOpenId(null)} />
        </div>
      )}

      {reveal && (
        <div onClick={(event) => event.stopPropagation()} role="presentation">
          <RewardReveal levels={[]} choices={[]} extraItems={mailGiftItems(reveal.gifts)} title="Cadeaux reçus !" onDone={() => setReveal(null)} />
        </div>
      )}
    </div>,
    document.body
  );
}

/** Le courrier ouvert, dans le bandeau noir : miniature, texte, cadeaux. */
function MailLetter({
  mail,
  claiming,
  error,
  onClaim,
  onClose,
}: {
  mail: InboxMail;
  claiming: boolean;
  error: string | null;
  onClaim: () => void;
  onClose: () => void;
}) {
  const items = mailGiftItems(mail.gifts);
  const claimable = items.length > 0 && !mail.claimed;
  return (
    <Dialog
      title={mail.title}
      description={dateFormat.format(new Date(mail.sentAt))}
      variant="banner"
      onClose={onClose}
      actions={
        claimable ? (
          <button type="button" className={game.primary} disabled={claiming} onClick={onClaim}>
            {claiming ? "Réclamation…" : "Réclamer"}
          </button>
        ) : (
          <button type="button" className={game.secondary} onClick={onClose}>
            Fermer
          </button>
        )
      }
    >
      <div className={styles.letter}>
        {mail.thumbnail && (
          // eslint-disable-next-line @next/next/no-img-element -- miniature en data URL
          <img className={styles.letterImage} src={thumbnailSrc(mail.thumbnail, "full")} alt="" draggable={false} />
        )}
        {mail.body && <p className={styles.letterBody}>{mail.body}</p>}
        {items.length > 0 && (
          <ul className={styles.gifts} data-claimed={mail.claimed || undefined} aria-label={mail.claimed ? "Cadeaux déjà réclamés" : "Cadeaux"}>
            {items.map((item) => (
              <li key={item.kind === "booster" ? `booster:${item.boosterId}` : item.kind} className={styles.gift}>
                <RewardIcon item={item} size={56} />
                {loginRewardLabel(item)}
              </li>
            ))}
          </ul>
        )}
        {mail.claimed && items.length > 0 && <p className={styles.itemMeta}>Cadeaux déjà réclamés.</p>}
        {error && <p className={styles.error}>{error}</p>}
      </div>
    </Dialog>
  );
}
