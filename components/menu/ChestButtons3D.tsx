"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import * as THREE from "three";
import type { ChestSlotDef, ChestIconSlotDef } from "@/components/menu/TideboundMenuChest";
import { TIDEBOUND_MENU_ASSETS } from "@/components/menu/TideboundMenuChest";

const BRASS = 0xc9a15a;
const BRASS_LIGHT = 0xe8c988;
const WOOD: Record<ChestSlotDef["variant"], number> = {
  primary: 0x2f4a52, // teinte approximative du plateau "Jouer" (bleu pétrole)
  secondary: 0x5a3226, // approximation neutre pour Market/Collection tant que
  //                      leurs textures propres ne sont pas fournies
};

function hex(c: number) {
  return "#" + c.toString(16).padStart(6, "0");
}

/** Rectangle à coins arrondis, centré à l'origine — extrudé plus bas pour donner un vrai relief. */
function roundedRectShape(w: number, h: number, r: number) {
  const s = new THREE.Shape();
  const x = -w / 2,
    y = -h / 2;
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y);
  s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r);
  s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h);
  s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r);
  s.quadraticCurveTo(x, y, x + r, y);
  return s;
}

/** Plaque extrudée avec biseau (coins arrondis, profondeur ~22% de son plus petit côté). */
function plankGeometry(w: number, h: number) {
  const r = Math.min(w, h) * 0.22;
  const depth = Math.min(w, h) * 0.22;
  const bevelThickness = depth * 0.2;
  const geo = new THREE.ExtrudeGeometry(roundedRectShape(w, h, r), {
    depth,
    bevelEnabled: true,
    bevelThickness,
    bevelSize: bevelThickness,
    bevelSegments: 3,
    curveSegments: 8,
  });
  geo.translate(0, 0, -depth / 2);
  // Le biseau pousse la vraie face avant au-delà de `depth/2` (jusqu'à
  // `depth/2 + bevelThickness`) : un calque posé à `depth/2` se retrouve
  // sous la géométrie opaque et disparaît complètement.
  const frontZ = depth / 2 + bevelThickness;
  return { geo, frontZ };
}

/** Rivet circulaire extrudé (mêmes proportions que les icônes Options/Quitter du prototype). */
function rivetGeometry(size: number) {
  const depth = size * 0.28;
  const geo = new THREE.CylinderGeometry(size / 2, size / 2, depth, 28);
  geo.rotateX(Math.PI / 2); // axe du cylindre aligné sur Z (face la caméra), au lieu de Y par défaut
  return { geo, frontZ: depth / 2 };
}

/** Texture de secours (dégradé bois + liseré laiton) tant qu'aucun asset réel n'est fourni pour ce bouton. */
function proceduralPlankTexture(color: number): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 512;
  c.height = 176;
  const ctx = c.getContext("2d")!;
  const base = new THREE.Color(color);
  const g = ctx.createLinearGradient(0, 0, 0, c.height);
  g.addColorStop(0, hex(base.clone().offsetHSL(0, 0, 0.08).getHex()));
  g.addColorStop(0.55, hex(color));
  g.addColorStop(1, hex(base.clone().offsetHSL(0, 0, -0.1).getHex()));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, c.width, c.height);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function drawLabel(ctx: CanvasRenderingContext2D, w: number, h: number, label: string, font: string) {
  ctx.clearRect(0, 0, w, h);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = font;
  ctx.fillStyle = "rgba(0,0,0,.55)";
  ctx.fillText(label.toUpperCase(), w / 2, h / 2 + 3);
  ctx.fillStyle = hex(BRASS_LIGHT);
  ctx.fillText(label.toUpperCase(), w / 2, h / 2);
}

function proceduralLabelTexture(label: string): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 512;
  c.height = 176;
  const ctx = c.getContext("2d")!;
  // Dessine immédiatement avec le fallback (toujours disponible en
  // synchrone) puis regravure avec Cinzel une fois réellement chargée — un
  // canvas ne patiente jamais lui-même sur une police web au premier trait.
  drawLabel(ctx, c.width, c.height, label, "700 74px serif");
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  document.fonts.load("700 74px Cinzel").then(() => {
    drawLabel(ctx, c.width, c.height, label, "700 74px Cinzel, serif");
    tex.needsUpdate = true;
  });
  return tex;
}

function proceduralIconTexture(kind: "gear" | "power"): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const ctx = c.getContext("2d")!;
  const cx = 64,
    cy = 64,
    s = 92;
  ctx.strokeStyle = hex(BRASS_LIGHT);
  ctx.lineWidth = s * 0.09;
  ctx.lineCap = "round";
  if (kind === "gear") {
    ctx.beginPath();
    ctx.arc(cx, cy, s * 0.16, 0, Math.PI * 2);
    ctx.stroke();
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * s * 0.26, cy + Math.sin(a) * s * 0.26);
      ctx.lineTo(cx + Math.cos(a) * s * 0.42, cy + Math.sin(a) * s * 0.42);
      ctx.stroke();
    }
  } else {
    ctx.beginPath();
    ctx.arc(cx, cy + s * 0.02, s * 0.3, Math.PI * 1.25, Math.PI * 2.75);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx, cy - s * 0.34);
    ctx.lineTo(cx, cy - s * 0.02);
    ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

