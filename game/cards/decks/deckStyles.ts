/**
 * LE TYPE DE JEU D'UN DECK — une liste FERMÉE, pas une phrase libre.
 *
 * Le catalogue écrit ses styles à la main, en toutes lettres et sans
 * contrainte (« Tempo / Volatiles », « Agressif / swarm ») : c'est riche à
 * lire, mais impossible à filtrer, à comparer ou à proposer dans un menu.
 * Le jour où le joueur peut désigner LUI-MÊME le type de son deck, il lui
 * faut un choix arrêté — sinon deux joueurs écrivent « aggro » et
 * « Agressif » et aucun des deux ne se retrouve dans la même case.
 *
 * Ces identifiants sont ceux de la base (`deck_style`, migration
 * `20260930120000_player_deck_profile.sql`) : les renommer casserait les
 * lignes déjà écrites. On en AJOUTE, on n'en renomme pas.
 */

export const DECK_STYLES = [
  { id: "agressif", label: "Agressif", hint: "Courbe basse, pression dès les premiers tours." },
  { id: "tempo", label: "Tempo", hint: "Petits corps rapides et cartes qui reprennent la main." },
  { id: "midrange", label: "Midrange", hint: "Polyvalent : de quoi répondre à chaque étape de la partie." },
  { id: "controle", label: "Contrôle", hint: "Répond, temporise, et gagne une fois la partie stabilisée." },
  { id: "defensif", label: "Défensif", hint: "Encaisse, rapièce, et laisse l'adversaire s'épuiser." },
  { id: "combo", label: "Combo", hint: "Assemble une poignée de cartes qui valent plus ensemble." },
] as const;

export type DeckStyleId = (typeof DECK_STYLES)[number]["id"];

export const DECK_STYLE_IDS: readonly DeckStyleId[] = DECK_STYLES.map((style) => style.id);

export function isDeckStyleId(value: unknown): value is DeckStyleId {
  return typeof value === "string" && DECK_STYLE_IDS.includes(value as DeckStyleId);
}

export function deckStyleLabel(id: DeckStyleId): string {
  return DECK_STYLES.find((style) => style.id === id)?.label ?? "—";
}

/** Sans accents ni casse : « Contrôle » et « controle » sont le même mot. */
function fold(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

/**
 * Les mots qui trahissent un type dans une phrase écrite à la main. Sert à
 * ranger les styles du CATALOGUE (« Tempo / contrôle léger ») dans une case
 * de l'énumération, sans toucher à leur libellé : la phrase reste affichée,
 * c'est elle qui dit l'intention ; l'identifiant, lui, sert à filtrer.
 */
const KEYWORDS: Readonly<Record<DeckStyleId, readonly string[]>> = {
  agressif: ["agress", "swarm", "assaut", "artillerie"],
  tempo: ["tempo"],
  midrange: ["midrange", "polyvalent"],
  controle: ["controle", "attrition"],
  defensif: ["defensif", "endurance", "lourd", "rapiecage"],
  combo: ["combo", "synergie", "sacrifice", "deraison"],
};

/**
 * Le type lu dans une phrase libre, ou `null` si rien ne s'y trouve —
 * « Environnemental » n'est ni de l'agression ni du contrôle, et le ranger
 * de force serait mentir au joueur.
 *
 * Le mot-clé qui apparaît le PLUS TÔT décide : « Tempo / contrôle léger »
 * est du tempo, pas du contrôle, c'est ce que son auteur a écrit en
 * premier. À égalité, l'ordre de `DECK_STYLES` tranche.
 */
export function deckStyleFromText(text: string): DeckStyleId | null {
  const folded = fold(text);
  let best: { id: DeckStyleId; at: number } | null = null;

  for (const style of DECK_STYLES) {
    for (const keyword of KEYWORDS[style.id]) {
      const at = folded.indexOf(keyword);
      if (at === -1) continue;
      if (!best || at < best.at) best = { id: style.id, at };
    }
  }

  return best?.id ?? null;
}
