"use client";

import { useMemo, useState, useTransition } from "react";
import { getCardDefinition } from "@/game";
import { rarityForCardId } from "@/game/boosters";
import { CARD_RARITY_LABELS } from "@/features/match/cardDisplay";
import { CardThumb } from "@/features/match/CardThumb";
import { proposeTrade } from "@/features/friends/tradeActions";
import type { TradeableCard } from "@/features/friends/tradeService";
import { TRADE_DAILY_CAP, TRADE_MAX_COPIES, TRADE_MAX_LINES, tradeProposalError, type TradeLine } from "@/features/friends/tradeRules";
import { TradeSummary } from "@/features/friends/TradeSummary";
import game from "@/features/shell/GameScreen.module.css";
import styles from "@/features/friends/Social.module.css";
import { playButtonClick } from "@/lib/sound";

const RARITY_ORDER = ["common", "uncommon", "rare", "epic", "legendary", "abyssal"];

interface TradeComposerProps {
  friend: { userId: string; name: string };
  /** Mes exemplaires Classiques disponibles. */
  mine: TradeableCard[];
  /** Ceux de l'ami. */
  theirs: TradeableCard[];
  onBack: () => void;
  /** Proposition envoyée : le panneau revient au tableau des amis. */
  onSent: () => void;
}

type Picks = Record<string, number>;

function linesOf(picks: Picks): TradeLine[] {
  return Object.entries(picks)
    .filter(([, quantity]) => quantity > 0)
    .map(([cardId, quantity]) => ({ cardId, quantity }));
}

/**
 * Proposer un ÉCHANGE à un ami, dans le panneau Amis : d'abord ce qu'on
 * donne (sa collection), puis ce qu'on demande (la sienne). Exemplaires
 * Classiques seulement — une édition rare reste à celui qui l'a tirée.
 * L'ami accepte ou refuse depuis son panneau ; tout est revérifié à ce
 * moment-là.
 */
export function TradeComposer({ friend, mine, theirs, onBack, onSent }: TradeComposerProps) {
  const [give, setGive] = useState<Picks>({});
  const [take, setTake] = useState<Picks>({});
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [sending, startSending] = useTransition();

  const offered = linesOf(give);
  const requested = linesOf(take);
  const problem = tradeProposalError(offered, requested);

  function submit() {
    playButtonClick();
    setMessage(null);
    startSending(async () => {
      const result = await proposeTrade(friend.userId, offered, requested).catch(() => ({ ok: false as const, error: "Le serveur est injoignable." }));
      if (result.ok) {
        onSent();
        return;
      }
      setMessage({ tone: "error", text: result.error });
    });
  }

  return (
    <div className={styles.column}>
      <div className={styles.row}>
        <div>
          <p className={game.eyebrow}>Échange avec {friend.name}</p>
          <h3 className={game.sectionTitle}>Proposer un échange</h3>
        </div>
        <button type="button" className={game.secondary} onClick={onBack}>
          ← Sa fiche
        </button>
      </div>

      <section className={`${game.panel} ${styles.section}`} aria-label="Proposition">
        <TradeSummary offered={offered} requested={requested} giverLabel="Tu donnes" receiverLabel="Tu reçois" />
        <p className={game.caption}>
          Exemplaires Classiques seulement, {TRADE_MAX_LINES} cartes différentes et {TRADE_MAX_COPIES} exemplaires d&apos;une carte au plus de chaque côté.{" "}
          {TRADE_DAILY_CAP} échanges conclus par jour. Un deck qui utilisait une carte cédée devra être complété.
        </p>
        <div className={styles.row}>
          <span className={game.muted}>{problem ?? `${friend.name} aura 72 h pour accepter.`}</span>
          <button type="button" className={game.primary} disabled={Boolean(problem) || sending} onClick={submit}>
            {sending ? "Envoi…" : "Envoyer la proposition"}
          </button>
        </div>
        {message && <p className={message.tone === "ok" ? game.success : game.error}>{message.text}</p>}
      </section>

      <CardPicker title="Ta collection — tu donnes" cards={mine} picks={give} onChange={setGive} emptyText="Aucun exemplaire Classique à céder." />
      <CardPicker title={`Collection de ${friend.name} — tu demandes`} cards={theirs} picks={take} onChange={setTake} emptyText={`${friend.name} n'a aucun exemplaire Classique à céder.`} />
    </div>
  );
}

function CardPicker({
  title,
  cards,
  picks,
  onChange,
  emptyText,
}: {
  title: string;
  cards: TradeableCard[];
  picks: Picks;
  onChange: (next: Picks) => void;
  emptyText: string;
}) {
  const [query, setQuery] = useState("");
  const sorted = useMemo(() => {
    const rarity = (id: string) => RARITY_ORDER.indexOf(rarityForCardId(id) ?? "common");
    return cards
      .filter((card) => {
        try {
          getCardDefinition(card.cardId);
          return true;
        } catch {
          return false;
        }
      })
      .sort((a, b) => rarity(b.cardId) - rarity(a.cardId) || getCardDefinition(a.cardId).name.localeCompare(getCardDefinition(b.cardId).name, "fr"));
  }, [cards]);
  const needle = query.trim().toLocaleLowerCase("fr");
  const shown = needle ? sorted.filter((card) => getCardDefinition(card.cardId).name.toLocaleLowerCase("fr").includes(needle)) : sorted;

  function step(cardId: string, delta: number, available: number) {
    playButtonClick();
    const next = Math.max(0, Math.min(available, TRADE_MAX_COPIES, (picks[cardId] ?? 0) + delta));
    onChange({ ...picks, [cardId]: next });
  }

  return (
    <section className={`${game.panel} ${styles.section}`} aria-label={title}>
      <h2 className={game.sectionTitle}>{title}</h2>
      <input
        className={`${game.input} ${styles.search}`}
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Rechercher une carte"
        aria-label="Rechercher une carte"
      />
      {shown.length === 0 ? (
        <p className={game.muted}>{cards.length === 0 ? emptyText : "Aucune carte ne correspond."}</p>
      ) : (
        <div className={styles.cardList}>
          {shown.map((card) => {
            const def = getCardDefinition(card.cardId);
            const rarity = rarityForCardId(card.cardId);
            const picked = picks[card.cardId] ?? 0;
            return (
              <div key={card.cardId} className={`${styles.cardLine} ${picked > 0 ? styles.cardLineActive : ""}`}>
                <CardThumb cardId={card.cardId} size={36} />
                <span className={styles.cardLineName}>{def.name}</span>
                <span className={styles.cardLineMeta}>
                  {rarity ? CARD_RARITY_LABELS[rarity] : ""} · ×{card.available}
                </span>
                <span className={styles.stepper}>
                  <button type="button" className={game.iconButtonGhost} aria-label={`Un ${def.name} de moins`} disabled={picked === 0} onClick={() => step(card.cardId, -1, card.available)}>
                    −
                  </button>
                  <output aria-label={`${def.name} : ${picked}`}>{picked}</output>
                  <button
                    type="button"
                    className={game.iconButtonGhost}
                    aria-label={`Un ${def.name} de plus`}
                    disabled={picked >= Math.min(card.available, TRADE_MAX_COPIES)}
                    onClick={() => step(card.cardId, 1, card.available)}
                  >
                    +
                  </button>
                </span>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
