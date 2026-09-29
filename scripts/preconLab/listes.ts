import { readFileSync } from "node:fs";
import type { DeckList } from "@/game/cards/decks/types";
import { PRECON_DECK_LISTS } from "@/game/cards/decks/precon";
import { validateDeckList } from "@/game/rules/deckValidation";

/**
 * LISTES EN TEXTE — lire et valider des listes de 40 cartes écrites à la
 * main (audit « Test Verrier », 29/09/2026).
 *
 * Format, un bloc par liste :
 *
 *   liste: <nom affiché de la variante>
 *   deck: <id du préconstruit dont elle part>
 *   navire: <id du Navire>
 *   <id-de-carte> x<n>
 *   …
 *
 *   npx tsx scripts/preconLab/listes.ts fichier.txt     (valide et recompte)
 *
 * Importé comme `--lib` par le labo via `LISTES=fichier.txt`, le module
 * exporte `LIBRARY` : les listes du fichier, jouables telles quelles.
 */
export function lireListes(texte: string): DeckList[] {
  const listes: DeckList[] = [];
  let courante: { nom: string; deck?: string; navire?: string; cartes: string[] } | undefined;
  const fermer = () => {
    if (!courante) return;
    const base = PRECON_DECK_LISTS.find((d) => d.id === courante!.deck);
    if (!base) throw new Error(`${courante.nom} : deck inconnu « ${courante.deck} »`);
    listes.push({ ...base, id: `lab-${base.id}-${listes.length}`, name: courante.nom, shipId: courante.navire ?? base.shipId, cardIds: courante.cartes });
  };
  for (const brute of texte.split("\n")) {
    const ligne = brute.trim();
    if (!ligne || ligne.startsWith("#")) continue;
    const champ = /^(liste|deck|navire)\s*:\s*(.+)$/.exec(ligne);
    if (champ) {
      if (champ[1] === "liste") { fermer(); courante = { nom: champ[2]!.trim(), cartes: [] }; }
      else if (courante) courante[champ[1] === "deck" ? "deck" : "navire"] = champ[2]!.trim();
      continue;
    }
    const carte = /^([a-z0-9-]+)\s*[x×]\s*(\d+)$/.exec(ligne);
    if (!carte || !courante) throw new Error(`Ligne illisible : « ${ligne} »`);
    for (let i = 0; i < Number(carte[2]); i += 1) courante.cartes.push(carte[1]!);
  }
  fermer();
  return listes;
}

const fichier = process.env.LISTES;
export const LIBRARY: DeckList[] = fichier ? lireListes(readFileSync(fichier, "utf8")) : [];

if (process.argv[1]?.endsWith("listes.ts") && process.argv[2]) {
  let erreurs = 0;
  for (const liste of lireListes(readFileSync(process.argv[2], "utf8"))) {
    const v = validateDeckList(liste);
    const ok = v.ok && liste.cardIds.length === 40;
    if (!ok) erreurs += 1;
    console.log(`${ok ? "OK " : "KO "} ${liste.name} — ${liste.cardIds.length} cartes, Navire ${liste.shipId}${v.ok ? "" : ` — ${v.error}`}${liste.cardIds.length !== 40 ? " — il faut exactement 40 cartes" : ""}`);
  }
  process.exit(erreurs ? 1 : 0);
}
