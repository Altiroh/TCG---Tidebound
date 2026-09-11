"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import * as THREE from "three";
import type { ChestSlotDef, ChestIconSlotDef } from "@/components/menu/TideboundMenuChest";
import { TIDEBOUND_MENU_ASSETS } from "@/components/menu/TideboundMenuChest";
import { playButtonClick } from "@/lib/sound";

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

/**
 * Plaque extrudée avec biseau (coins arrondis, profondeur ~28% de son plus
 * petit côté — accentuée pour un vrai relief, cf. retour "effet de
 * profondeur"). `uvMargin` recadre l'échantillonnage de la texture vers
 * l'intérieur (ex: 0.04 = on ignore les 4% extérieurs de chaque bord) pour
 * exclure le halo/ombre douce souvent cuit dans le PNG source, qui sinon
 * apparaît comme un liseré gris terne autour de la plaque.
 */
function plankGeometry(w: number, h: number, uvMargin = 0) {
  const r = Math.min(w, h) * 0.22;
  const depth = Math.min(w, h) * 0.28;
  // Biseau volontairement fin (contre 0.24 avant) : en vue orthographique de
  // face, le biseau est ce qui rend les flancs visibles comme un liseré tout
  // autour de la plaque (haut/bas/côtés) — un vrai plat extrudé sans biseau
  // serait, lui, invisible de face (flancs parallèles à l'axe de vue). Vu que
  // seul le bas doit garder un liseré visible (cf. `shadowTexture`), on
  // réduit le biseau au minimum plutôt que de le garder prononcé partout.
  const bevelThickness = depth * 0.08;
  const geo = new THREE.ExtrudeGeometry(roundedRectShape(w, h, r), {
    depth,
    bevelEnabled: true,
    bevelThickness,
    bevelSize: bevelThickness,
    bevelSegments: 3,
    curveSegments: 8,
  });
  geo.translate(0, 0, -depth / 2);
  // Le `UVGenerator` par défaut d'ExtrudeGeometry (`WorldUVGenerator`) pose
  // les UV des faces avant/arrière directement sur les coordonnées monde
  // (x, y) du contour, PAS normalisées en [0,1] — ici des valeurs de
  // l'ordre de ±150px. Avec le `ClampToEdgeWrapping` par défaut des
  // textures, tout ça se retrouve écrasé sur le tout dernier texel du
  // bord : d'où la plaque en aplat de couleur sans texte visible. On
  // renormalise donc les UV sur l'étendue réelle du rectangle (-w/2..w/2,
  // -h/2..h/2), rétrécie de `uvMargin` de chaque côté, pour que la texture
  // couvre bien toute la face sans son liseré extérieur indésirable.
  const uv = geo.attributes.uv!;
  const pos = geo.attributes.position!;
  const scale = 1 - 2 * uvMargin;
  for (let i = 0; i < uv.count; i++) {
    uv.setXY(i, (pos.getX(i) / w) * scale + 0.5, (pos.getY(i) / h) * scale + 0.5);
  }
  uv.needsUpdate = true;
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

/**
 * Dégradé vertical (opaque en haut → transparent en bas), pour le liseré
 * d'ombre portée sous chaque plaque : demandé pour donner un léger relief
 * "contre-plongée" (la plaque comme légèrement soulevée, ombre au sol sous
 * son bord bas) sans le liseré tout autour qui lisait comme un double-cadre
 * sur les côtés/le haut. Un seul canvas partagé par tous les boutons — pas
 * besoin d'un dégradé par plaque, juste étiré à la taille voulue.
 */
let sharedShadowTexture: THREE.CanvasTexture | null = null;
function shadowTexture(): THREE.CanvasTexture {
  if (sharedShadowTexture) return sharedShadowTexture;
  const c = document.createElement("canvas");
  c.width = 8;
  c.height = 128;
  const ctx = c.getContext("2d")!;
  const g = ctx.createLinearGradient(0, 0, 0, c.height);
  g.addColorStop(0, "rgba(0,0,0,0.5)");
  g.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, c.width, c.height);
  sharedShadowTexture = new THREE.CanvasTexture(c);
  return sharedShadowTexture;
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
  /**
   * Matériau de la ou des faces visibles (texture/couleur, réagit au
   * survol/appui). Non éclairé (`MeshBasicMaterial`) pour les plaques —
   * une illustration peinte doit garder ses couleurs d'origine, pas être
   * teintée par les lumières chaudes de la scène (`MeshStandardMaterial`
   * PBR désaturait visiblement les PNG). Les icônes en laiton, elles,
   * restent en `MeshStandardMaterial` : leur aspect métallique dépend
   * réellement de l'éclairage.
   */
  bodyMaterial: THREE.MeshStandardMaterial | THREE.MeshBasicMaterial;
  baseColor: THREE.Color;
  label: THREE.Mesh | null;
  /** Ombre portée sous la plaque uniquement (cf. `shadowTexture`) — null pour les icônes circulaires. */
  shadow: THREE.Mesh | null;
  isCircle: boolean;
  rect: { x: number; y: number; w: number; h: number };
  href?: string;
  disabled?: boolean;
  /** Amplitude de soulèvement/enfoncement, proportionnelle à la taille du bouton (calculée dans layout()). */
  liftAmount: number;
  pressAmount: number;
  /** État courant animé (0 = repos, 1 = pleinement enfoncé/survolé) — lissé indépendamment du hover/press instantanés. */
  hoverMix: number;
  pressMix: number;
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

    const entries: ButtonEntry[] = [];

    for (const slot of slots) {
      const texKey = (
        slot.id === "main" ? "buttonMain" : slot.id === "secondaryA" ? "buttonSecondaryA" : "buttonSecondaryB"
      ) as "buttonMain" | "buttonSecondaryA" | "buttonSecondaryB";
      const texUrl = TIDEBOUND_MENU_ASSETS[texKey];
      const real = !!texUrl;

      const group = new THREE.Group();
      scene.add(group);

      // Deux matériaux séparés plutôt qu'un seul partagé par toute la
      // géométrie : la face avant (texturée, transparente pour la marge
      // PNG, NON éclairée — cf. commentaire sur `ButtonEntry.bodyMaterial`)
      // et les flancs du biseau (couleur unie, éclairés pour porter tout
      // l'effet de profondeur). Un seul matériau texturé sur les flancs
      // ferait apparaître un fragment étiré de l'image (le mapping UV des
      // flancs d'ExtrudeGeometry n'a rien à voir avec celui des faces).
      const capMaterial = new THREE.MeshBasicMaterial({ transparent: true, alphaTest: 0.35 });
      const sideMaterial = new THREE.MeshStandardMaterial({ color: WOOD[slot.variant], roughness: 0.6, metalness: 0.15 });
      if (slot.disabled) {
        capMaterial.color.multiplyScalar(0.55);
        sideMaterial.color.multiplyScalar(0.55);
      }
      // ExtrudeGeometry assigne l'index matériau 0 aux faces avant/arrière
      // (caps) et l'index 1 aux flancs du biseau — l'inverse de ce qu'on
      // pourrait supposer intuitivement (vérifié dans buildLidFaces/
      // buildSideFaces de three/src/geometries/ExtrudeGeometry.js).
      const body = new THREE.Mesh(new THREE.BufferGeometry(), [capMaterial, sideMaterial]);
      group.add(body);

      let label: THREE.Mesh | null = null;
      if (!real) {
        const labelMat = new THREE.MeshBasicMaterial({ map: proceduralLabelTexture(slot.label), transparent: true });
        label = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), labelMat);
        group.add(label);
      }

      const shadowMat = new THREE.MeshBasicMaterial({ map: shadowTexture(), transparent: true, depthWrite: false });
      const shadow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), shadowMat);
      group.add(shadow);

      const entry: ButtonEntry = {
        group,
        body,
        bodyMaterial: capMaterial,
        baseColor: capMaterial.color.clone(),
        label,
        shadow,
        isCircle: false,
        rect: slot.rect,
        href: slot.disabled ? undefined : (slot.href as string | undefined),
        disabled: slot.disabled,
        liftAmount: 0,
        pressAmount: 0,
        hoverMix: 0,
        pressMix: 0,
      };
      entries.push(entry);

      if (real) {
        const tex = textureLoader.load(texUrl!);
        tex.colorSpace = THREE.SRGBColorSpace;
        // Sans ça, le mipmapping mélange au fil des niveaux les pixels
        // transparents du bord du PNG (RGB souvent noir/nul) avec les
        // pixels opaques voisins — d'où une frange grise/sombre autour de
        // la plaque, quelle que soit la marge UV appliquée. LinearFilter
        // (pas de mipmap) élimine la frange ; acceptable ici, le bouton
        // n'est jamais affiché à une échelle où l'aliasing de minification
        // se remarque.
        tex.generateMipmaps = false;
        tex.minFilter = THREE.LinearFilter;
        capMaterial.map = tex;
      } else {
        capMaterial.map = proceduralPlankTexture(WOOD[slot.variant]);
      }
      capMaterial.needsUpdate = true;
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

      const iconUrl = TIDEBOUND_MENU_ASSETS[icon.texKey];
      const tex = iconUrl ? textureLoader.load(iconUrl) : proceduralIconTexture(icon.icon);
      tex.colorSpace = THREE.SRGBColorSpace;
      const labelMat = new THREE.MeshBasicMaterial({ map: tex, transparent: true });
      const label = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), labelMat);
      group.add(label);

      entries.push({
        group,
        body,
        bodyMaterial,
        baseColor: bodyMaterial.color.clone(),
        label,
        shadow: null,
        isCircle: true,
        rect: icon.rect,
        href: icon.disabled ? undefined : icon.href,
        disabled: icon.disabled,
        liftAmount: 0,
        pressAmount: 0,
        hoverMix: 0,
        pressMix: 0,
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
        let frontZ: number;
        if (entry.isCircle) {
          const size = Math.min(pw, ph);
          const geoResult = rivetGeometry(size);
          frontZ = geoResult.frontZ;
          entry.body.geometry = geoResult.geo;
          if (entry.label) {
            entry.label.scale.set(size * 0.6, size * 0.6, 1);
            entry.label.position.z = frontZ + 1;
          }
        } else {
          // La plaque remplit tout l'emplacement mesuré sur l'image (object-
          // fit: fill) : la boîte a la priorité sur le ratio propre de la
          // texture, quitte à l'étirer légèrement — plus fiable que de
          // dépendre d'assets aux proportions exactement calées sur chaque
          // emplacement du coffret. Le dégradé procédural n'a de toute façon
          // pas de ratio propre à préserver.
          //
          // Les rects de `SLOTS` (TideboundMenuChest.tsx) sont désormais
          // mesurés au pixel près sur le bord EXTÉRIEUR du cadre peint —
          // OVERSCAN reste à 1.0 (aucun sur-dimensionnement) : le repasser
          // au-dessus de 1.0 fait déborder la plaque par-dessus le cadre
          // doré (coins arrondis qui débordent des coins taillés du cadre).
          const OVERSCAN = 1.0;
          const geoResult = plankGeometry(pw * OVERSCAN, ph * OVERSCAN, 0.05);
          frontZ = geoResult.frontZ;
          entry.body.geometry = geoResult.geo;
          if (entry.label) {
            entry.label.scale.set(pw * 0.88, ph * 0.62, 1);
            entry.label.position.z = frontZ + 1;
          }
          if (entry.shadow) {
            // Bande fine sous la plaque : la moitié haute (sous la plaque,
            // z=0 donc masquée par le corps opaque à frontZ) chevauche le
            // bord bas pour ne pas laisser de liseré clair entre les deux ;
            // seule la moitié basse dépasse et se voit vraiment.
            const shadowH = ph * 0.16;
            entry.shadow.scale.set(pw * 0.82, shadowH, 1);
            entry.shadow.position.set(0, -ph / 2 - shadowH * 0.32, 0);
          }
        }
        // Soulèvement/enfoncement proportionnels à l'épaisseur réelle du
        // bouton — un montant fixe en px paraîtrait énorme sur un petit
        // écran et insignifiant sur un grand.
        entry.liftAmount = frontZ * 0.9;
        entry.pressAmount = frontZ * 0.55;
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
      if (pressed && pressed === hovered && pressed.href) {
        playButtonClick();
        router.push(pressed.href);
      }
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
      for (const entry of entries) {
        const isHover = entry === hovered,
          isPress = entry === pressed;

        // Asymétrique et volontairement rapide vers l'état pressé (un clic
        // doit répondre au quart de tour) ; le retour au repos est plus
        // doux. Sans quoi le lerp unique précédent donnait une sensation
        // "molle", pas un vrai déclic.
        const hoverTarget = isHover ? 1 : 0;
        const pressTarget = isPress ? 1 : 0;
        const hoverLerp = reduceMotion ? 1 : hoverTarget > entry.hoverMix ? 0.35 : 0.2;
        const pressLerp = reduceMotion ? 1 : pressTarget > entry.pressMix ? 0.6 : 0.22;
        entry.hoverMix += (hoverTarget - entry.hoverMix) * hoverLerp;
        entry.pressMix += (pressTarget - entry.pressMix) * pressLerp;

        entry.group.position.z = entry.hoverMix * entry.liftAmount - entry.pressMix * entry.pressAmount;
        // Léger tassement au clic : un vrai bouton physique se comprime un
        // peu quand on l'enfonce, pas seulement "reculer en Z".
        const squash = 1 - entry.pressMix * 0.04;
        entry.group.scale.set(squash, squash, 1);

        // Assombrit la plaque en s'enfonçant (ombre "interne" simulée sans
        // shadow map réelle) plutôt que de ne compter que sur le décalage Z.
        const pressDarken = 1 - entry.pressMix * 0.35;
        if (entry.bodyMaterial instanceof THREE.MeshStandardMaterial) {
          // Icônes laiton : éclairées, le survol se lit via l'émissivité.
          entry.bodyMaterial.emissiveIntensity = entry.hoverMix * 0.22 * (1 - entry.pressMix * 0.5);
          entry.bodyMaterial.color.copy(entry.baseColor).multiplyScalar(pressDarken);
        } else {
          // Plaques non éclairées : le survol éclaircit directement la
          // couleur (pas d'émissivité sur MeshBasicMaterial) pour garder
          // les couleurs d'origine du PNG au repos.
          const hoverBrighten = 1 + entry.hoverMix * 0.18 * (1 - entry.pressMix * 0.5);
          entry.bodyMaterial.color.copy(entry.baseColor).multiplyScalar(pressDarken * hoverBrighten);
        }
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
        // Les boutons "plaque" portent un matériau de flanc distinct
        // (WOOD, non texturé) en plus de bodyMaterial (la ou les faces) —
        // les deux sont dans le tableau `body.material` s'il y en a un.
        const bodyMaterials = Array.isArray(entry.body.material) ? entry.body.material : [entry.body.material];
        for (const m of bodyMaterials) {
          if ("map" in m) (m as THREE.MeshStandardMaterial).map?.dispose();
          m.dispose();
        }
        if (entry.label) {
          entry.label.geometry.dispose();
          (entry.label.material as THREE.MeshBasicMaterial).map?.dispose();
          (entry.label.material as THREE.MeshBasicMaterial).dispose();
        }
        if (entry.shadow) {
          // Ne dispose pas `.map` : `shadowTexture()` la partage entre tous
          // les boutons (et entre montages/démontages via le cache module).
          entry.shadow.geometry.dispose();
          (entry.shadow.material as THREE.MeshBasicMaterial).dispose();
        }
      }
      renderer.dispose();
      container!.removeChild(renderer.domElement);
    };
  }, [slots, iconSlots, router]);

  return <div ref={containerRef} className="absolute inset-0" />;
}
