"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { getCardDefinition, PRECON_DECKS, type CardInstance, type GameState } from "@/game";
import { createLocalMatch } from "@/features/match/createLocalMatch";
import { MatchBoard } from "@/features/match/MatchBoard";
import { LandeTuningPanel } from "@/features/match/landes/LandeTuningPanel";
import { FxLabPanel } from "@/features/match/FxLabPanel";

const LANDES = ["pluie-corrosive", "chaine-de-construction", "vallee-de-verre", "le-donjon-de-ladalle"] as const;

function carte(cardId: string, ownerId: string, index: number): CardInstance {
  return { instanceId: `lab_${ownerId}_${cardId}_${index}`, cardId, ownerId, damageMarked: 0, modifiers: [], summoningSick: false, hasAttackedThisTurn: false };
}

/**
 * Laboratoire des LANDES (`/game/lande-preview`) : une partie locale à deux
 * sur le même écran, les trois Landes en main du premier joueur, de quoi
 * les payer, et quelques corps de chaque côté pour voir leurs règles agir.
 *
 * `?lande=<id>` : la Lande est déjà en jeu au chargement (sa scène seule,
 * sans l'arrivée) — pour régler un décor sans rejouer la carte. Le panneau
 * « Réglages » (`LandeTuningPanel`) fait varier la scène en direct.
 *
 * Gaston (D6) est aussi en main : de quoi voir un jet de dé sur la scène.
 *
 * `?combat=1` : la partie s'ouvre au 3e tour, en Phase de combat, avec une
 * Garde en face (Mouette du Brise-Lames) — de quoi voir le halo des cartes
 * prêtes à attaquer, et la Garde qui s'interpose quand on vise le Navire.
 *
 * Le panneau « Animations » (`FxLabPanel`) lance à la demande les
 * animations de cartes et de sorts sur les cartes du plateau.
 */
export function LandePreview() {
  const params = useSearchParams();
  // Construite après le montage : la partie tire un horodatage et une
  // graine, que le rendu serveur ne partagerait pas (erreur d'hydratation).
  const [state, setState] = useState<GameState | null>(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- lu une fois, à l'arrivée
  useEffect(() => setState(build()), []);
  function build(): GameState {
    const base = createLocalMatch(PRECON_DECKS[0]!, PRECON_DECKS[1]!, "player1");
    const deja = params.get("lande");
    const lande = deja && LANDES.includes(deja as (typeof LANDES)[number]) ? deja : null;
    const combat = params.get("combat") === "1";
    return {
      ...base,
      ...(combat ? { turnNumber: 3, phase: "combatPhase" as const } : {}),
      environment: {
        ...base.environment,
        ...(lande ? { lande: { instanceId: "lab_lande", cardId: lande, ownerId: "p1", remainingPlayerTurns: 2 * getCardDefinition(lande).lande!.durationTableTurns } } : {}),
      },
      players: base.players.map((p) =>
        p.id === "p1"
          ? {
              ...p,
              reason: 10,
              hand: [
                ...LANDES.filter((id) => id !== lande).map((id, i) => carte(id, p.id, i)),
                carte("gaston-aventurier-de-ladalle", p.id, 0),
                // Deux Objets à jouer : l'un vise une unité (dégâts, bleu), l'autre rend de la Raison (or) ;
                // et un Objet Chaîne, qui ne se joue qu'en réponse.
                carte("eclat-de-bouteille", p.id, 3),
                carte("thermos-du-dernier-quart", p.id, 4),
                carte("harpon-a-ressort", p.id, 5),
                ...p.hand.slice(0, 2),
              ],
              // Un jeton de chaque côté : les animations doivent épouser son cadre ovale.
              // Deux Équipements attachés : glissés derrière leur porteur, sans case à eux.
              board: [
                carte("crabe-de-fer", p.id, 0),
                { ...carte("harpon-de-pont", p.id, 0), attachedToInstanceId: carte("crabe-de-fer", p.id, 0).instanceId },
                carte("marin-des-jetees", p.id, 1),
                { ...carte("plaque-de-fortune", p.id, 1), attachedToInstanceId: carte("marin-des-jetees", p.id, 1).instanceId },
                { ...carte("peon-cra-poiscail", p.id, 2), illustrationVariant: 1 },
              ],
            }
          : {
              ...p,
              board: [
                carte("crabe-de-fer", p.id, 0),
                carte("murene-aveugle", p.id, 1),
                carte("marin-des-jetees", p.id, 2),
                carte("eclat-chromatique-bleu", p.id, 4),
                ...(combat ? [carte("mouette-du-brise-lames", p.id, 3)] : []),
              ],
            }
      ) as GameState["players"],
    };
  }
  return state ? (
    <>
      <MatchBoard initialState={state} onExit={() => window.history.back()} labPatchable />
      <LandeTuningPanel />
      <FxLabPanel cardEffects />
    </>
  ) : null;
}
