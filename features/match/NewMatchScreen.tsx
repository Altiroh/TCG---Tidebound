"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ARCHETYPE_DECKS,
  CRA_POISCAIL_TEST_DECKS,
  PLAYABLE_DECKS,
  PRECONSTRUCTED_DECKS,
  getShipDefinition,
  type BotDifficulty,
  type DeckList,
} from "@/game";
import { FilterChip } from "@/components/game-ui/FilterChip";
import { GameButton } from "@/components/game-ui/GameButton";
import { GamePanel } from "@/components/game-ui/GamePanel";
import { GameSelect, type GameSelectOption } from "@/components/game-ui/GameSelect";
import { TEXT_PRIMARY, TEXT_SECONDARY, TRANSITION } from "@/components/game-ui/tokens";

export type MatchOpponent = { type: "pvp" } | { type: "bot"; difficulty: BotDifficulty };

interface NewMatchScreenProps {
  onStart: (deck1: DeckList, deck2: DeckList, opponent: MatchOpponent) => void | Promise<void>;
  /** Démarrage en cours (création d'une partie serveur) : le bouton est désactivé. */
  starting?: boolean;
  error?: string | null;
  /** Précision affichée en mode bot (partie serveur récompensée, ou entraînement local). */
  botNote?: string;
}

/**
 * Liste combinée proposée à l'écran de sélection : les 3 decks de base
 * système (un par Navire) puis les archétypes — plusieurs archétypes
 * partagent le même Navire, d'où l'affichage de son nom à côté de chaque
 * deck plutôt qu'une simple liste de Navires.
 */
const SELECTABLE_DECKS: readonly DeckList[] = PLAYABLE_DECKS;

/**
 * Deck du BOT : toujours tiré au sort, jamais choisi — on ne règle que le
 * sien, on découvre ce qui arrive en face. Tirage au LANCEMENT et non à
 * l'affichage, pour que deux parties d'affilée donnent bien deux
 * adversaires différents.
 *
 * `Math.random` est ici un choix d'INTERFACE, pas un aléa de moteur : il
 * ne touche pas `GameState.rngState`, qui doit rester déterministe.
 */
function pickRandomDeck(): DeckList {
  return SELECTABLE_DECKS[Math.floor(Math.random() * SELECTABLE_DECKS.length)]!;
}

const DECK_OPTIONS: GameSelectOption<string>[] = [
  ...PRECONSTRUCTED_DECKS.map((deck) => ({ value: deck.id, label: deck.name, group: "Decks de base" })),
  ...ARCHETYPE_DECKS.map((deck) => ({
    value: deck.id,
    label: `${deck.name} — ${getShipDefinition(deck.shipId).name}`,
    group: "Archétypes",
  })),
  // Groupe à part : ce sont des listes de test du Lot 10, pas des
  // propositions d'équilibrage au même titre que les archétypes.
  ...CRA_POISCAIL_TEST_DECKS.map((deck) => ({
    value: deck.id,
    label: `${deck.name} — ${getShipDefinition(deck.shipId).name}`,
    group: "Cra-Poiscail (à tester)",
  })),
];

const BOT_DIFFICULTIES: { id: BotDifficulty; label: string; description: string }[] = [
  { id: "facile", label: "Facile", description: "Joue quasiment au hasard, évite juste les pires coups." },
  { id: "moyen", label: "Moyen", description: "Vise généralement le meilleur coup, avec des erreurs occasionnelles." },
  { id: "difficile", label: "Difficile", description: "Cherche systématiquement le meilleur coup possible." },
];

