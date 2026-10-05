import type { LandeFxKind } from "@/features/match/landes/landeScenes";

/**
 * Effets ANIMÉS des Landes, dessinés sur un canvas posé sous les cartes
 * (`LandeLayer`). Procéduraux : ils ne dépendent d'aucun fichier, et la
 * scène tient debout même avant que les calques illustrés n'arrivent.
 *
 * Chaque effet est un petit moteur à états : `step(dt)` avance et dessine
 * une image, `pulse()` marque un temps fort (un tour de table qui
 * s'achève), `resize()` suit la fenêtre. Tout est en pixels du canvas,
 * densité d'écran comprise.
 */
export interface LandeFx {
  step(dt: number): void;
  pulse(): void;
  resize(width: number, height: number): void;
  /**
   * Pièces illustrées chargées (`LandeScene.sprites`, `debris`, `anchors`) :
   * dès qu'il y en a, l'effet les place à la place de ses propres dessins.
   */
  setSprites(sprites: LandeSprites): void;
}

export interface LandeSprites {
  pieces: HTMLImageElement[];
  debris: HTMLImageElement[];
  anchors: HTMLImageElement[];
}

const rand = (min: number, max: number) => min + Math.random() * (max - min);

// ─────────────────────────────────────────────────────────────────────────
// PLUIE CORROSIVE — pluie acide oblique, impacts qui grésillent, fumées.
// ─────────────────────────────────────────────────────────────────────────

interface Drop {
  x: number;
  y: number;
  speed: number;
  length: number;
  width: number;
  alpha: number;
  floor: number;
}
interface Splash {
  x: number;
  y: number;
  age: number;
  life: number;
  size: number;
}
interface Mote {
  x: number;
  y: number;
  vx: number;
  vy: number;
  age: number;
  life: number;
  size: number;
}
interface Fume {
  x: number;
  y: number;
  r: number;
  vx: number;
  phase: number;
}

