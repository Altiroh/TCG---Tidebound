import { dispatch, HIDDEN_CARD_ID, type GameState, type PlayerAction } from "@/game";

/**
 * Coups dont le résultat se prédit sans rien savoir de caché : poser une
 * carte, Saborder. Le reste (attaquer, changer de phase, finir son tour…)
 * ouvre des fenêtres de réaction, fait piocher ou jouer le bot — le serveur
 * seul sait ce qui en sort.
 */
const PREDICTABLE: ReadonlySet<PlayerAction["type"]> = new Set(["playCard", "saborder"]);

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
 *     dire qui répond).
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
      (event) => event.type === "DRAW_CARD" || event.type === "HAND_CARD_REVEALED" || ("cardId" in event && event.cardId === HIDDEN_CARD_ID)
    );
    return touchesHidden ? null : next;
  } catch {
    // Une vue n'est pas faite pour le moteur : au moindre doute, on attend le serveur.
    return null;
  }
}