/** Écran de sélection des Navires/decks avant une partie locale : contre un autre joueur (hot-seat) ou contre un bot. */
export function NewMatchScreen({ onStart, starting = false, error = null, botNote }: NewMatchScreenProps) {
  const [deck1Id, setDeck1Id] = useState(SELECTABLE_DECKS[0]!.id);
  /** Uniquement pour le hot-seat : contre un bot, le second deck est tiré au sort et ce réglage est ignoré. */
  const [deck2Id, setDeck2Id] = useState(SELECTABLE_DECKS[1]!.id);
  const [opponentType, setOpponentType] = useState<"pvp" | "bot">("pvp");
  const [botDifficulty, setBotDifficulty] = useState<BotDifficulty>("moyen");

  function handleStart() {
    const opponent: MatchOpponent = opponentType === "bot" ? { type: "bot", difficulty: botDifficulty } : { type: "pvp" };
    const deck1 = SELECTABLE_DECKS.find((d) => d.id === deck1Id)!;
    // Contre un bot, le tirage a lieu ICI — au lancement, pas à
    // l'affichage : relancer une partie change d'adversaire.
    const deck2 = opponentType === "bot" ? pickRandomDeck() : SELECTABLE_DECKS.find((d) => d.id === deck2Id)!;
    onStart(deck1, deck2, opponent);
  }

  return (
    <main
      className="relative flex min-h-screen flex-col items-center justify-center gap-8 p-6"
      style={{ background: "radial-gradient(ellipse at 50% -10%, var(--surface-1) 0%, var(--surface-0) 60%)" }}
    >
      <Link href="/" className={`fixed left-6 top-6 z-10 text-sm ${TEXT_SECONDARY} transition-colors hover:${TEXT_PRIMARY}`}>
        ← Retour au menu
      </Link>

      <div className="text-center">
        <h1 className={`text-3xl font-bold tracking-tight ${TEXT_PRIMARY}`}>Nouvelle partie</h1>
        <p className={`mt-2 text-sm ${TEXT_SECONDARY}`}>
          {opponentType === "pvp"
            ? "Mode local : les deux joueurs jouent sur le même écran, à tour de rôle."
            : "Vous affrontez un bot — il jouera le second Navire."}
        </p>
        {opponentType === "bot" && botNote && <p className={`mx-auto mt-1 max-w-md text-xs ${TEXT_SECONDARY}`}>{botNote}</p>}
      </div>

      <GamePanel className="flex w-full max-w-xl flex-col gap-3 p-5 text-left">
        <span className={`text-sm font-medium ${TEXT_SECONDARY}`}>Adversaire</span>
        <div className="flex gap-2">
          <FilterChip active={opponentType === "pvp"} onClick={() => setOpponentType("pvp")} className="!rounded-md !px-4 !py-2 !text-sm">
            Joueur contre joueur
          </FilterChip>
          <FilterChip active={opponentType === "bot"} onClick={() => setOpponentType("bot")} className="!rounded-md !px-4 !py-2 !text-sm">
            Contre un bot
          </FilterChip>
        </div>
        {opponentType === "bot" && (
          <div className="mt-2 flex flex-col gap-2">
            <span className={`text-xs ${TEXT_SECONDARY}`}>Difficulté</span>
            <div className="flex flex-col gap-2 sm:flex-row">
              {BOT_DIFFICULTIES.map((d) => (
                <button
                  key={d.id}
                  type="button"
                  onClick={() => setBotDifficulty(d.id)}
                  className={`flex flex-1 flex-col gap-1 rounded-md px-3 py-2 text-left ${TRANSITION} ${
                    botDifficulty === d.id
                      ? "bg-[var(--accent)]/10 shadow-[0_0_0_1px_var(--accent)]"
                      : "shadow-[0_0_0_1px_var(--border-subtle)] hover:shadow-[0_0_0_1px_rgba(255,255,255,0.2)]"
                  }`}
                >
                  <span className={`text-sm font-medium ${TEXT_PRIMARY}`}>{d.label}</span>
                  <span className={`text-[11px] leading-tight ${TEXT_SECONDARY}`}>{d.description}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </GamePanel>

      <div className="flex w-full max-w-xl flex-col gap-4 sm:flex-row">
        <DeckPicker label={opponentType === "bot" ? "Votre deck" : "Joueur 1"} value={deck1Id} onChange={setDeck1Id} />
        {opponentType === "bot" ? <RandomOpponentPanel /> : <DeckPicker label="Joueur 2" value={deck2Id} onChange={setDeck2Id} />}
      </div>

      <GameButton variant="primary" onClick={handleStart} disabled={starting} className="!px-8 !py-3 !text-base">
        {starting ? "Préparation de la partie..." : "Commencer la partie"}
      </GameButton>
      {error && <p className="text-sm text-rose-400">{error}</p>}
    </main>
  );
}

/** Face au bot il n'y a rien à régler : on annonce le tirage, on ne le propose pas. Même gabarit que `DeckPicker` pour que les deux colonnes restent alignées. */
function RandomOpponentPanel() {
  return (
    <GamePanel className="flex flex-1 flex-col gap-2 p-4 text-left">
      <span className={`text-sm font-medium ${TEXT_SECONDARY}`}>Bot</span>
      <div
        className={`flex w-full items-center gap-2 rounded-md px-3 py-1.5 text-sm ${TEXT_PRIMARY} shadow-[0_0_0_1px_var(--border-subtle)]`}
      >
        <svg viewBox="0 0 24 24" fill="none" className="h-3.5 w-3.5 shrink-0 text-[var(--accent)]" aria-hidden>
          <path
            d="M16 3h5v5M21 3l-7 7M8 21H3v-5M3 21l7-7M21 16v5h-5M14 14l7 7M3 8V3h5M10 10L3 3"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        Deck aléatoire
      </div>
      <p className={`text-xs leading-snug ${TEXT_SECONDARY}`}>
        Tiré parmi les {SELECTABLE_DECKS.length} listes au lancement — Navire et style découverts en partie.
      </p>
    </GamePanel>
  );
}

function DeckPicker({ label, value, onChange }: { label: string; value: string; onChange: (id: string) => void }) {
  const selected = SELECTABLE_DECKS.find((d) => d.id === value);
  const shipName = selected ? getShipDefinition(selected.shipId).name : undefined;
  const isArchetype = selected ? !PRECONSTRUCTED_DECKS.some((d) => d.id === selected.id) : false;

  return (
    <GamePanel className="flex flex-1 flex-col gap-2 p-4 text-left">
      <span className={`text-sm font-medium ${TEXT_SECONDARY}`}>{label}</span>
      <GameSelect value={value} onChange={onChange} options={DECK_OPTIONS} className="w-full" />
      {/* Suggestion du Navire correspondant : redondante avec le libellé de l'option pour un archétype, mais utile pour un deck de base où le nom du deck EST déjà celui du Navire. */}
      {shipName && (
        <span className={`text-[11px] ${TEXT_SECONDARY}`}>{isArchetype ? `Navire suggéré : ${shipName}` : `Navire : ${shipName}`}</span>
      )}
      {/* Le joueur doit savoir ce que le deck fait avant de le choisir, pas juste voir son nom. */}
      {selected && <p className={`text-xs leading-snug ${TEXT_SECONDARY}`}>{selected.description}</p>}
    </GamePanel>
  );
}
