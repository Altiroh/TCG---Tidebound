"use client";

import { useEffect, useRef, useState } from "react";
import { getCardDefinition, isAbyssalVariant, type PendingReactionCandidate } from "@/game";
import { useImageOk } from "@/features/match/useImageOk";
import { playButtonClick } from "@/lib/sound";

/** Le joueur a ce temps pour répondre avant que la fenêtre se referme d'elle-même (équivaut à "Non"). */
const TIMEOUT_MS = 60_000;

/**
 * Zone tactile de 44 px autour d'une croix de 28 px : un `::before`
 * invisible, 8 px de débord de chaque côté — rien ne grossit à l'écran.
 */
const TOUCH_TARGET_44 = "before:absolute before:-inset-2 before:content-['']";

/**
 * Boutons de réponse sur un téléphone couché : 44 px de haut, et ils se
 * partagent la largeur de la bande (Non / Non merci en grand, c'est la
 * sortie qu'on cherche du pouce).
 */
const COMPACT_BUTTON =
  "[@media(max-height:520px)]:min-h-11 [@media(max-height:520px)]:flex-1 [@media(max-height:520px)]:px-3 [@media(pointer:coarse)]:min-h-11";

function candidateKey(candidate: PendingReactionCandidate): string {
  return `${candidate.sourceInstanceId}:${candidate.abilityIndex}`;
}

interface ReactionPromptProps {
  candidates: PendingReactionCandidate[];
  /** Reçoit les candidats cochés (au moins un) — MatchBoard/OnlineBoard les appliquent en une seule fois, sans rouvrir la fenêtre entre chacun. */
  onActivateMany: (candidates: PendingReactionCandidate[]) => void;
  onPass: () => void;
}

/**
 * Invitation à activer une ou plusieurs capacités facultatives — recentrée
 * à l'écran, en verre translucide plutôt que la barre ancrée en haut du
 * plateau : c'est une vraie décision de jeu, elle mérite l'attention
 * pleine du joueur.
 *
 * Volontairement PAS un modal bloquant : le fond n'assombrit pas le
 * plateau (`pointer-events-none` sur le calque plein écran, seul le
 * panneau capte les clics) — le joueur doit continuer à voir la partie
 * derrière le verre, pas une éclipse noire dessus.
 *
 * Un seul candidat (cas très largement majoritaire) : question directe,
 * Oui/Non. Plusieurs candidats en même temps (rare) : à cocher, une ligne
 * par carte (miniature + effet), pour tout appliquer en une seule
 * confirmation plutôt que de faire réapparaître la fenêtre carte par
 * carte.
 *
 * Hauteur bornée à l'écran (zone sûre comprise) : ce qui est long défile,
 * les boutons de réponse jamais. Sur un téléphone couché, le panneau se
 * range en bande contre le bord droit (cf. le calque ci-dessous).
 *
 * Un compte à rebours d'une minute (barre sous le bouton de refus) referme la
 * fenêtre automatiquement — jamais bloquer la partie indéfiniment en
 * attente d'une décision facultative.
 */
