"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  CHROMATIC_COLOR_LABELS,
  chromaticColorsOf,
  findAssemblage,
  getCardDefinition,
  isSentinel,
  type CardInstance,
  type ChromaticColor,
} from "@/game";
import { CardCarousel } from "@/features/match/CardCarousel";
import { CardTile } from "@/features/match/CardTile";
import { playButtonClick } from "@/lib/sound";

/** Le joueur a ce temps pour répondre ; passé ce délai, l'invite se referme comme un « Non ». */
const CONFIRM_TIMEOUT_MS = 30_000;

interface AssemblagePromptProps {
  /** La carte à Assemblage que le joueur veut jouer (Le Géant Chromatique). */
  card: CardInstance;
  /** Plateau du joueur : les Sentinelles s'y choisissent. */
  board: CardInstance[];
  /** Assemblage confirmé : les Sentinelles et la couleur que chacune porte. */
  onAssemble: (assemblage: Array<{ instanceId: string; color: ChromaticColor }>) => void;
  /** Jouer la carte à son coût normal. */
  onPlayNormally: () => void;
  onCancel: () => void;
  /**
   * Assemblage déjà proposé (carte lâchée sur une Sentinelle) : l'invite se
   * réduit à Oui / Non, avec un compte à rebours. Absent : le joueur
   * désigne ses Sentinelles.
   */
  proposal?: Array<{ instanceId: string; color: ChromaticColor }>;
  /** Depuis l'invite Oui / Non : désigner d'autres Sentinelles que celles proposées. */
  onChooseOthers?: () => void;
}

/**
 * « Assemblage Chromatique » (Lot 15) : le joueur désigne les Sentinelles
 * qu'il place au Cimetière — c'est SA décision, le moteur ne choisit pas
 * lesquelles partent. Seule l'affectation des couleurs, pour une Sentinelle
 * qui en porte plusieurs, est déduite : n'importe quelle affectation valide
 * de ces Sentinelles-là donne le même Assemblage.
 */
export function AssemblagePrompt(props: AssemblagePromptProps) {
  return props.proposal ? <AssemblageConfirm {...props} proposal={props.proposal} /> : <AssemblageChooser {...props} />;
}

/**
 * Carte lâchée sur une Sentinelle : « Assembler avec celles-ci ? ». Même
 * verre que la fenêtre de réaction (`ReactionPrompt`) — c'est la même sorte
 * de décision — et même délai : 30 s, puis l'invite se referme comme un
 * « Non », la carte reste en main.
 */