function acidRain(ctx: CanvasRenderingContext2D, rgb: string, rgbHot: string): LandeFx {
  let w = 0;
  let h = 0;
  let drops: Drop[] = [];
  const splashes: Splash[] = [];
  const motes: Mote[] = [];
  let fumes: Fume[] = [];
  let time = 0;
  const slant = 0.2; // ~11° : la pluie vient du large, pas du ciel droit.

  function newDrop(top: boolean): Drop {
    const depth = Math.random();
    return {
      x: rand(-0.15 * w, w),
      y: top ? rand(-h * 0.3, -10) : rand(-h * 0.3, h),
      speed: (0.9 + depth * 1.1) * h * 1.15,
      length: (10 + depth * 26) * (h / 900),
      width: 0.6 + depth * 1.3,
      alpha: 0.25 + depth * 0.5,
      floor: rand(h * 0.35, h * 1.02),
    };
  }

  function seed() {
    const count = Math.min(320, Math.round((w * h) / 7000));
    drops = Array.from({ length: count }, () => newDrop(false));
    fumes = Array.from({ length: 7 }, (_, i) => ({
      x: rand(0, w),
      y: i < 4 ? rand(h * 0.78, h * 1.02) : rand(h * 0.02, h * 0.2),
      r: rand(0.18, 0.32) * Math.max(w, h),
      vx: rand(-14, 14) * (w / 1600),
      phase: rand(0, Math.PI * 2),
    }));
  }

  return {
    setSprites() {},
    resize(width, height) {
      w = width;
      h = height;
      seed();
    },
    pulse() {
      // Averse : une bouffée de fumée et une salve d'impacts.
      for (let i = 0; i < 40; i++) splashes.push({ x: rand(0, w), y: rand(h * 0.3, h), age: 0, life: rand(0.5, 0.9), size: rand(8, 18) * (h / 900) });
    },
    step(dt) {
      time += dt;
      ctx.clearRect(0, 0, w, h);

      // Fumées : grandes nappes lentes, presque invisibles, qui verdissent l'air.
      ctx.globalCompositeOperation = "source-over";
      for (const fume of fumes) {
        fume.x += fume.vx * dt;
        if (fume.x < -fume.r) fume.x = w + fume.r;
        if (fume.x > w + fume.r) fume.x = -fume.r;
        const breathe = 0.75 + 0.25 * Math.sin(time * 0.35 + fume.phase);
        const g = ctx.createRadialGradient(fume.x, fume.y, 0, fume.x, fume.y, fume.r);
        g.addColorStop(0, `rgba(${rgb}, ${0.13 * breathe})`);
        g.addColorStop(1, `rgba(${rgb}, 0)`);
        ctx.fillStyle = g;
        ctx.fillRect(fume.x - fume.r, fume.y - fume.r, fume.r * 2, fume.r * 2);
      }

      // Gouttes : un trait dont la tête est plus claire que la traîne.
      ctx.lineCap = "round";
      for (const drop of drops) {
        drop.y += drop.speed * dt;
        drop.x += drop.speed * slant * dt;
        if (drop.y >= drop.floor) {
          if (Math.random() < 0.55) splashes.push({ x: drop.x, y: drop.floor, age: 0, life: rand(0.35, 0.6), size: drop.width * rand(4, 7) * (h / 900) });
          Object.assign(drop, newDrop(true));
          continue;
        }
        const tailX = drop.x - drop.length * slant;
        const tailY = drop.y - drop.length;
        const g = ctx.createLinearGradient(tailX, tailY, drop.x, drop.y);
        g.addColorStop(0, `rgba(${rgb}, 0)`);
        g.addColorStop(1, `rgba(${rgbHot}, ${drop.alpha})`);
        ctx.strokeStyle = g;
        ctx.lineWidth = drop.width;
        ctx.beginPath();
        ctx.moveTo(tailX, tailY);
        ctx.lineTo(drop.x, drop.y);
        ctx.stroke();
      }

      // Impacts : deux ondes elliptiques qui s'élargissent, et la vapeur qui monte.
      for (let i = splashes.length - 1; i >= 0; i--) {
        const s = splashes[i]!;
        s.age += dt;
        const k = s.age / s.life;
        if (k >= 1) {
          splashes.splice(i, 1);
          continue;
        }
        const fade = 1 - k;
        ctx.strokeStyle = `rgba(${rgbHot}, ${0.55 * fade})`;
        ctx.lineWidth = 1;
        for (const ring of [1, 0.55]) {
          ctx.beginPath();
          ctx.ellipse(s.x, s.y, s.size * (0.3 + k) * ring * 2, s.size * (0.3 + k) * ring * 0.6, 0, 0, Math.PI * 2);
          ctx.stroke();
        }
        if (s.age < dt * 1.5 && motes.length < 260) {
          for (let j = 0; j < 2; j++) motes.push({ x: s.x, y: s.y, vx: rand(-10, 10), vy: rand(-38, -18), age: 0, life: rand(0.8, 1.6), size: rand(1.5, 4) * (h / 900) });
        }
      }

      // Vapeur corrosive : de petites volutes qui montent et se dissipent.
      for (let i = motes.length - 1; i >= 0; i--) {
        const m = motes[i]!;
        m.age += dt;
        if (m.age >= m.life) {
          motes.splice(i, 1);
          continue;
        }
        m.x += m.vx * dt;
        m.y += m.vy * dt;
        const fade = 1 - m.age / m.life;
        const r = m.size * (1 + m.age * 2.5);
        const g = ctx.createRadialGradient(m.x, m.y, 0, m.x, m.y, r);
        g.addColorStop(0, `rgba(${rgb}, ${0.28 * fade})`);
        g.addColorStop(1, `rgba(${rgb}, 0)`);
        ctx.fillStyle = g;
        ctx.fillRect(m.x - r, m.y - r, r * 2, r * 2);
      }
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────
// VALLÉE DE VERRE — un CHAMP de pics cristallins planté dans tout le
// terrain, en perspective : loin (haut de l'écran) petits et noyés de
// brume, près (bas) grands et nets. Ombres portées, reflets dans l'eau,
// lente dérive de parallaxe — c'est elle qui donne la profondeur. Le
// centre du plateau garde des pics plus discrets : les cartes s'y lisent.
// ─────────────────────────────────────────────────────────────────────────

interface Spike {
  /** Pied du pic, au sol (pixels du canvas). */
  x: number;
  baseY: number;
  /** Profondeur : 0 à l'horizon, 1 au premier plan. */
  z: number;
  width: number;
  height: number;
  lean: number;
  grown: number;
  delay: number;
  facet: number;
  /** Atténuation sur la zone de jeu (1 : pleine présence). */
  presence: number;
  /** Pièce illustrée qui le dessine, quand il y en a (indice dans `sprites.pieces`). */
  sprite: number;
}
interface Spark {
  x: number;
  y: number;
  age: number;
  life: number;
  size: number;
  vx?: number;
  vy?: number;
  /** Débris illustré, et sa rotation. */
  image?: HTMLImageElement;
  spin?: number;
}

/** Hauteur de l'horizon, en fraction de la scène : au-dessus, plus rien ne pousse. */
const HORIZON = 0.04;

function glassSpikes(ctx: CanvasRenderingContext2D, rgb: string, rgbHot: string): LandeFx {
  let w = 0;
  let h = 0;
  let spikes: Spike[] = [];
  const sparks: Spark[] = [];
  let time = 0;
  let glint = -0.3;
  let sprites: LandeSprites = { pieces: [], debris: [], anchors: [] };

  /** Dérive de parallaxe : le premier plan glisse plus que le fond. */
  const drift = (s: Spike) => Math.sin(time * 0.11) * w * 0.012 * (s.z - 0.35);
  /** Reflet qui balaie la vallée, de gauche à droite. */
  const litOf = (s: Spike) => Math.max(0, 1 - Math.abs(s.x / w - glint) * 7);
  /** Opacité d'un pic : la brume mange le fond, la zone de jeu l'adoucit. */
  const alphaOf = (s: Spike) => (0.32 + 0.68 * s.z) * s.presence;

  /** Ombre portée au sol, couchée vers la droite, et reflet renversé dans l'eau. */
  function drawGround(s: Spike, x: number, visible: number, width: number) {
    const a = alphaOf(s);
    ctx.save();
    ctx.globalAlpha = a * 0.5;
    ctx.fillStyle = "rgba(4, 14, 26, 0.9)";
    ctx.beginPath();
    ctx.ellipse(x + visible * 0.18, s.baseY + 2, width * 0.75 + visible * 0.2, Math.max(2, width * 0.22), -0.08, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  /**
   * Pic ILLUSTRÉ : la pièce sort du sol pointe la première, légèrement
   * penchée, puis son reflet renversé, et un passage additif pour l'éclat.
   */
  function drawSpriteSpike(s: Spike, img: HTMLImageElement) {
    const total = s.height;
    const visible = total * Math.max(0, easeOutBack(s.grown));
    if (visible <= 1) return;
    const dw = (total * img.naturalWidth) / img.naturalHeight;
    const shown = Math.min(1, visible / total);
    const x = s.x + drift(s);
    drawGround(s, x, visible, dw * 0.5);
    const draw = () => ctx.drawImage(img, 0, 0, img.naturalWidth, img.naturalHeight * shown, -dw / 2, -visible, dw, visible);
    const a = alphaOf(s);

    // Reflet dans l'eau : renversé, écrasé, très pâle.
    ctx.save();
    ctx.translate(x, s.baseY);
    ctx.rotate(-s.lean * 0.3);
    ctx.scale(1, -0.32);
    ctx.globalAlpha = a * 0.22;
    draw();
    ctx.restore();

    ctx.save();
    ctx.translate(x, s.baseY);
    ctx.rotate(s.lean * 0.3);
    ctx.globalAlpha = a;
    draw();
    const lit = litOf(s);
    if (lit > 0.05) {
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = a * lit * 0.5;
      draw();
    }
    ctx.restore();
    if (lit > 0.6 && s.grown >= 1 && Math.random() < 0.05 * s.z) {
      sparks.push({ x: x + s.lean * 0.3 * visible, y: s.baseY - visible * 0.92, age: 0, life: 0.5, size: rand(3, 8) * (0.4 + s.z) * (h / 900) });
    }
  }

  function seed() {
    spikes = [];
    // Des BOSQUETS plutôt qu'une pluie de pics isolés : un pic maître
    // entouré de plus petits, comme le verre qui cristallise en grappes.
    const clusters = Math.round((w / 1600) * 42);
    for (let c = 0; c < clusters; c++) {
      // Plus dense au loin (la perspective tasse le sol), jamais au-dessus de l'horizon.
      const z = Math.pow(Math.random(), 0.8);
      const cx = rand(-0.04, 1.04) * w;
      const baseY = (HORIZON + (1 - HORIZON) * Math.pow(z, 1.25)) * h + 6;
      // Zone de jeu (les deux rangées et le centre) : pics plus bas et plus pâles.
      const fx = cx / w;
      const fy = baseY / h;
      const inPlay = Math.abs(fx - 0.5) < 0.36 && fy > 0.12 && fy < 0.9;
      const presence = inPlay ? 0.78 : 1;
      const size = (0.05 + 0.24 * z) * h * (inPlay ? 0.75 : 1);
      const members = 1 + Math.floor(rand(1, 5));
      for (let m = 0; m < members; m++) {
        const main = m === 0;
        const spread = size * (main ? 0 : rand(0.25, 0.7)) * (Math.random() < 0.5 ? -1 : 1);
        const k = main ? rand(0.9, 1.15) : rand(0.35, 0.7);
        spikes.push({
          x: cx + spread,
          baseY: baseY + (main ? 0 : rand(-3, 6) * (0.5 + z)),
          z,
          width: size * rand(0.16, 0.26) * (main ? 1 : 0.8),
          height: size * k,
          // Les satellites s'écartent du maître.
          lean: main ? rand(-0.15, 0.15) : Math.sign(spread) * rand(0.15, 0.45),
          grown: 0,
          // Ça pousse du premier plan vers le fond : la vague part du joueur.
          delay: (1 - z) * 0.7 + rand(0, 0.35),
          facet: rand(0.35, 0.65),
          presence,
          sprite: Math.floor(Math.random() * 1000),
        });
      }
    }
    // Du fond vers l'avant : le premier plan recouvre l'horizon.
    spikes.sort((a, b) => a.baseY - b.baseY);
  }

  function drawSpike(s: Spike) {
    const baseY = s.baseY;
    const height = s.height * easeOutBack(s.grown);
    if (height <= 1) return;
    const x = s.x + drift(s);
    drawGround(s, x, height, s.width);
    const tipX = x + s.lean * height;
    const tipY = baseY - height;
    const left = x - s.width / 2;
    const right = x + s.width / 2;
    const midX = left + s.width * s.facet;
    ctx.save();
    ctx.globalAlpha = alphaOf(s);

    // Deux facettes : l'une claire, l'autre sombre — c'est ce qui fait du verre et pas un triangle.
    const light = ctx.createLinearGradient(left, baseY, tipX, tipY);
    light.addColorStop(0, `rgba(${rgb}, 0.10)`);
    light.addColorStop(0.7, `rgba(${rgb}, 0.38)`);
    light.addColorStop(1, `rgba(${rgbHot}, 0.85)`);
    ctx.fillStyle = light;
    ctx.beginPath();
    ctx.moveTo(left, baseY);
    ctx.lineTo(tipX, tipY);
    ctx.lineTo(midX, baseY);
    ctx.closePath();
    ctx.fill();

    const dark = ctx.createLinearGradient(right, baseY, tipX, tipY);
    dark.addColorStop(0, "rgba(10, 30, 50, 0.25)");
    dark.addColorStop(1, `rgba(${rgb}, 0.55)`);
    ctx.fillStyle = dark;
    ctx.beginPath();
    ctx.moveTo(midX, baseY);
    ctx.lineTo(tipX, tipY);
    ctx.lineTo(right, baseY);
    ctx.closePath();
    ctx.fill();

    const lit = litOf(s);
    ctx.strokeStyle = `rgba(${rgbHot}, ${0.35 + 0.65 * lit})`;
    ctx.lineWidth = (1 + lit * 1.5) * (0.5 + s.z);
    ctx.beginPath();
    ctx.moveTo(midX, baseY);
    ctx.lineTo(tipX, tipY);
    ctx.stroke();
    ctx.restore();
    if (lit > 0.6 && s.grown >= 1 && Math.random() < 0.05 * s.z) sparks.push({ x: tipX, y: tipY, age: 0, life: 0.5, size: rand(3, 8) * (0.4 + s.z) * (h / 900) });
  }

  return {
    setSprites(next) {
      sprites = next;
    },
    resize(width, height) {
      w = width;
      h = height;
      seed();
    },
    pulse() {
      // Un tour de table de plus : la vallée se fend — éclats projetés depuis les pointes du premier plan.
      for (const s of [...spikes].sort((a, b) => b.height - a.height).slice(0, 18)) {
        for (let i = 0; i < 4; i++) {
          const image = sprites.debris.length ? sprites.debris[Math.floor(Math.random() * sprites.debris.length)] : undefined;
          sparks.push({
            x: s.x + drift(s) + s.lean * s.height,
            y: s.baseY - s.height,
            age: 0,
            life: rand(0.6, 1.1),
            size: (image ? rand(14, 28) : rand(2, 5)) * (0.4 + s.z) * (h / 900),
            vx: rand(-90, 90),
            vy: rand(-110, -20),
            image,
            spin: rand(-6, 6),
          });
        }
      }
      glint = -0.1;
    },
    step(dt) {
      time += dt;
      ctx.clearRect(0, 0, w, h);
      glint += dt * 0.18;
      if (glint > 1.4) glint = -0.4;

      // Brume au ras de l'horizon : le fond se noie, la profondeur se lit.
      const haze = ctx.createLinearGradient(0, 0, 0, h * 0.45);
      haze.addColorStop(0, `rgba(${rgb}, 0.16)`);
      haze.addColorStop(1, `rgba(${rgb}, 0)`);

      for (const s of spikes) {
        if (time > s.delay) s.grown = Math.min(1, s.grown + dt * 1.4);
        if (s.grown <= 0) continue;
        const img = sprites.pieces.length ? sprites.pieces[s.sprite % sprites.pieces.length] : undefined;
        if (img) drawSpriteSpike(s, img);
        else drawSpike(s);
      }
      ctx.fillStyle = haze;
      ctx.fillRect(0, 0, w, h * 0.45);

      // Scintillements : croix fines, comme un reflet de soleil sur un tesson.
      if (Math.random() < dt * 6) {
        const s = spikes[Math.floor(Math.random() * spikes.length)];
        if (s && s.grown >= 1) {
          const k = rand(0.3, 0.95);
          sparks.push({ x: s.x + drift(s) + s.lean * 0.3 * s.height * k, y: s.baseY - s.height * k, age: 0, life: rand(0.4, 0.8), size: rand(3, 7) * (0.4 + s.z) * (h / 900) });
        }
      }
      ctx.lineCap = "round";
      for (let i = sparks.length - 1; i >= 0; i--) {
        const p = sparks[i]!;
        p.age += dt;
        if (p.age >= p.life) {
          sparks.splice(i, 1);
          continue;
        }
        if (p.vx !== undefined) {
          p.x += p.vx * dt;
          p.y += (p.vy ?? 0) * dt;
          p.vy = (p.vy ?? 0) + 160 * dt;
        }
        const k = p.age / p.life;
        const a = Math.sin(k * Math.PI);
        if (p.image) {
          ctx.save();
          ctx.globalAlpha = Math.min(1, (1 - k) * 1.5);
          ctx.translate(p.x, p.y);
          ctx.rotate((p.spin ?? 0) * p.age);
          const pw = (p.size * 2 * p.image.naturalWidth) / p.image.naturalHeight;
          ctx.drawImage(p.image, -pw / 2, -p.size, pw, p.size * 2);
          ctx.restore();
          continue;
        }
        const r = p.size * (0.6 + a);
        ctx.strokeStyle = `rgba(${rgbHot}, ${a})`;
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(p.x - r, p.y);
        ctx.lineTo(p.x + r, p.y);
        ctx.moveTo(p.x, p.y - r);
        ctx.lineTo(p.x, p.y + r);
        ctx.stroke();
      }
    },
  };
}

function easeOutBack(t: number): number {
  const c = 1.4;
  return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2);
}

// ─────────────────────────────────────────────────────────────────────────
// CHAÎNE DE CONSTRUCTION — lourdes chaînes rouillées tendues en chaînette
// au-dessus et au-dessous du plateau, qui se tendent d'un coup au pulse.
// ─────────────────────────────────────────────────────────────────────────

interface ChainLine {
  /** Points d'accroche, en fraction de la scène. */
  from: [number, number];
  to: [number, number];
  sag: number;
  phase: number;
}

function chains(ctx: CanvasRenderingContext2D, rgb: string, rgbHot: string): LandeFx {
  let w = 0;
  let h = 0;
  let time = 0;
  let tension = 0;
  const embers: Spark[] = [];
  let sprites: LandeSprites = { pieces: [], debris: [], anchors: [] };
  const lines: ChainLine[] = [
    { from: [-0.05, 0.06], to: [1.05, 0.1], sag: 0.07, phase: 0 },
    { from: [-0.05, 0.94], to: [1.05, 0.9], sag: -0.05, phase: 1.7 },
    // Coins hauts : accrochées dans le cadre, l'anneau d'ancrage se voit.
    { from: [0.015, 0.32], to: [0.22, 0.015], sag: 0.03, phase: 0.6 },
    { from: [0.985, 0.32], to: [0.78, 0.015], sag: 0.03, phase: 2.4 },
  ];

  function point(line: ChainLine, t: number, sway: number): [number, number] {
    const x = (line.from[0] + (line.to[0] - line.from[0]) * t) * w;
    const yLin = line.from[1] + (line.to[1] - line.from[1]) * t;
    const sag = line.sag * (1 - tension * 0.7) * (1 + sway);
    return [x, (yLin + sag * 4 * t * (1 - t)) * h];
  }

  function drawLink(x: number, y: number, angle: number, size: number, faceOn: boolean) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    const g = ctx.createLinearGradient(0, -size, 0, size);
    // Fer rouillé : un seul reflet terne en haut, le reste brun sombre.
    g.addColorStop(0, `rgba(${rgb}, 0.95)`);
    g.addColorStop(0.35, "rgba(96, 52, 24, 0.97)");
    g.addColorStop(1, "rgba(28, 14, 6, 0.97)");
    ctx.strokeStyle = g;
    if (faceOn) {
      ctx.lineWidth = size * 0.42;
      ctx.beginPath();
      ctx.ellipse(0, 0, size * 1.05, size * 0.62, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = "rgba(0, 0, 0, 0.35)";
      ctx.lineWidth = size * 0.12;
      ctx.beginPath();
      ctx.ellipse(0, size * 0.06, size * 0.85, size * 0.4, 0, 0, Math.PI);
      ctx.stroke();
    } else {
      ctx.lineWidth = size * 0.48;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(-size * 1.05, 0);
      ctx.lineTo(size * 1.05, 0);
      ctx.stroke();
    }
    ctx.restore();
  }

  /**
   * Chaîne ILLUSTRÉE : les segments fournis, posés bout à bout le long de
   * la chaînette et tournés selon sa pente — la chaîne suit la taille de
   * l'écran sans qu'aucune image ne soit étirée. Un anneau à chaque
   * extrémité visible.
   */
  function drawSpriteChain(line: ChainLine, sway: number, size: number) {
    const height = size * 2.4;
    let t = 0;
    let piece = 0;
    while (t < 1) {
      const img = sprites.pieces[piece % sprites.pieces.length]!;
      const pw = (height * img.naturalWidth) / img.naturalHeight;
      const [x, y] = point(line, t, sway);
      // Avance d'une longueur de segment le long de la courbe.
      let t2 = t;
      let x2 = x;
      let y2 = y;
      while (t2 < 1 && Math.hypot(x2 - x, y2 - y) < pw * 0.92) {
        t2 = Math.min(1, t2 + 0.002);
        [x2, y2] = point(line, t2, sway);
      }
      ctx.save();
      ctx.translate((x + x2) / 2, (y + y2) / 2);
      ctx.rotate(Math.atan2(y2 - y, x2 - x));
      ctx.drawImage(img, -pw / 2, -height / 2, pw, height);
      ctx.restore();
      if (t2 >= 1) break;
      t = t2;
      piece += 1;
    }
    if (sprites.anchors.length) {
      [line.from, line.to].forEach((end, i) => {
        const [x, y] = [end[0] * w, end[1] * h];
        if (x < 0 || x > w || y < 0 || y > h) return;
        const a = sprites.anchors[i % sprites.anchors.length]!;
        const ah = size * 5;
        const aw = (ah * a.naturalWidth) / a.naturalHeight;
        ctx.drawImage(a, x - aw / 2, y - ah / 2, aw, ah);
      });
    }
  }

  return {
    setSprites(next) {
      sprites = next;
    },
    resize(width, height) {
      w = width;
      h = height;
    },
    pulse() {
      // La limite vient de mordre : les chaînes se tendent d'un coup et crachent de la rouille.
      tension = 1;
      for (let i = 0; i < 50; i++) {
        const line = lines[i % lines.length]!;
        const [x, y] = point(line, Math.random(), 0);
        embers.push({ x, y, age: 0, life: rand(0.5, 1.2), size: rand(1.5, 3.5) * (h / 900), vx: rand(-60, 60), vy: rand(-80, 10) });
      }
    },
    step(dt) {
      time += dt;
      tension = Math.max(0, tension - dt * 1.4);
      ctx.clearRect(0, 0, w, h);
      const size = Math.max(6, h * 0.016);
      ctx.shadowColor = "rgba(0, 0, 0, 0.6)";
      ctx.shadowBlur = size * 0.8;
      ctx.shadowOffsetY = size * 0.35;
      for (const line of lines) {
        const sway = Math.sin(time * 0.6 + line.phase) * 0.12;
        if (sprites.pieces.length) {
          drawSpriteChain(line, sway, size);
          continue;
        }
        const length = Math.hypot((line.to[0] - line.from[0]) * w, (line.to[1] - line.from[1]) * h) * 1.04;
        const links = Math.ceil(length / (size * 1.7));
        for (let i = 0; i < links; i++) {
          const t = i / links;
          const [x, y] = point(line, t, sway);
          const [x2, y2] = point(line, Math.min(1, t + 1 / links), sway);
          drawLink(x, y, Math.atan2(y2 - y, x2 - x), size, i % 2 === 0);
        }
      }
      ctx.shadowColor = "transparent";

      for (let i = embers.length - 1; i >= 0; i--) {
        const p = embers[i]!;
        p.age += dt;
        if (p.age >= p.life) {
          embers.splice(i, 1);
          continue;
        }
        p.x += (p.vx ?? 0) * dt;
        p.y += (p.vy ?? 0) * dt;
        p.vy = (p.vy ?? 0) + 220 * dt;
        const a = 1 - p.age / p.life;
        ctx.fillStyle = `rgba(${rgbHot}, ${a})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      }
    },
  };
}

export function createLandeFx(kind: LandeFxKind, ctx: CanvasRenderingContext2D, rgb: string, rgbHot: string): LandeFx {
  switch (kind) {
    case "acidRain":
      return acidRain(ctx, rgb, rgbHot);
    case "glassSpikes":
      return glassSpikes(ctx, rgb, rgbHot);
    case "chains":
      return chains(ctx, rgb, rgbHot);
  }
}
