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
   * Pièces illustrées chargées (`LandeScene.sprites`, `debris`, `anchor`) :
   * dès qu'il y en a, l'effet les place à la place de ses propres dessins.
   */
  setSprites(sprites: LandeSprites): void;
}

export interface LandeSprites {
  pieces: HTMLImageElement[];
  debris: HTMLImageElement[];
  anchor?: HTMLImageElement;
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
// VALLÉE DE VERRE — pics cristallins qui sortent des bords, reflets qui
// glissent, éclats qui scintillent.
// ─────────────────────────────────────────────────────────────────────────

interface Spike {
  /** Base, sur le bord. */
  x: number;
  edge: "top" | "bottom";
  width: number;
  height: number;
  lean: number;
  grown: number;
  delay: number;
  facet: number;
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

function glassSpikes(ctx: CanvasRenderingContext2D, rgb: string, rgbHot: string): LandeFx {
  let w = 0;
  let h = 0;
  let spikes: Spike[] = [];
  const sparks: Spark[] = [];
  let time = 0;
  let glint = -0.3;
  let sprites: LandeSprites = { pieces: [], debris: [] };

  /**
   * Pic ILLUSTRÉ : la pièce sort de la mer pointe la première — on n'en
   * montre que la partie haute, qui grandit — légèrement penchée, et un
   * second passage additif fait le reflet qui balaie le plateau.
   */
  function drawSpriteSpike(s: Spike, img: HTMLImageElement) {
    const total = s.height * 1.35;
    const visible = total * Math.max(0, easeOutBack(s.grown));
    if (visible <= 1) return;
    const dw = (total * img.naturalWidth) / img.naturalHeight;
    const shown = Math.min(1, visible / total);
    ctx.save();
    ctx.translate(s.x, s.edge === "bottom" ? h + 4 : -4);
    if (s.edge === "top") ctx.scale(1, -1);
    ctx.rotate(s.lean * 0.35);
    const draw = () => ctx.drawImage(img, 0, 0, img.naturalWidth, img.naturalHeight * shown, -dw / 2, -visible, dw, visible);
    draw();
    const lit = Math.max(0, 1 - Math.abs(s.x / w - glint) * 9);
    if (lit > 0.05) {
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = lit * 0.55;
      draw();
    }
    ctx.restore();
    if (lit > 0.6 && s.grown >= 1 && Math.random() < 0.08) {
      const dir = s.edge === "bottom" ? -1 : 1;
      sparks.push({ x: s.x + s.lean * 0.35 * visible, y: (s.edge === "bottom" ? h : 0) + dir * visible * 0.92, age: 0, life: 0.5, size: rand(4, 9) * (h / 900) });
    }
  }

  function seed() {
    spikes = [];
    for (const edge of ["bottom", "top"] as const) {
      const count = Math.round((w / 1600) * (edge === "bottom" ? 34 : 22));
      for (let i = 0; i < count; i++) {
        // Plus hauts vers les coins, plus bas au centre : le plateau reste dégagé.
        const x = rand(-0.02, 1.02) * w;
        const centre = Math.abs(x / w - 0.5) * 2;
        const scale = (edge === "bottom" ? 0.16 : 0.1) * h * (0.35 + 0.9 * centre * centre);
        spikes.push({
          x,
          edge,
          width: rand(0.012, 0.03) * w,
          height: scale * rand(0.6, 1.25),
          lean: rand(-0.35, 0.35),
          grown: 0,
          delay: rand(0, 0.9),
          facet: rand(0.35, 0.65),
          sprite: Math.floor(Math.random() * 1000),
        });
      }
    }
    // Les plus grands derrière : ils ne mangent pas les petits.
    spikes.sort((a, b) => b.height - a.height);
  }

  function drawSpike(s: Spike) {
    const dir = s.edge === "bottom" ? -1 : 1;
    const baseY = s.edge === "bottom" ? h + 4 : -4;
    const height = s.height * easeOutBack(s.grown);
    const tipX = s.x + s.lean * height;
    const tipY = baseY + dir * height;
    const left = s.x - s.width / 2;
    const right = s.x + s.width / 2;
    const midX = left + s.width * s.facet;

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

    // Arête vive, et reflet qui balaie le plateau de gauche à droite.
    const lit = Math.max(0, 1 - Math.abs(s.x / w - glint) * 9);
    ctx.strokeStyle = `rgba(${rgbHot}, ${0.35 + 0.65 * lit})`;
    ctx.lineWidth = 1 + lit * 1.5;
    ctx.beginPath();
    ctx.moveTo(midX, baseY);
    ctx.lineTo(tipX, tipY);
    ctx.stroke();
    if (lit > 0.6 && s.grown >= 1 && Math.random() < 0.08) sparks.push({ x: tipX, y: tipY, age: 0, life: 0.5, size: rand(4, 9) * (h / 900) });
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
      // Un tour de table de plus : la vallée se fend — éclats projetés depuis les pointes.
      for (const s of spikes.slice(0, 18)) {
        const dir = s.edge === "bottom" ? -1 : 1;
        const tipY = (s.edge === "bottom" ? h : 0) + dir * s.height;
        for (let i = 0; i < 4; i++) {
          const image = sprites.debris.length ? sprites.debris[Math.floor(Math.random() * sprites.debris.length)] : undefined;
          sparks.push({
            x: s.x + s.lean * s.height,
            y: tipY,
            age: 0,
            life: rand(0.6, 1.1),
            size: (image ? rand(14, 28) : rand(2, 5)) * (h / 900),
            vx: rand(-90, 90),
            vy: rand(-60, 60) - dir * 40,
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
      glint += dt * 0.22;
      if (glint > 1.4) glint = -0.4;

      for (const s of spikes) {
        if (time > s.delay) s.grown = Math.min(1, s.grown + dt * 1.6);
        if (s.grown <= 0) continue;
        const img = sprites.pieces.length ? sprites.pieces[s.sprite % sprites.pieces.length] : undefined;
        if (img) drawSpriteSpike(s, img);
        else drawSpike(s);
      }

      // Scintillements : croix fines, comme un reflet de soleil sur un tesson.
      if (Math.random() < dt * 6) {
        const s = spikes[Math.floor(Math.random() * spikes.length)];
        if (s && s.grown >= 1) {
          const dir = s.edge === "bottom" ? -1 : 1;
          const k = rand(0.3, 0.95);
          sparks.push({ x: s.x + s.lean * s.height * k, y: (s.edge === "bottom" ? h : 0) + dir * s.height * k, age: 0, life: rand(0.4, 0.8), size: rand(3, 7) * (h / 900) });
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
  let sprites: LandeSprites = { pieces: [], debris: [] };
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
    if (sprites.anchor) {
      const a = sprites.anchor;
      const aw = (size * 4 * a.naturalWidth) / a.naturalHeight;
      for (const end of [line.from, line.to]) {
        const [x, y] = [end[0] * w, end[1] * h];
        if (x < 0 || x > w || y < 0 || y > h) continue;
        ctx.drawImage(a, x - aw / 2, y - size * 2, aw, size * 4);
      }
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
