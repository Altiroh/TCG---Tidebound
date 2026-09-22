import { readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { CORE_SET } from "@/game/cards/sets/core";

/**
 * COUVERTURE DES ILLUSTRATIONS.
 *
 * Une carte sans visuel ne casse rien : elle s'affiche avec un cadre vide,
 * et personne ne s'en aperçoit avant de la tirer dans un booster. C'est
 * exactement le genre de trou qu'un test attrape mieux qu'une relecture —
 * d'où celui-ci, ajouté le 22/09/2026 avec les 48 visuels du Lot 14.
 *
 * Il garde aussi la règle d'assets du projet : **jamais de PNG commité**
 * (CLAUDE.md). Les sources passent par
 * `node scripts/optimizeImages.mjs --delete-sources`, qui les convertit en
 * WebP et les redimensionne à la taille réellement affichée. Les 48
 * illustrations du Lot 14 sont arrivées en PNG — 122 Mo, embarqués dans
 * chaque déploiement.
 */

const DOSSIER = path.join(process.cwd(), "public", "assets", "cards", "illustrations");

/**
 * Cartes dont le visuel manque encore, avec la raison. ANTÉRIEURES au
 * Lot 14 — toutes deux ajoutées sans leur illustration :
 *
 *  - `le-role-dequipage` : deuxième carte de la paire anti-swarm du
 *    21/09/2026, livrée en même temps que La Nasse Trop Pleine, qui a eu
 *    son visuel et pas elle ;
 *  - `albatros-de-mauvais-temps` : volatile du Lot 12.
 *
 * Cette liste doit RÉTRÉCIR. Y ajouter une entrée demande la même chose
 * qu'ailleurs : une raison écrite, pas un contournement.
 */
const SANS_VISUEL: Record<string, string> = {
  "le-role-dequipage": "Lot anti-swarm du 21/09/2026 : livrée sans son illustration.",
  "albatros-de-mauvais-temps": "Lot 12 — Rapiécer la Coque : livrée sans son illustration.",
};

const fichiers = new Set(readdirSync(DOSSIER));

describe("illustrations du catalogue", () => {
  it("chaque carte a son illustration en WebP", () => {
    const manquantes = CORE_SET.filter(
      (def) => !fichiers.has(`${def.id}.webp`) && SANS_VISUEL[def.id] === undefined
    ).map((def) => def.id);

    expect(manquantes, `\nCartes sans illustration :\n${manquantes.map((id) => `- ${id}`).join("\n")}\n`).toEqual([]);
  });

  it("aucune illustration n'est commitée en PNG ou JPG", () => {
    // La conversion n'est pas une optimisation cosmétique : les sources
    // pèsent ~2,5 Mo pièce et `public/` part en entier à chaque
    // déploiement. Le Lot 14 seul faisait 122 Mo avant passage du script.
    const sources = [...fichiers].filter((nom) => /\.(png|jpe?g)$/i.test(nom));
    expect(sources, `\nÀ convertir : node scripts/optimizeImages.mjs --delete-sources\n${sources.join("\n")}\n`).toEqual([]);
  });

  it("chaque exception est motivée, et ne survit pas à son illustration", () => {
    for (const [cardId, motif] of Object.entries(SANS_VISUEL)) {
      expect(motif.trim().length, `${cardId} : une exception sans motif est refusée`).toBeGreaterThan(10);
      // Le visuel est arrivé : l'exception doit partir avec lui.
      expect(fichiers.has(`${cardId}.webp`), `${cardId} a désormais son illustration — retire-le de SANS_VISUEL`).toBe(false);
      expect(CORE_SET.some((def) => def.id === cardId), `${cardId} n'existe plus au catalogue`).toBe(true);
    }
  });
});

describe("identités d'archétype du Lot 14", () => {
  it("Le Naufragé Impossible est un Un Dead, Le Dernier Rempart une Cavalerie", () => {
    // Notion « Nécessaire du Marin — Lot 14 », 22/09/2026. Sous-type ET
    // archétype, comme toutes les cartes du Lot 13 : le premier sert au
    // ciblage, le second aux comptages.
    const naufrage = CORE_SET.find((def) => def.id === "le-naufrage-impossible")!;
    expect([naufrage.subtype, naufrage.archetype]).toEqual(["un-dead", "un-dead"]);

    const rempart = CORE_SET.find((def) => def.id === "le-dernier-rempart")!;
    expect([rempart.subtype, rempart.archetype]).toEqual(["cavalerie", "cavalerie"]);
  });

  it("le reste du lot n'appartient à aucune famille — c'est un lot de consolidation", () => {
    const lot = CORE_SET.filter((def) => def.setCode === "necessaire-du-marin");
    const familiales = lot.filter((def) => def.archetype !== undefined).map((def) => def.id);
    expect(familiales.sort()).toEqual(["le-dernier-rempart", "le-naufrage-impossible"]);
  });
});
