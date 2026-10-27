"use client";

import { useMemo, useState } from "react";
import { PRECON_DECKS } from "@/game";
import { FriendsBoard, type FriendsBoardProps } from "@/features/friends/FriendsBoard";
import { PlayerSheet } from "@/features/friends/PlayerSheet";
import { ChallengeBand } from "@/features/friends/ChallengeBand";
import { BattleLobby } from "@/features/friends/BattleLobby";
import type { LobbyView } from "@/features/friends/lobbyService";
import type { PlayerCardView } from "@/features/friends/playerCardService";
import { SidePanel } from "@/features/shell/SidePanel";
import styles from "@/features/friends/FriendsLab.module.css";

/* ── Données factices ─────────────────────────────────────────────── */

const MOI: PlayerCardView = {
  userId: "00000000-0000-4000-8000-000000000001",
  name: "Alti",
  level: 17,
  titleName: "Marin d'eau douce",
  avatarCardId: "veilleuse-de-lombre",
  avatarArtwork: "classique",
  showcase: [
    { cardId: "heros-de-la-flamme", artwork: "classique", finish: "foil" },
    { cardId: "oracle-damethyste", artwork: "classique", finish: "monochrome" },
    null,
    { cardId: "vigie-aux-fissures", artwork: "styled", finish: "classique" },
    null,
    null,
  ],
  relation: "self",
  stats: { matchesPlayed: 36, wins: 21, preconsOwned: 4, cardsCollected: 182 },
  friendCode: "K7RQ2MXA",
  profileFrameId: null,
};

const AMI: PlayerCardView = {
  userId: "00000000-0000-4000-8000-000000000002",
  name: "Morgane",
  level: 23,
  titleName: "Timonière",
  avatarCardId: "oracle-damethyste",
  avatarArtwork: "classique",
  showcase: [
    { cardId: "le-geant-chromatique", artwork: "classique", finish: "prismatic" },
    { cardId: "mange-fer", artwork: "classique", finish: "classique" },
    { cardId: "matelot-fele", artwork: "classique", finish: "negative" },
    null,
    null,
    null,
  ],
  relation: "friend",
  stats: { matchesPlayed: 112, wins: 64, preconsOwned: 7, cardsCollected: 341 },
  friendCode: null,
  profileFrameId: "frame-mousse",
};

const TABLEAU: NonNullable<FriendsBoardProps["data"]> = {
  social: {
    friendCode: MOI.friendCode!,
    friends: [
      { userId: AMI.userId, name: AMI.name, presence: "online" },
      { userId: "00000000-0000-4000-8000-000000000003", name: "Le Vieux Gus", presence: "in_match" },
      { userId: "00000000-0000-4000-8000-000000000004", name: "Brume", presence: "offline" },
    ],
    incoming: [{ userId: "00000000-0000-4000-8000-000000000005", name: "Capitaine Sel" }],
    outgoing: [{ userId: "00000000-0000-4000-8000-000000000006", name: "Lantern" }],
    challenges: [],
  },
  trades: { incoming: [], outgoing: [] },
  recentOpponents: [{ userId: "00000000-0000-4000-8000-000000000007", name: "Écume" }],
};

/** Le salon, vu par moi (l'hôte), dans chacun de ses états. */
const SALON: Record<string, { label: string; lobby: LobbyView }> = (() => {
  const base: LobbyView = {
    id: "00000000-0000-4000-8000-0000000000aa",
    status: "open",
    side: "host",
    me: { player: MOI, deckId: null, hasDeck: false, ready: false, present: true },
    other: { player: { ...AMI }, deckId: null, hasDeck: false, ready: false, present: true },
    countdownMs: null,
    matchId: null,
    error: null,
  };
  const deck = PRECON_DECKS[0]!.id;
  const avecDeck = { ...base.me, deckId: deck, hasDeck: true };
  return {
    envoye: { label: "Défi envoyé", lobby: { ...base, status: "invited", other: { ...base.other, present: false } } },
    refuse: { label: "Défi refusé", lobby: { ...base, status: "declined", other: { ...base.other, present: false } } },
    ouvert: { label: "Salon ouvert", lobby: base },
    amiPret: { label: "L'ami est prêt", lobby: { ...base, other: { ...base.other, hasDeck: true, ready: true } } },
    moiPret: { label: "Moi prêt, j'attends", lobby: { ...base, me: { ...avecDeck, ready: true }, other: { ...base.other, hasDeck: true } } },
    depart: {
      label: "Compte à rebours",
      lobby: { ...base, me: { ...avecDeck, ready: true }, other: { ...base.other, hasDeck: true, ready: true }, countdownMs: 5000 },
    },
    absent: { label: "Ami absent", lobby: { ...base, other: { ...base.other, present: false } } },
  };
})();