function AssemblageConfirm({
  card,
  board,
  proposal,
  onAssemble,
  onCancel,
  onChooseOthers,
}: AssemblagePromptProps & { proposal: NonNullable<AssemblagePromptProps["proposal"]> }) {
  const def = getCardDefinition(card.cardId);
  const cout = def.chromaticAssemblage?.reasonCost ?? 0;
  const onCancelRef = useRef(onCancel);
  onCancelRef.current = onCancel;
  useEffect(() => {
    const id = setTimeout(() => onCancelRef.current(), CONFIRM_TIMEOUT_MS);
    return () => clearTimeout(id);
  }, []);

  const unites = proposal.map((part) => board.find((u) => u.instanceId === part.instanceId)).filter((u): u is CardInstance => Boolean(u));
  // D'autres Sentinelles pourraient servir : le joueur peut préférer les garder.
  const autresPossibles = board.filter(isSentinel).length > proposal.length;

  return (
    <div className="pointer-events-none fixed inset-0 z-[70] flex items-center justify-center p-4">
      <div
        role="dialog"
        aria-label={`Assemblage de ${def.name}`}
        className="pointer-events-auto relative w-full max-w-md overflow-hidden rounded-3xl bg-white/6 p-6 text-center backdrop-blur-[32px] backdrop-brightness-110 backdrop-saturate-150"
        style={{
          boxShadow:
            "inset 0 1px 1px rgba(255,255,255,0.5), inset 0 0 0 1px rgba(255,255,255,0.08), inset 0 -12px 24px -12px rgba(255,255,255,0.06), 0 24px 60px rgba(0,0,0,0.6)",
        }}
      >
        <div className="relative flex flex-col items-center gap-3">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-white/60">Assemblage Chromatique</p>
          <p className="text-base font-semibold text-white">Assembler {def.name} ?</p>
          <div className="flex justify-center gap-2">
            {unites.map((unit) => (
              <div key={unit.instanceId} className="pointer-events-none flex w-16 flex-col items-center gap-1">
                <CardTile instance={unit} tideState="calme" widthClassName="w-full" scaleOnHover={false} showStatusBadges={false} />
                <span className="text-[10px] text-white/70">
                  {CHROMATIC_COLOR_LABELS[proposal.find((p) => p.instanceId === unit.instanceId)!.color]}
                </span>
              </div>
            ))}
          </div>
          <p className="text-xs leading-snug text-white/60">
            Ces {proposal.length} Sentinelles vont au Cimetière sans être détruites — elles ne laissent pas d&apos;Éclat.
          </p>
          <span className="rounded-full bg-white/10 px-2.5 py-0.5 text-[11px] font-medium text-white/70">{cout} Raison</span>
          <div className="mt-1 flex items-center gap-3">
            <button
              type="button"
              onClick={() => {
                playButtonClick();
                onAssemble(proposal);
              }}
              className="rounded-full bg-emerald-400 px-7 py-2 text-sm font-semibold text-emerald-950 outline-none transition-colors hover:bg-emerald-300 focus-visible:ring-2 focus-visible:ring-emerald-200"
            >
              Oui
            </button>
            <button
              type="button"
              onClick={() => {
                playButtonClick();
                onCancel();
              }}
              className="rounded-full bg-white/10 px-7 py-2 text-sm font-semibold text-white outline-none transition-colors hover:bg-white/20 focus-visible:ring-2 focus-visible:ring-white/40"
            >
              Non
            </button>
          </div>
          <div className="mt-1 h-1 w-full max-w-[10rem] overflow-hidden rounded-full bg-white/15">
            <div className="reaction-countdown-fill h-full w-full bg-white/55" style={{ animationDuration: `${CONFIRM_TIMEOUT_MS}ms` }} />
          </div>
          {autresPossibles && onChooseOthers && (
            <button type="button" onClick={onChooseOthers} className="text-xs text-sky-200/80 underline-offset-2 hover:text-sky-100 hover:underline">
              Choisir d&apos;autres Sentinelles
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function AssemblageChooser({ card, board, onAssemble, onPlayNormally, onCancel }: AssemblagePromptProps) {
  const def = getCardDefinition(card.cardId);
  const requis = def.chromaticAssemblage?.sentinels ?? 4;
  const cout = def.chromaticAssemblage?.reasonCost ?? 0;
  const sentinelles = useMemo(() => board.filter(isSentinel), [board]);
  const [selected, setSelected] = useState<string[]>([]);

  const choisies = sentinelles.filter((unit) => selected.includes(unit.instanceId));
  const assemblage = choisies.length === requis ? findAssemblage(choisies, requis) : undefined;

  function toggle(unit: CardInstance) {
    setSelected((current) => {
      if (current.includes(unit.instanceId)) return current.filter((id) => id !== unit.instanceId);
      const next = [...current, unit.instanceId];
      return next.length > requis ? next.slice(next.length - requis) : next;
    });
  }

  return (
    <div className="fixed inset-0 z-[85] flex items-center justify-center bg-black/70 p-6 backdrop-blur-md">
      <div
        role="dialog"
        aria-label={`Assemblage de ${def.name}`}
        className="relative flex max-h-[92dvh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-white/15 bg-white/[0.06] shadow-[0_8px_40px_rgba(0,0,0,0.6)] backdrop-blur-2xl"
      >
        <div className="relative flex flex-col items-center gap-1 px-6 pb-3 pt-7 text-center">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Assemblage Chromatique</p>
          <h2 className="text-2xl font-semibold text-white [font-family:var(--font-card-title)]">{def.name}</h2>
          <p className="max-w-2xl text-sm text-slate-300">
            Désigne {requis} Sentinelles de couleurs différentes : elles vont au Cimetière sans être détruites, et la
            carte se joue pour {cout} Raison.
          </p>
        </div>

        <div className="relative pb-2">
          <CardCarousel
            cards={sentinelles}
            selectedInstanceIds={selected}
            onSelect={toggle}
            renderCaption={(unit) => (
              <span className="text-xs text-slate-300">
                {chromaticColorsOf(unit, board)
                  .map((color) => CHROMATIC_COLOR_LABELS[color])
                  .join(" · ") || "Sans couleur"}
              </span>
            )}
            emptyLabel="Aucune Sentinelle en jeu."
          />
        </div>

        <div className="relative flex flex-wrap items-center justify-end gap-2 border-t border-white/10 px-6 py-4">
          <span className="mr-auto text-sm text-slate-400">
            {choisies.length}/{requis} désignées
            {choisies.length === requis && !assemblage ? " — il faut des couleurs différentes" : ""}
          </span>
          <button type="button" onClick={onCancel} className="rounded-md px-4 py-2 text-sm text-slate-300 hover:text-white">
            Annuler
          </button>
          <button
            type="button"
            onClick={onPlayNormally}
            className="rounded-md bg-white/10 px-4 py-2 text-sm font-semibold text-white hover:bg-white/20"
          >
            Coût normal ({def.cost} Raison)
          </button>
          <button
            type="button"
            disabled={!assemblage}
            onClick={() => assemblage && onAssemble(assemblage)}
            className="rounded-md bg-sky-600/80 px-4 py-2 text-sm font-semibold text-white shadow-[inset_0_0_0_1px_rgba(125,211,252,0.4)] transition-colors hover:bg-sky-500 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Assembler ({cout} Raison)
          </button>
        </div>
      </div>
    </div>
  );
}
