"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import styles from "@/features/collection/CollectionScreen.module.css";
import { playButtonClick } from "@/lib/sound";

interface NavigationTabProps {
  children: ReactNode;
  active?: boolean;
  href?: string;
  onClick?: () => void;
}

/** Un onglet du header (RETOUR / COLLECTION / DECKS) — lien si `href`, bouton sinon. */
export function NavigationTab({ children, active = false, href, onClick }: NavigationTabProps) {
  const className = active ? styles.navTabActive : styles.navTab;

  function handleClick() {
    playButtonClick();
    onClick?.();
  }

  if (href) {
    return (
      <Link href={href} className={className} onClick={() => playButtonClick()}>
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
