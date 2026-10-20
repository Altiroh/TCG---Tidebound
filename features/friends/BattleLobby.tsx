"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { PRECON_DECKS, shelfOrder, validateDeckList, type DeckList } from "@/game";
import { DeckPicker } from "@/features/match/DeckPicker";
import type { DeckSource } from "@/features/match/deckFacts";
import { chooseLobbyDeck, fetchLobby, leaveLobby, setLobbyReady } from "@/features/friends/lobbyActions";
import type { LobbySide, LobbyView } from "@/features/friends/lobbyService";
import { LOBBY_POLL_MS } from "@/features/friends/lobbyRules";
import { PlayerIdentity } from "@/features/friends/PlayerIdentity";
import { ShowcaseShelf } from "@/features/friends/ShowcaseShelf";
import { GameScreen } from "@/features/shell/GameScreen";
import game from "@/features/shell/GameScreen.module.css";
import styles from "@/features/friends/BattleLobby.module.css";
import { playButtonClick, playGameStart } from "@/lib/sound";

interface BattleLobbyProps {
  initialLobby: LobbyView;
  personalDecks: DeckList[];
  unlockedDeckIds: string[];
}

/** Ce que dit la plaque d'un capitaine : il attend, il choisit, il est prêt. */
function sideStatus(side: LobbySide, lobby: LobbyView, mine: boolean): string {
  if (!mine && lobby.status === "invited") return "Invitation envoyée…";
  if (!mine && !side.present) return "Absent du salon";
  if (side.ready) return "Prêt !";
  if (!side.hasDeck) return mine ? "Choisis ton deck" : "Choisit son deck…";
  return mine ? "Déclare-toi prêt" : "Pas encore prêt";
}

/**
 * SALON DE COMBAT entre amis (20/10/2026) : les deux capitaines face à face
 * — fiche, vitrine —, chacun choisit son deck et se déclare PRÊT. Les deux
 * prêts, la plaque de chacun s'allume et un compte à rebours part au centre
 * ; se dédire l'arrête. Au bout, le serveur crée la partie et les deux
 * écrans y entrent. L'écran sonde le salon en boucle : c'est aussi son
 * signe de vie (un capitaine muet passe « absent »).
 */
