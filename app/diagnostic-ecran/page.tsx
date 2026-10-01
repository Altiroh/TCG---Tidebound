"use client";

import { useEffect, useRef, useState } from "react";

/**
 * DIAGNOSTIC D'ÉCRAN — mesure ce que le navigateur annonce, pour la bande
 * vue en bas de l'app installée sur iPhone (01/10). Outil de réglage, à
 * retirer une fois la cause établie.
 *
 * Trois repères à l'écran :
 *  - le fond du DOCUMENT en rouge : s'il se voit, rien ne le couvre là ;
 *  - un bloc dans le flux, haut de `100dvh`, en vert ;
 *  - un calque `position: fixed; inset: 0`, cerné de jaune.
 */
export default function DiagnosticEcran() {
  const [lines, setLines] = useState<string[]>([]);
  const probes = useRef<Record<string, HTMLDivElement | null>>({});

  useEffect(() => {
    const previous = document.body.style.background;
    document.body.style.background = "#d00";
    document.documentElement.style.background = "#d00";

    function measure() {
      const height = (key: string) => Math.round(probes.current[key]?.getBoundingClientRect().height ?? -1);
      const rect = (key: string) => {
        const r = probes.current[key]?.getBoundingClientRect();
        return r ? `top ${Math.round(r.top)} · bas ${Math.round(r.bottom)} · h ${Math.round(r.height)}` : "—";
      };
      const safe = probes.current.safe ? getComputedStyle(probes.current.safe) : null;
      const vv = window.visualViewport;
      const nav = navigator as Navigator & { standalone?: boolean };
      setLines([
        `innerWidth × innerHeight : ${window.innerWidth} × ${window.innerHeight}`,
        `outerHeight : ${window.outerHeight} · clientHeight (html) : ${document.documentElement.clientHeight}`,
        `screen : ${screen.width} × ${screen.height} · dpr ${window.devicePixelRatio}`,
        `visualViewport : ${vv ? `${Math.round(vv.width)} × ${Math.round(vv.height)} · offsetTop ${Math.round(vv.offsetTop)}` : "absent"}`,
        `100vh ${height("vh")} · 100dvh ${height("dvh")} · 100svh ${height("svh")} · 100lvh ${height("lvh")}`,
        `fixed inset 0 : ${rect("fixed")}`,
        `bloc vert 100dvh (flux) : ${rect("flow")}`,
        `zone sûre : haut ${safe?.paddingTop} · droite ${safe?.paddingRight} · bas ${safe?.paddingBottom} · gauche ${safe?.paddingLeft}`,
        `standalone : ${window.matchMedia("(display-mode: standalone)").matches} · navigator.standalone : ${nav.standalone}`,
        `orientation : ${screen.orientation?.type ?? "?"}`,
        navigator.userAgent,
      ]);
    }

    measure();
    const late = window.setTimeout(measure, 800);
    window.addEventListener("resize", measure);
    window.visualViewport?.addEventListener("resize", measure);
    return () => {
      window.clearTimeout(late);
      window.removeEventListener("resize", measure);
      window.visualViewport?.removeEventListener("resize", measure);
      document.body.style.background = previous;
      document.documentElement.style.background = "";
    };
  }, []);

  const probe = (key: string, height: string) => (
    <div
      ref={(el) => {
        probes.current[key] = el;
      }}
      style={{ position: "absolute", top: 0, left: 0, width: 1, height, visibility: "hidden" }}
    />
  );

  return (
    <>
      <div
        ref={(el) => {
          probes.current.flow = el;
        }}
        style={{ position: "relative", height: "100dvh", background: "#0a6" }}
      >
        {probe("vh", "100vh")}
        {probe("dvh", "100dvh")}
        {probe("svh", "100svh")}
        {probe("lvh", "100lvh")}
        <div
          ref={(el) => {
            probes.current.safe = el;
          }}
          style={{
            position: "absolute",
            visibility: "hidden",
            paddingTop: "var(--tb-safe-top)",
            paddingRight: "var(--tb-safe-right)",
            paddingBottom: "var(--tb-safe-bottom)",
            paddingLeft: "var(--tb-safe-left)",
          }}
        />
      </div>
      <div
        ref={(el) => {
          probes.current.fixed = el;
        }}
        style={{ position: "fixed", inset: 0, boxShadow: "inset 0 0 0 4px #fd0", pointerEvents: "none" }}
      />
      <div
        style={{
          position: "fixed",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          maxWidth: "86vw",
          padding: "10px 14px",
          borderRadius: 10,
          background: "rgba(0, 0, 0, 0.82)",
          color: "#fff",
          font: "12px/1.45 ui-monospace, monospace",
        }}
      >
        <p style={{ margin: "0 0 6px", fontWeight: 700 }}>Rouge = fond de page · vert = bloc 100dvh · jaune = calque fixe</p>
        {lines.map((line) => (
          <p key={line} style={{ margin: 0, wordBreak: "break-word" }}>
            {line}
          </p>
        ))}
        {/* L'app installée n'a pas de bouton « précédent » : la sortie est ici. */}
        <a href="/" style={{ display: "inline-block", marginTop: 8, padding: "10px 0", color: "#7dd3fc" }}>
          ← Retour à l&apos;accueil
        </a>
      </div>
    </>
  );
}