type Vue = "panneau" | "chargement" | "ami" | "moi" | "defi" | `salon:${string}`;

/**
 * LE LAB DU VOLET AMIS (`/game/amis-preview`) : chaque écran sur des
 * données factices, sans compte ni base. Les boutons qui parlent au serveur
 * (ajouter, échanger, proposer un combat) y échouent proprement — ce lab
 * règle l'AFFICHAGE ; le salon, lui, simule ses réponses sur place.
 */
export function FriendsLab() {
  const [vue, setVue] = useState<Vue>("panneau");
  const [journal, setJournal] = useState<string | null>(null);
  const precons = useMemo(() => PRECON_DECKS.map((deck) => deck.id), []);

  const note = (texte: string) => setJournal(`${new Date().toLocaleTimeString("fr-FR")} — ${texte}`);
  const boardProps = {
    onChanged: () => note("le tableau se relirait"),
    onOpenPlayer: () => setVue("ami"),
    onOpenTrade: () => note("l'échange s'ouvrirait"),
    onOpenMe: () => setVue("moi"),
    onChallenge: () => setVue("salon:envoye"),
  };

  let scene;
  if (vue === "panneau" || vue === "chargement") {
    scene = (
      <SidePanel title="Amis" iconSrc="/assets/ui/icons/amis.webp" onClose={() => note("le panneau se fermerait")}>
        <FriendsBoard data={vue === "chargement" ? null : TABLEAU} {...boardProps} />
      </SidePanel>
    );
  } else if (vue === "ami" || vue === "moi") {
    scene = (
      <SidePanel title="Amis" iconSrc="/assets/ui/icons/amis.webp" onClose={() => setVue("panneau")}>
        <PlayerSheet
          player={vue === "moi" ? MOI : AMI}
          onBack={() => setVue("panneau")}
          onTrade={() => note("l'échange s'ouvrirait")}
          onChanged={() => note("la fiche se relirait")}
          onLeave={() => note("le panneau se fermerait")}
        />
      </SidePanel>
    );
  } else if (vue === "defi") {
    scene = (
      <ChallengeBand
        fromName={AMI.name}
        onAccept={() => {
          note("défi accepté : direction le salon");
          setVue("salon:ouvert");
        }}
        onDecline={() => {
          note("défi refusé : le salon de l'ami l'annonce");
          setVue("panneau");
        }}
      />
    );
  } else {
    const scenario = SALON[vue.slice("salon:".length)] ?? SALON.ouvert!;
    scene = <BattleLobby key={vue} initialLobby={scenario.lobby} personalDecks={[]} unlockedDeckIds={precons} preview />;
  }

  const bouton = (id: Vue, label: string) => (
    <button key={id} type="button" className={styles.chip} aria-pressed={vue === id} onClick={() => setVue(id)}>
      {label}
    </button>
  );

  return (
    <>
      <div className={styles.scene}>{scene}</div>
      <nav className={styles.bar} aria-label="Scénarios du lab Amis">
        <span className={styles.title}>Lab Amis</span>
        {bouton("panneau", "Panneau")}
        {bouton("chargement", "Panneau (chargement)")}
        {bouton("ami", "Fiche d'un ami")}
        {bouton("moi", "Ma fiche")}
        {bouton("defi", "Bande de défi")}
        <span className={styles.sep} aria-hidden />
        {Object.entries(SALON).map(([id, entry]) => bouton(`salon:${id}`, `Salon · ${entry.label}`))}
        {journal && <span className={styles.log}>{journal}</span>}
      </nav>
    </>
  );
}