export function BattleLobby({ initialLobby, personalDecks, unlockedDeckIds }: BattleLobbyProps) {
  const router = useRouter();
  const [lobby, setLobby] = useState<LobbyView>(initialLobby);
  const [picking, setPicking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Échéance locale du compte à rebours, recalée à chaque lecture du serveur. */
  const [deadline, setDeadline] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const leaving = useRef(false);

  const personalValidity = useMemo(() => new Map(personalDecks.map((deck) => [deck.id, validateDeckList(deck)])), [personalDecks]);
  const sources: DeckSource[] = useMemo(() => {
    const unlocked = new Set(unlockedDeckIds);
    return [
      {
        id: "mine",
        label: "Mes decks",
        decks: personalDecks,
        issueFor: (deck) => {
          const result = personalValidity.get(deck.id);
          return result && !result.ok ? result.error : null;
        },
      },
      {
        id: "precon",
        label: "Préconstruits",
        decks: PRECON_DECKS.filter((deck) => unlocked.has(deck.id)).sort((a, b) => shelfOrder(a) - shelfOrder(b)),
        issueFor: () => null,
      },
    ];
  }, [personalDecks, personalValidity, unlockedDeckIds]);
  const myDeck = useMemo(() => sources.flatMap((source) => source.decks).find((deck) => deck.id === lobby.me.deckId) ?? null, [sources, lobby.me.deckId]);

  const apply = useCallback((next: LobbyView | null) => {
    if (!next) return;
    setLobby(next);
    setDeadline(next.countdownMs === null ? null : Date.now() + next.countdownMs);
  }, []);

  // Le sondage : présence, prêt de l'autre, compte à rebours, départ.
  useEffect(() => {
    let cancelled = false;
    let inFlight = false;
    const id = setInterval(async () => {
      if (inFlight || leaving.current) return;
      inFlight = true;
      const next = await fetchLobby(lobby.id).catch(() => null);
      inFlight = false;
      if (!cancelled) apply(next);
    }, LOBBY_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [lobby.id, apply]);

  // Le compte à rebours s'égrène entre deux lectures.
  useEffect(() => {
    if (deadline === null) return;
    const id = setInterval(() => setNow(Date.now()), 200);
    return () => clearInterval(id);
  }, [deadline]);

  // La partie est créée : les deux écrans y entrent. La présentation des
  // capitaines vient d'avoir lieu ici — elle n'est pas rejouée en partie.
  useEffect(() => {
    if (!lobby.matchId || leaving.current) return;
    leaving.current = true;
    try {
      window.sessionStorage.setItem(`tb-versus:${lobby.matchId}`, "1");
    } catch {
      // Sans stockage, la présentation se rejouera : rien de grave.
    }
    playGameStart();
    router.push(`/en-ligne/${lobby.matchId}`);
  }, [lobby.matchId, router]);

  async function act(action: () => Promise<{ ok: boolean; error?: string }>) {
    setBusy(true);
    setError(null);
    const result = await action().catch(() => ({ ok: false, error: "Le serveur est injoignable." }));
    if (!result.ok) setError(result.error ?? "Échec.");
    apply(await fetchLobby(lobby.id).catch(() => null));
    setBusy(false);
  }

  async function leave() {
    playButtonClick();
    leaving.current = true;
    await leaveLobby(lobby.id).catch(() => undefined);
    router.push("/");
  }

  const closed = lobby.status === "cancelled" || lobby.status === "declined";
  const starting = lobby.status === "starting" || lobby.status === "started";
  const secondsLeft = deadline === null ? null : Math.max(0, Math.ceil((deadline - now) / 1000));
  const bothReady = lobby.me.ready && lobby.other.ready;

  return (
    <GameScreen
      active="partie"
      nav="minimal"
      backdrop="table"
      onNavigate={(href) => {
        if (href !== "/" || closed) return false;
        void leave();
        return true;
      }}
    >
      <main className={styles.scene}>
        <p className={styles.eyebrow}>Salon de combat · match amical</p>

        <div className={styles.stage}>
          <Side side={lobby.me} status={sideStatus(lobby.me, lobby, true)} mine />

          <div className={styles.center} aria-live="polite">
            {starting ? (
              <span className={styles.go}>À l&apos;abordage !</span>
            ) : secondsLeft !== null ? (
              <span key={secondsLeft} className={styles.count} aria-label={`Départ dans ${secondsLeft} secondes`}>
                {secondsLeft}
              </span>
            ) : (
              <span className={styles.versus} aria-hidden>
                VS
              </span>
            )}
          </div>

          <Side side={lobby.other} status={sideStatus(lobby.other, lobby, false)} />
        </div>

        {closed ? (
          <div className={styles.dock}>
            <p className={game.muted}>
              {lobby.status === "declined" ? `${lobby.other.player.name} a décliné l'invitation.` : "Le salon est fermé : l'un de vous l'a quitté."}
            </p>
            <button type="button" className={game.primary} onClick={() => router.push("/")}>
              Retour au port
            </button>
          </div>
        ) : (
          <div className={styles.dock}>
            <div className={styles.deckRow}>
              <span className={styles.deckName}>{myDeck ? myDeck.name : "Aucun deck choisi"}</span>
              <button
                type="button"
                className={game.secondary}
                disabled={busy || starting}
                onClick={() => {
                  playButtonClick();
                  setPicking(true);
                }}
              >
                {myDeck ? "Changer de deck" : "Choisir un deck"}
              </button>
            </div>
            <button
              type="button"
              className={lobby.me.ready ? styles.readyOn : styles.ready}
              aria-pressed={lobby.me.ready}
              disabled={busy || starting || lobby.status !== "open" || !lobby.me.hasDeck}
              onClick={() => {
                playButtonClick();
                void act(() => setLobbyReady(lobby.id, !lobby.me.ready));
              }}
            >
              {lobby.me.ready ? (bothReady ? "Prêt ✓ — annuler" : "Prêt ✓") : "Prêt"}
            </button>
            {lobby.status === "invited" && <p className={game.caption}>{lobby.other.player.name} doit accepter l&apos;invitation, depuis son Courrier.</p>}
            {(error ?? lobby.error) && <p className={game.error}>{error ?? lobby.error}</p>}
            <button type="button" className={game.ghost} onClick={() => void leave()} disabled={starting}>
              Quitter le salon
            </button>
          </div>
        )}

        {picking && (
          <DeckPicker
            sources={sources}
            selectedId={lobby.me.deckId}
            onClose={() => setPicking(false)}
            onPick={(deck) => {
              setPicking(false);
              void act(() => chooseLobbyDeck(lobby.id, deck.id));
            }}
          />
        )}
      </main>
    </GameScreen>
  );
}

function Side({ side, status, mine = false }: { side: LobbySide; status: string; mine?: boolean }) {
  return (
    <section className={`${styles.side} ${mine ? styles.sideMe : styles.sideOther}`} data-ready={side.ready || undefined} data-absent={!side.present || undefined} aria-label={mine ? "Toi" : side.player.name}>
      <PlayerIdentity player={side.player} />
      <ShowcaseShelf showcase={side.player.showcase} compact emptyLabel="" />
      <span className={styles.status}>{status}</span>
    </section>
  );
}
