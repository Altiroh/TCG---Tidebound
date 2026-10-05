"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { rarityForCardId } from "@/game/boosters/cardRarity";
import { CORE_SET, isAbyssalVariant, type CardDefinition, type CardType } from "@/game";
import { CardTile } from "@/features/match/CardTile";
import { NouveauCadreCard } from "@/features/cadre-preview/NouveauCadreCard";

/** La carte de la maquette d'abord, puis une carte par type (une sans stats, une Résistance seule…), puis deux Abyssales, puis le texte le plus long du catalogue (zone qui défile). */
const MAQUETTE_ID = "la-bete-quon-nattend-plus";
const TYPES: CardType[] = ["creature", "marin", "equipement", "structure", "objet", "anomalie", "lande"];

function echantillon(): CardDefinition[] {
  const maquette = CORE_SET.find((card) => card.id === MAQUETTE_ID);
  const parType = TYPES.map((type) => CORE_SET.find((card) => card.type === type && card.id !== MAQUETTE_ID)).filter(
    (card): card is CardDefinition => card !== undefined
  );
  const abyssales = CORE_SET.filter(isAbyssalVariant).slice(0, 2);
  const texteLePlusLong = CORE_SET.reduce((longest, card) => ((card.text?.length ?? 0) > (longest.text?.length ?? 0) ? card : longest));
  return [...(maquette ? [maquette] : []), ...parType, ...abyssales, texteLePlusLong];
}

/**
 * Labo du NOUVEAU CADRE : chaque carte en nouveau rendu (standard ou
 * légendaire) à côté du rendu actuel de `CardTile`, à la même largeur.
 */
export function CadrePreview() {
  const [legendaire, setLegendaire] = useState(false);
  const [largeur, setLargeur] = useState(260);
  const [comparer, setComparer] = useState(true);
  // `?cartes=id1,id2` : une liste précise plutôt que l'échantillon.
  const demandees = (useSearchParams().get("cartes") ?? "").split(",").filter(Boolean);
  const cartes = demandees.length > 0 ? CORE_SET.filter((def) => demandees.includes(def.id)) : echantillon();

  return (
    <main className="min-h-dvh bg-slate-950 p-6 text-slate-100">
      <header className="mb-6 flex flex-wrap items-center gap-6">
        <h1 className="text-xl font-semibold [font-family:var(--font-card-title)]">Nouveau cadre — test</h1>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={legendaire} onChange={(event) => setLegendaire(event.target.checked)} />
          Cadre légendaire
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={comparer} onChange={(event) => setComparer(event.target.checked)} />
          Comparer à l&apos;ancien
        </label>
        <label className="flex items-center gap-2 text-sm">
          Largeur
          <input type="range" min={120} max={420} value={largeur} onChange={(event) => setLargeur(Number(event.target.value))} />
          <span className="tabular-nums">{largeur}px</span>
        </label>
      </header>

      <div className="flex flex-wrap gap-8">
        {cartes.map((def) => (
          <div key={def.id} className="flex gap-3">
            <div style={{ width: largeur }}>
              <NouveauCadreCard def={def} legendaire={legendaire || rarityForCardId(def.id) === "legendary"} widthClassName="w-full" />
            </div>
            {comparer && (
              <div style={{ width: largeur }} className="opacity-90">
                <CardTile
                  instance={{
                    instanceId: `ancien-${def.id}`,
                    cardId: def.id,
                    ownerId: "preview",
                    damageMarked: 0,
                    modifiers: [],
                    summoningSick: false,
                    hasAttackedThisTurn: false,
                  }}
                  tideState="calme"
                  widthClassName="w-full"
                  scaleOnHover={false}
                  showStatusBadges={false}
                />
              </div>
            )}
          </div>
        ))}
      </div>
    </main>
  );
}
