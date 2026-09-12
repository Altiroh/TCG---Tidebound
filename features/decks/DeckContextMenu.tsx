"use client";

import { useEffect, useRef, useState } from "react";
import shell from "@/features/shell/ScreenShell.module.css";

export interface DeckContextMenuProps {
  x: number;
  y: number;
  onRename: () => void;
  onEdit: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onClose: () => void;
}

/**
 * Menu contextuel du clic droit — même feuille de papier que le menu de
 * tri (`shell.inkMenuFixed`), simplement positionnée à la souris, plutôt
 * que le verre fumé sombre des tokens `game-ui` : sur cet écran, un menu
 * est une note posée sur la table.
 *
 * Mêmes déclencheurs de fermeture qu'un menu natif (clic extérieur, Échap).
 */
export function DeckContextMenu({ x, y, onRename, onEdit, onDuplicate, onDelete, onClose }: DeckContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x, y });

  // Reclampe dans la fenêtre une fois la taille réelle du menu connue (évite qu'il déborde à droite/en bas d'un clic près du bord).
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const clampedX = Math.min(x, window.innerWidth - rect.width - 8);
    const clampedY = Math.min(y, window.innerHeight - rect.height - 8);
    setPos({ x: Math.max(8, clampedX), y: Math.max(8, clampedY) });
  }, [x, y]);

  useEffect(() => {
    function handlePointerDown(event: PointerEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) onClose();
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  return (
    <div ref={ref} style={{ left: pos.x, top: pos.y }} className={shell.inkMenuFixed}>
      <button type="button" className={shell.inkOption} onClick={onRename}>
        <PencilIcon /> Renommer
      </button>
      <button type="button" className={shell.inkOption} onClick={onEdit}>
        <EditIcon /> Éditer
      </button>
      <button type="button" className={shell.inkOption} onClick={onDuplicate}>
        <DuplicateIcon /> Dupliquer
      </button>
      <div className={shell.inkMenuRule} />
      <button type="button" className={shell.inkOptionDanger} onClick={onDelete}>
        <TrashIcon /> Supprimer
      </button>
    </div>
  );
}

function PencilIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4 shrink-0" aria-hidden>
      <path d="M4 20h4L19 9l-4-4L4 16v4z" stroke="currentColor" strokeWidth={1.6} strokeLinejoin="round" />
    </svg>
  );
}

function EditIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4 shrink-0" aria-hidden>
      <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" />
      <rect x="3.5" y="3.5" width="17" height="17" rx="3" stroke="currentColor" strokeWidth={1.3} opacity={0.5} />
    </svg>
  );
}

function DuplicateIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4 shrink-0" aria-hidden>
      <rect x="8" y="8" width="12" height="12" rx="2" stroke="currentColor" strokeWidth={1.6} />
      <path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" stroke="currentColor" strokeWidth={1.6} />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4 shrink-0" aria-hidden>
      <path
        d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2m2 0-.8 12.1a2 2 0 0 1-2 1.9H9.8a2 2 0 0 1-2-1.9L7 7h10z"
        stroke="currentColor"
        strokeWidth={1.6}
        strokeLinejoin="round"
      />
    </svg>
  );
}
