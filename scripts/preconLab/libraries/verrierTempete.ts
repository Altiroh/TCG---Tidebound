import { CARD_DATABASE, getCardDefinition } from "@/game/cards/sets/core";
import type { CardDefinition } from "@/game/cards/types";
import type { EffectDefinition } from "@/game/effects/types";

/**
 * STANDARD VERRIER — APRÈS LA TEMPÊTE (01/10/2026).
 *
 * Constat : un contrôle à balais (Le Pont est Plein !, Vague Scélérate, Le
 * Large se Fâche) dont les corps épais (Crabe de Fer, Carape Hus 2/5,
 * Baleine 5/6) encaissent. Mais un balai ne rapporte rien à qui le lance :
 * il blesse aussi ses propres unités, et le bot ne le joue qu'une fois sur
 * deux quand il l'a en main. 88 % des victoires viennent du combat, et
 * 18 points de Déraison subis par partie (le double de la moyenne).
 *
 * Boucle visée, « la tempête forge » : le balai frappe tout le monde, ce
 * qui survit de VOTRE côté en sort plus fort — puis frappe. Seuls les
 * balais, propres à ce deck, sont retouchés (Vigie, Maître Verrier et
 * Chirurgien sont aussi dans l'Équipage de Verre, l'étalon). Coûts et
 * montants de dégâts inchangés.
 *   V1 — chaque balai : « Vos unités qui y survivent gagnent +1 Puissance. »
 *   L2 — LISTE seule, aucun texte : la courbe. 38 % des mains n'avaient
 *        aucune carte à 2 ou moins ; sortent Chirurgien du Bord ×2 (Δ −11)
 *        et Un Peu de Répit ×3 (joué 4 fois sur 10), entrent Mouette du
 *        Brise-Lames ×3 (Garde, grandit en survivant — un balai la forge)
 *        et Matelot Insomniaque ×2 (vit bien en Déraison).
 *   V2 — V1 + L2.
 * Cartes `lab-…` : n'existent que le temps de la mesure. À charger en `--setup`.
 */

const db = CARD_DATABASE as Map<string, CardDefinition>;
const base = (id: string) => getCardDefinition(id);
const enregistrer = (carte: CardDefinition) => db.set(carte.id, carte);

function forge(id: string, labId: string, suffixe: string): void {
  const carte = base(id);
  const balai = carte.onPlayEffects![0]!;
  // Les unités alliées touchées par CE balai : même filtre que ses dégâts.
  // Une unité qui en meurt reçoit aussi le gain, mais quitte le plateau à
  // la passe suivante : seules les survivantes le gardent.
  const gain = {
    type: "buff",
    target: { kind: "allAllyUnits" },
    filter: balai.filter,
    attackAmount: { kind: "flat", value: 1 },
    healthAmount: { kind: "flat", value: 0 },
    permanent: true,
  } as EffectDefinition;
  enregistrer({ ...carte, id: labId, text: `${carte.text} ${suffixe}`, onPlayEffects: [balai, gain] } as CardDefinition);
}

forge("le-pont-est-plein", "lab-pont-verrier", "Vos unités qui y survivent gagnent +1 Puissance.");
forge("vague-scelerate", "lab-vague-verrier", "Vos unités qui y survivent gagnent +1 Puissance.");
forge("le-large-se-fache", "lab-large-verrier", "Vos unités qui y survivent gagnent +1 Puissance.");
