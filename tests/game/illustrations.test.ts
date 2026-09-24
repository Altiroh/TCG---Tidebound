import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { CORE_SET } from "@/game/cards/sets/core";
import { SHELF_BOOSTER_IDS } from "@/game/boosters/extensions";
import { DEFAULT_PACK_VISUAL, getBoosterPackVisual } from "@/features/boosters/opening/boosterPackVisuals";
import { STANDARD_BOOSTER_ID } from "@/game/economy/constants";

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
 * Cartes dont le visuel manque encore, avec la raison.
 *
 * VIDE depuis le 22/09/2026 : les deux dernières — Le Rôle d'Équipage et
 * Albatros de Mauvais Temps, toutes deux livrées sans leur illustration
 * dans des lots antérieurs — ont reçu la leur le jour même où ce test les
 * a nommées. C'était tout son objet.
 *
 * Y ajouter une entrée demande la même chose qu'ailleurs : une raison
 * écrite, pas un contournement. Et l'exception ne survit pas à l'arrivée
 * de son visuel — le troisième test le refuse.
 */
const SANS_VISUEL: Record<string, string> = Object.fromEntries(
  // Lot 15 — Éclats en Selle, transcrit le 23/09/2026 depuis Notion : le lot
  // est arrivé en texte. Les 25 Sentinelles Chromatiques ont reçu leurs
  // illustrations le 23/09, l'Équipage de Verre et ses cartes neutres le
  // 24/09 ; restent la Cavalerie, ses cartes neutres et La Mauvaise
  // Réputation (en production). Le troisième test refuse une exception
  // survivant à son WebP.
  CORE_SET.filter(
    (def) =>
      def.setCode === "eclats-en-selle" &&
      (def.archetype === "cavalerie" ||
        ["selle-de-guerre", "harnais-de-retenue", "debusquer", "ouvrez-la-ligne", "pas-un-pas-de-plus", "la-mauvaise-reputation"].includes(def.id))
  ).map((def) => [def.id, "Lot 15 — Éclats en Selle : illustration pas encore livrée."])
);

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

describe("visuels de sachet", () => {
  /**
   * Un booster dont le visuel pointe encore sur celui d'un autre s'affiche
   * et s'ouvre parfaitement — c'est bien le problème. Le Nécessaire du
   * Marin a vécu une journée avec les images du Défaut, et rien ne l'aurait
   * signalé.
   */
  it("chaque booster du rayon a ses trois images, et ne les emprunte à personne", () => {
    for (const boosterId of SHELF_BOOSTER_IDS) {
      const visual = getBoosterPackVisual(boosterId);

      // Retomber sur le visuel par défaut, c'est n'en avoir aucun. Seul le
      // Défaut lui-même a le droit d'être le défaut — et son dossier
      // s'appelle « defaut » là où son identifiant de booster est
      // « standard », un écart de nommage historique.
      if (boosterId !== STANDARD_BOOSTER_ID) {
        expect(visual.id, `${boosterId} retombe sur le visuel par défaut`).not.toBe(DEFAULT_PACK_VISUAL.id);
      }

      for (const [role, url] of Object.entries(visual.assets)) {
        const chemin = path.join(process.cwd(), "public", url.replace(/^\//, ""));
        expect(existsSync(chemin), `${boosterId} / ${role} : ${url} est introuvable`).toBe(true);
        // Les trois fichiers d'un sachet vivent dans SON dossier : un
        // chemin qui pointe ailleurs est un emprunt, pas un visuel.
        expect(url.startsWith(`/assets/boosters/${visual.id}/`), `${boosterId} / ${role} emprunte ${url}`).toBe(true);
      }
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
    // Le Brise-Ligne a rejoint l'Équipage de Verre avec le Lot 15 (Notion,
    // 23/09/2026) : un rattachement de famille, pas un changement de texte.
    expect(familiales.sort()).toEqual(["le-brise-ligne", "le-dernier-rempart", "le-naufrage-impossible"]);
  });
});