export function ReactionPrompt({ candidates, onActivateMany, onPass }: ReactionPromptProps) {
  const onPassRef = useRef(onPass);
  onPassRef.current = onPass;

  // Démarré une seule fois au montage (une nouvelle fenêtre = un nouveau montage, le parent ne rend ce
  // composant que pendant qu'elle est ouverte) — jamais réarmé par un re-render du parent, seul le callback
  // appelé reste à jour via `onPassRef`.
  useEffect(() => {
    const id = setTimeout(() => onPassRef.current(), TIMEOUT_MS);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handlePass() {
    playButtonClick();
    onPass();
  }

  return (
    // Téléphone couché (≤ 520 px de haut) : le panneau quitte le centre et se
    // range en bande contre le bord DROIT. C'est là que le plateau porte la
    // pioche, le Cimetière et le rail (Tour, Journal, Phase) — rien qu'une
    // réaction vise. Le bord bas, lui, porte la main et la rangée du joueur :
    // une bande en bas cacherait précisément les cibles.
    <div
      className="pointer-events-none fixed inset-0 z-[70] flex items-center justify-center [@media(max-height:520px)]:justify-end"
      style={{
        padding:
          "calc(1rem + var(--tb-safe-top)) calc(1rem + var(--tb-safe-right)) calc(1rem + var(--tb-safe-bottom)) calc(1rem + var(--tb-safe-left))",
      }}
    >
      <div
        className="pointer-events-auto relative flex max-h-full w-full max-w-sm flex-col overflow-hidden rounded-3xl bg-white/6 p-6 text-center backdrop-blur-[32px] backdrop-brightness-110 backdrop-saturate-150 [@media(max-height:520px)]:max-w-[15rem] [@media(max-height:520px)]:p-4"
        style={{
          boxShadow:
            "inset 0 1px 1px rgba(255,255,255,0.5), inset 0 0 0 1px rgba(255,255,255,0.08), inset 0 -12px 24px -12px rgba(255,255,255,0.06), 0 24px 60px rgba(0,0,0,0.6)",
        }}
      >
        {/* Léger reflet en haut à gauche — le grain "verre liquide" (courbure qui capte la lumière), pas un
            aplat de couleur qui recouvrirait toute la carte et masquerait le flou du fond derrière. */}
        <div className="pointer-events-none absolute -left-6 -top-10 h-32 w-32 rounded-full bg-white/25 blur-2xl" aria-hidden />

        <button
          type="button"
          onClick={handlePass}
          aria-label="Refuser"
          className={`absolute right-3 top-3 z-10 flex h-7 w-7 items-center justify-center rounded-full text-white/60 outline-none transition-colors hover:bg-white/15 hover:text-white focus-visible:ring-2 focus-visible:ring-white/40 ${TOUCH_TARGET_44}`}
        >
          <svg viewBox="0 0 24 24" fill="none" className="h-3.5 w-3.5">
            <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth={2} strokeLinecap="round" />
          </svg>
        </button>

        {candidates.length === 1 ? (
          <SingleCandidate candidate={candidates[0]!} onActivate={() => onActivateMany([candidates[0]!])} onPass={handlePass} />
        ) : (
          <MultipleCandidates candidates={candidates} onActivateMany={onActivateMany} onPass={handlePass} />
        )}
      </div>
    </div>
  );
}

/** Vignette d'illustration seule (même langage que `DeckSlotRow`) — pas la carte entière avec son cadre/stats. */
function CardThumb({ cardId, className = "h-16 w-16" }: { cardId: string; className?: string }) {
  const def = getCardDefinition(cardId);
  const isAbyssal = isAbyssalVariant(def);
  const debordUrl = `/assets/cards/illustrations/${cardId}-debord.webp`;
  const debordOk = useImageOk(isAbyssal ? debordUrl : "");

  return (
    <span className={`relative block shrink-0 overflow-hidden rounded-xl shadow-[0_4px_14px_rgba(0,0,0,0.45)] ${className}`}>
      {/* eslint-disable-next-line @next/next/no-img-element -- vignette, pas une CardTile complète */}
      <img
        src={`/assets/cards/illustrations/${cardId}.webp`}
        alt=""
        loading="lazy"
        decoding="async"
        className="absolute inset-0 h-full w-full object-cover"
      />
      {isAbyssal && debordOk && (
        // eslint-disable-next-line @next/next/no-img-element -- calque de débord Abyssal, cf. CardTile
        <img
          src={debordUrl}
          alt=""
          loading="lazy"
          decoding="async"
          className="pointer-events-none absolute inset-0 h-full w-full object-contain"
        />
      )}
    </span>
  );
}

/** Barre qui s'épuise sous le bouton de refus, cf. `@keyframes reaction-countdown` (app/globals.css). */
function CountdownBar() {
  return (
    <div className="mt-1 h-1 w-full max-w-[10rem] shrink-0 overflow-hidden rounded-full bg-white/15">
      <div className="reaction-countdown-fill h-full w-full bg-white/55" style={{ animationDuration: `${TIMEOUT_MS}ms` }} />
    </div>
  );
}

function SingleCandidate({
  candidate,
  onActivate,
  onPass,
}: {
  candidate: PendingReactionCandidate;
  onActivate: () => void;
  onPass: () => void;
}) {
  const def = getCardDefinition(candidate.cardId);
  const ability = def.abilities?.[candidate.abilityIndex];

  function handleActivate() {
    playButtonClick();
    onActivate();
  }

  return (
    <div className="relative flex min-h-0 flex-col items-center gap-3 pt-1 [@media(max-height:520px)]:gap-2">
      {/* Le texte défile s'il est long ; Oui / Non restent hors de cette zone. */}
      <div className="flex min-h-0 w-full flex-col items-center gap-3 overflow-y-auto overscroll-contain [@media(max-height:520px)]:gap-2">
        <CardThumb cardId={candidate.cardId} className="h-16 w-16 [@media(max-height:520px)]:h-12 [@media(max-height:520px)]:w-12" />

        {/* Ce que ça fait d'abord — se lit en un coup d'œil, avant la question. */}
        <p className="text-sm font-semibold leading-snug text-white">{ability?.description ?? def.text}</p>

        <p className="text-xs leading-snug text-white/60">{`Voulez-vous appliquer l'effet de ${def.name} ?`}</p>

        {candidate.reasonCost > 0 && (
          <span className="rounded-full bg-white/10 px-2.5 py-0.5 text-[11px] font-medium text-white/70">
            {candidate.reasonCost} Raison
          </span>
        )}
      </div>

      <div className="mt-1 flex shrink-0 items-center gap-3 [@media(max-height:520px)]:w-full [@media(max-height:520px)]:gap-2">
        <button
          type="button"
          onClick={handleActivate}
          className={`rounded-full bg-emerald-400 px-7 py-2 text-sm font-semibold text-emerald-950 outline-none transition-colors hover:bg-emerald-300 focus-visible:ring-2 focus-visible:ring-emerald-200 ${COMPACT_BUTTON}`}
        >
          Oui
        </button>
        <button
          type="button"
          onClick={onPass}
          className={`rounded-full bg-white/10 px-7 py-2 text-sm font-semibold text-white outline-none transition-colors hover:bg-white/20 focus-visible:ring-2 focus-visible:ring-white/40 ${COMPACT_BUTTON}`}
        >
          Non
        </button>
      </div>

      <CountdownBar />
    </div>
  );
}

function MultipleCandidates({
  candidates,
  onActivateMany,
  onPass,
}: {
  candidates: PendingReactionCandidate[];
  onActivateMany: (candidates: PendingReactionCandidate[]) => void;
  onPass: () => void;
}) {
  const [checked, setChecked] = useState<Set<string>>(() => new Set());

  function toggle(candidate: PendingReactionCandidate) {
    playButtonClick();
    const key = candidateKey(candidate);
    setChecked((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function handleApply() {
    const selected = candidates.filter((c) => checked.has(candidateKey(c)));
    if (selected.length === 0) return;
    playButtonClick();
    onActivateMany(selected);
  }

  return (
    <div className="relative flex min-h-0 flex-col items-center gap-3 pt-1 [@media(max-height:520px)]:gap-2">
      <p className="shrink-0 text-sm font-semibold text-white">Ces cartes peuvent réagir</p>

      {/* Une ligne par carte — miniature + effet côte à côte, jamais une grille de vignettes muettes.
          La liste défile dès qu'elle dépasse ; Appliquer / Non merci restent dessous, hors défilement. */}
      <div className="flex min-h-0 w-full flex-col gap-1.5 overflow-y-auto overscroll-contain">
        {candidates.map((candidate) => {
          const def = getCardDefinition(candidate.cardId);
          const ability = def.abilities?.[candidate.abilityIndex];
          const isChecked = checked.has(candidateKey(candidate));
          return (
            <button
              key={candidateKey(candidate)}
              type="button"
              onClick={() => toggle(candidate)}
              aria-pressed={isChecked}
              className={`flex w-full shrink-0 items-center gap-3 rounded-2xl p-2 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-white/40 ${
                isChecked ? "bg-white/15" : "hover:bg-white/10"
              }`}
            >
              <span
                aria-hidden
                className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition-colors ${
                  isChecked ? "border-emerald-300 bg-emerald-400" : "border-white/35 bg-transparent"
                }`}
              >
                {isChecked && (
                  <svg viewBox="0 0 24 24" fill="none" className="h-3 w-3">
                    <path d="M5 12l5 5L19 7" stroke="#052e1e" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </span>

              <CardThumb cardId={candidate.cardId} className="h-12 w-12 [@media(max-height:520px)]:h-10 [@media(max-height:520px)]:w-10" />

              <span className="min-w-0 flex-1">
                <span className="block text-xs leading-snug text-white">{ability?.description ?? def.text}</span>
                {candidate.reasonCost > 0 && <span className="mt-0.5 block text-[11px] font-medium text-white/50">{candidate.reasonCost} Raison</span>}
              </span>
            </button>
          );
        })}
      </div>

      <div className="mt-1 flex shrink-0 items-center gap-3 [@media(max-height:520px)]:w-full [@media(max-height:520px)]:gap-2">
        <button
          type="button"
          onClick={handleApply}
          disabled={checked.size === 0}
          className={`rounded-full bg-emerald-400 px-7 py-2 text-sm font-semibold text-emerald-950 outline-none transition-colors hover:bg-emerald-300 focus-visible:ring-2 focus-visible:ring-emerald-200 disabled:cursor-not-allowed disabled:bg-white/10 disabled:text-white/40 ${COMPACT_BUTTON}`}
        >
          Appliquer{checked.size > 0 ? ` (${checked.size})` : ""}
        </button>
        <button
          type="button"
          onClick={onPass}
          className={`rounded-full bg-white/10 px-7 py-2 text-sm font-semibold text-white outline-none transition-colors hover:bg-white/20 focus-visible:ring-2 focus-visible:ring-white/40 ${COMPACT_BUTTON}`}
        >
          Non merci
        </button>
      </div>

      <CountdownBar />
    </div>
  );
}