interface ButtonEntry {
  group: THREE.Group;
  body: THREE.Mesh;
  bodyMaterial: THREE.MeshStandardMaterial;
  label: THREE.Mesh | null;
  isCircle: boolean;
  hasRealTexture: boolean;
  rect: { x: number; y: number; w: number; h: number };
  href?: string;
  disabled?: boolean;
}

/**
 * Calque 3D des boutons du coffret (Three.js/WebGL), superposé en position
 * absolue sur `TideboundMenuChest`. Chaque bouton est un vrai maillage
 * extrudé et biseauté (pas un rectangle HTML, pas un plan plat) : survol et
 * appui détectés par raycasting, relief réel sous l'éclairage de la scène,
 * léger déplacement en Z vers la caméra au survol/appui.
 *
 * Texture par bouton : utilise `TIDEBOUND_MENU_ASSETS[...]` si fourni,
 * sinon un dégradé bois procédural + libellé gravé en Canvas — à remplacer
 * bouton par bouton dès que les assets réels arrivent, sans changer cette
 * structure (cf. commentaire sur `TIDEBOUND_MENU_ASSETS`).
 */
export function ChestButtons3D({ slots, iconSlots }: { slots: ChestSlotDef[]; iconSlots: ChestIconSlotDef[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    } catch {
      return; // pas de WebGL : les liens du sr-only nav restent le seul chemin d'accès
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.domElement.style.position = "absolute";
    renderer.domElement.style.inset = "0";
    renderer.domElement.style.cursor = "default";
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    // Caméra orthographique mappée 1:1 sur les pixels CSS du conteneur :
    // 1 unité monde = 1px, origine haut-gauche — les boutons se positionnent
    // directement à partir des mêmes % mesurés sur l'image, sans conversion
    // de perspective.
    const camera = new THREE.OrthographicCamera(0, 1, 0, -1, -2000, 2000);
    camera.position.z = 500;

    scene.add(new THREE.AmbientLight(0xffffff, 0.65));
    const key = new THREE.DirectionalLight(0xffe6bd, 1.15);
    key.position.set(120, -180, 260);
    scene.add(key);
    const rim = new THREE.DirectionalLight(BRASS_LIGHT, 0.5);
    rim.position.set(-160, 120, 140);
    scene.add(rim);

    const textureLoader = new THREE.TextureLoader();
    function loadTexture(url: string | undefined, fallback: () => THREE.CanvasTexture) {
      if (!url) return { tex: fallback(), real: false };
      const tex = textureLoader.load(url);
      tex.colorSpace = THREE.SRGBColorSpace;
      return { tex, real: true };
    }

    const entries: ButtonEntry[] = [];

    for (const slot of slots) {
      const texKey = (
        slot.id === "main" ? "buttonMain" : slot.id === "secondaryA" ? "buttonSecondaryA" : "buttonSecondaryB"
      ) as "buttonMain" | "buttonSecondaryA" | "buttonSecondaryB";

      const group = new THREE.Group();
      scene.add(group);

      const { tex, real } = loadTexture(TIDEBOUND_MENU_ASSETS[texKey], () => proceduralPlankTexture(WOOD[slot.variant]));
      const bodyMaterial = new THREE.MeshStandardMaterial({
        map: tex,
        roughness: 0.55,
        metalness: 0.12,
        emissive: new THREE.Color(BRASS_LIGHT),
        emissiveIntensity: 0,
      });
      if (slot.disabled) bodyMaterial.color.multiplyScalar(0.55);
      const body = new THREE.Mesh(new THREE.BufferGeometry(), bodyMaterial);
      group.add(body);

      let label: THREE.Mesh | null = null;
      if (!real) {
        const labelMat = new THREE.MeshBasicMaterial({ map: proceduralLabelTexture(slot.label), transparent: true });
        label = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), labelMat);
        group.add(label);
      }

      entries.push({
        group,
        body,
        bodyMaterial,
        label,
        isCircle: false,
        hasRealTexture: real,
        rect: slot.rect,
        href: slot.disabled ? undefined : (slot.href as string | undefined),
        disabled: slot.disabled,
      });
    }

    for (const icon of iconSlots) {
      const group = new THREE.Group();
      scene.add(group);

      const bodyMaterial = new THREE.MeshStandardMaterial({
        color: BRASS,
        roughness: 0.3,
        metalness: 0.9,
        emissive: new THREE.Color(BRASS_LIGHT),
        emissiveIntensity: 0,
      });
      if (icon.disabled) bodyMaterial.color.multiplyScalar(0.55);
      const body = new THREE.Mesh(new THREE.BufferGeometry(), bodyMaterial);
      group.add(body);

      const { tex } = loadTexture(TIDEBOUND_MENU_ASSETS[icon.texKey], () => proceduralIconTexture(icon.icon));
      const labelMat = new THREE.MeshBasicMaterial({ map: tex, transparent: true });
      const label = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), labelMat);
      group.add(label);

      entries.push({
        group,
        body,
        bodyMaterial,
        label,
        isCircle: true,
        hasRealTexture: false,
        rect: icon.rect,
        href: icon.disabled ? undefined : icon.href,
        disabled: icon.disabled,
      });
    }

    function layout() {
      const w = container!.clientWidth;
      const h = container!.clientHeight;
      if (w === 0 || h === 0) return;
      renderer.setSize(w, h, true);
      camera.right = w;
      camera.bottom = -h;
      camera.updateProjectionMatrix();

      for (const entry of entries) {
        const px = (entry.rect.x / 100) * w;
        const py = (entry.rect.y / 100) * h;
        const pw = (entry.rect.w / 100) * w;
        const ph = (entry.rect.h / 100) * h;
        entry.group.position.x = px + pw / 2;
        entry.group.position.y = -(py + ph / 2);

        entry.body.geometry.dispose();
        if (entry.isCircle) {
          const size = Math.min(pw, ph);
          const { geo, frontZ } = rivetGeometry(size);
          entry.body.geometry = geo;
          if (entry.label) {
            entry.label.scale.set(size * 0.6, size * 0.6, 1);
            entry.label.position.z = frontZ + 1;
          }
        } else {
          const { geo, frontZ } = plankGeometry(pw, ph);
          entry.body.geometry = geo;
          if (entry.label) {
            entry.label.scale.set(pw * 0.88, ph * 0.62, 1);
            entry.label.position.z = frontZ + 1;
          }
        }
      }
    }

    const resizeObserver = new ResizeObserver(layout);
    resizeObserver.observe(container);
    layout();

    const raycaster = new THREE.Raycaster();
    const pointerNdc = new THREE.Vector2(-10, -10);
    let hovered: ButtonEntry | null = null;
    let pressed: ButtonEntry | null = null;

    function pointerToNdc(e: PointerEvent) {
      const r = container!.getBoundingClientRect();
      pointerNdc.set(((e.clientX - r.left) / r.width) * 2 - 1, -(((e.clientY - r.top) / r.height) * 2 - 1));
    }
    function pick(): ButtonEntry | null {
      raycaster.setFromCamera(pointerNdc, camera);
      const hits = raycaster.intersectObjects(entries.map((en) => en.body));
      if (!hits.length) return null;
      return entries.find((en) => en.body === hits[0]!.object) ?? null;
    }
    function onMove(e: PointerEvent) {
      pointerToNdc(e);
      const hit = pick();
      hovered = hit && !hit.disabled ? hit : null;
      renderer.domElement.style.cursor = hovered ? "pointer" : "default";
    }
    function onDown(e: PointerEvent) {
      pointerToNdc(e);
      const hit = pick();
      pressed = hit && !hit.disabled ? hit : null;
    }
    function onUp() {
      if (pressed && pressed === hovered && pressed.href) router.push(pressed.href);
      pressed = null;
    }
    function onLeave() {
      hovered = null;
      pressed = null;
      pointerNdc.set(-10, -10);
    }

    renderer.domElement.addEventListener("pointermove", onMove);
    renderer.domElement.addEventListener("pointerdown", onDown);
    window.addEventListener("pointerup", onUp);
    renderer.domElement.addEventListener("pointerleave", onLeave);

    const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
    let raf = 0;
    function animate() {
      raf = requestAnimationFrame(animate);
      const lerp = reduceMotion ? 1 : 0.28;
      for (const entry of entries) {
        const isHover = entry === hovered,
          isPress = entry === pressed;
        const targetZ = isPress ? -6 : isHover ? 10 : 0;
        entry.group.position.z += (targetZ - entry.group.position.z) * lerp;
        const targetEmissive = isHover && !isPress ? 0.22 : 0;
        entry.bodyMaterial.emissiveIntensity += (targetEmissive - entry.bodyMaterial.emissiveIntensity) * lerp;
      }
      renderer.render(scene, camera);
    }
    animate();

    return () => {
      cancelAnimationFrame(raf);
      resizeObserver.disconnect();
      renderer.domElement.removeEventListener("pointermove", onMove);
      renderer.domElement.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointerup", onUp);
      renderer.domElement.removeEventListener("pointerleave", onLeave);
      for (const entry of entries) {
        entry.body.geometry.dispose();
        entry.bodyMaterial.map?.dispose();
        entry.bodyMaterial.dispose();
        if (entry.label) {
          entry.label.geometry.dispose();
          (entry.label.material as THREE.MeshBasicMaterial).map?.dispose();
          (entry.label.material as THREE.MeshBasicMaterial).dispose();
        }
      }
      renderer.dispose();
      container!.removeChild(renderer.domElement);
    };
  }, [slots, iconSlots, router]);

  return <div ref={containerRef} className="absolute inset-0" />;
}
