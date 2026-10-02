import { dispatch, HIDDEN_CARD_ID, type GameState, type PlayerAction } from "@/game";

/**
 * Coups dont le résultat se prédit sans rien savoir de caché : poser une
 * carte, Saborder, passer à la phase suivante. Finir son tour fait piocher :
 * jamais prédit.
 *
 * ATTAQUER N'Y EST PAS, et c'est mesuré (`tests/features/predictView.test.ts`) :
 * environ une attaque sur dix ouvre une fenêtre de réaction chez l'adversaire
 * depuis une carte de sa MAIN, que la vue ne montre pas. La prédiction
 * jouerait le coup, puis la réponse du serveur le rembobinerait — un coup
 * animé deux fois est pire qu'un coup qui attend l'aller-retour.
 */
const PREDICTABLE: ReadonlySet<PlayerAction["type"]> = new Set(["playCard", "saborder", "advancePhase"]);

/**
 * AFFICHAGE ANTICIPÉ d'un coup, en attendant la réponse du serveur.
 *
 * Une partie arbitrée faisait un aller-retour complet avant que la carte
 * posée n'apparaisse — plusieurs centaines de millisecondes pendant
 * lesquelles rien ne bougeait, et le plateau refusait tout autre geste.
 *
 * Le moteur est pur : rejouer le coup sur la vue du joueur donne, pour ces
 * coups-là, exactement ce que le serveur calculera. La prédiction est
 * ÉCARTÉE dès qu'elle touche à ce que la vue ne contient pas :
 *   - un tirage aléatoire (la vue n'a pas la graine) ;
 *   - une pioche ou une carte révélée (la vue n'a pas les decks) ;
 *   - une carte masquée impliquée ;
 *   - une fenêtre de réaction ou un choix qui s'ouvre (c'est au serveur de
 *     dire qui répond) ;
 *   - un changement de Marée.
 *
 * Reste une limite qu'aucune prédiction honnête ne lève : une réaction
 * depuis la MAIN adverse, cachée. Le serveur ouvre alors une fenêtre que la
 * vue ne voyait pas venir, et sa réponse remplace l'affichage.
 *
 * Ce n'est QUE de l'affichage : rien de prédit ne repart au serveur, et la
 * vue renvoyée par le serveur remplace la prédiction dès qu'elle arrive.
 * `null` : pas de prédiction, on attend le serveur comme avant.
 */
export function predictView(view: GameState, action: PlayerAction): GameState | null {
  if (!PREDICTABLE.has(action.type)) return null;
  try {
    const result = dispatch(view, action);
    if (!result.ok) return null;
    const next = result.state;
    if (next.rngState !== view.rngState) return null;
    if (next.pendingReaction || next.pendingChoice) return null;
    const newEvents = next.eventLog.slice(view.eventLog.length);
    const touchesHidden = newEvents.some(
      (event) =>
        event.type === "DRAW_CARD" ||
        event.type === "HAND_CARD_REVEALED" ||
        // Un changement de Marée déclenche des effets d'environnement que la
        // vue ne reproduit pas toujours à l'identique (mesuré : dégâts de
        // Marée divergents sur une pose qui fait avancer la Marée).
        event.type === "TIDE_ADVANCED" ||
        ("cardId" in event && event.cardId === HIDDEN_CARD_ID)
    );
    return touchesHidden ? null : next;
  } catch {
    // Une vue n'est pas faite pour le moteur : au moindre doute, on attend le serveur.
    return null;
  }
}
