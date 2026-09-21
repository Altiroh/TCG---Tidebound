"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import styles from "@/features/shell/ScreenShell.module.css";
import { playTabClick } from "@/lib/sound";

interface NavigationTabProps {
  children: ReactNode;
  active?: boolean;
  href?: string;
  onClick?: () => void;
}

/** Un libellé de navigation du header (Retour / Collection / Decks) — lien si `href`, bouton sinon. */
export function NavigationTab({ children, active = false, href, onClick }: NavigationTabProps) {
  const className = active ? styles.navTabActive : styles.navTab;

  function handleClick() {
    playTabClick();
    onClick?.();
  }

  if (href) {
    return (
      <Link href={href} className={className} onClick={() => playTabClick()}>
        {children}
      </Link>
    );
  }

  return (
    <button type="button" className={className} onClick={handleClick}>
      {children}
    </button>
  );
}
