"use client";

import { useEffect, useState } from "react";

/** Clé locale qui allume le panneau (posée par `/diagnostic-ecran`). */
export const SCREEN_DIAGNOSTIC_KEY = "tidebound:diagnostic-ecran";

function describe(el: Element | null): string {
  if (!el) return "—";
  const r = el.getBoundingClientRect();
  const cls = typeof el.className === "string" ? el.className.split(" ")[0]?.replace(/__.*$/, "") : "";
  return `${el.tagName.toLowerCase()}${cls ? `.${cls}` : ""} [${Math.round(r.top)}→${Math.round(r.bottom)}]`;
}

/**
 * DIAGNOSTIC D'ÉCRAN EMBARQUÉ — temporaire (bande en bas de l'app installée
 * sur iPhone, 01/10). Allumé depuis `/diagnostic-ecran`, il mesure l'écran
 * COURANT : la racine de l'écran, le défilement du document, et la chaîne
 * d'éléments sous un point de la bande du bas. À retirer avec la page.
 */
export function ScreenDiagnostic() {
  const [on, setOn] = useState(false);
  const [lines, setLines] = useState<string[]>([]);

  useEffect(() => {
    try {
      setOn(window.localStorage.getItem(SCREEN_DIAGNOSTIC_KEY) === "1");
    } catch {
      setOn(false);
    }
  }, []);

  useEffect(() => {
    if (!on) return;
    function measure() {
      const root = document.querySelector("[data-backdrop]") ?? document.querySelector("main") ?? document.body.firstElementChild;
      const chain: string[] = [];
      for (let el = root; el && chain.length < 6; el = el.parentElement) chain.push(describe(el));
      const below: string[] = [];
      for (let el = document.elementFromPoint(window.innerWidth / 2, window.innerHeight - 8); el && below.length < 6; el = el.parentElement) {
        below.push(describe(el));
      }
      const rootStyle = root ? getComputedStyle(root) : null;
      const scroller = document.scrollingElement;
      setLines([
        `${location.pathname} · inner ${window.innerHeight} · html ${document.documentElement.clientHeight} · body ${Math.round(document.body.getBoundingClientRect().height)}`,
        `défilement : scrollTop ${Math.round(scroller?.scrollTop ?? 0)} · scrollHeight ${scroller?.scrollHeight} · vv.offsetTop ${Math.round(window.visualViewport?.offsetTop ?? 0)}`,
        `racine : height ${rootStyle?.height} · position ${rootStyle?.position} · transform ${rootStyle?.transform}`,
        `racine → parents : ${chain.join(" ‹ ")}`,
        `sous la bande du bas : ${below.join(" ‹ ")}`,
      ]);
    }
    measure();
    const timer = window.setInterval(measure, 1000);
    return () => window.clearInterval(timer);
  }, [on]);

  if (!on) return null;
  return (
    <div
      style={{
        position: "fixed",
        top: 4,
        left: "50%",
        zIndex: 2147483646,
        transform: "translateX(-50%)",
        maxWidth: "70vw",
        padding: "6px 10px",
        borderRadius: 8,
        background: "rgba(0, 0, 0, 0.85)",
        color: "#fde047",
        font: "11px/1.4 ui-monospace, monospace",
        pointerEvents: "none",
      }}
    >
      {lines.map((line) => (
        <p key={line} style={{ margin: 0, wordBreak: "break-word" }}>
          {line}
        </p>
      ))}
    </div>
  );
}
