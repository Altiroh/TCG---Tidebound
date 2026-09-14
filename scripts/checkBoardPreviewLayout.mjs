/**
 * Audit responsive du laboratoire de layout (`/game/board-preview`).
 *
 * Ouvre la page dans un vrai navigateur à chaque résolution cible et
 * vérifie, mesures à l'appui, ce qu'un oeil rate facilement :
 *   - débordement du document (barre de défilement fantôme) ;
 *   - carte de plateau ou pile coupée par un bord de l'écran (les deux mains,
 *     elles, sont VOLONTAIREMENT coupées en haut / en bas : seul un
 *     débordement latéral est un défaut) ;
 *   - contrôle de HUD hors écran ;
 *   - colonne de droite / HUD d'angle posés sur un élément de gameplay ;
 *   - zones adverse / centre / joueur qui se chevauchent ;
 *   - plateaux et piste de Marée qui ne partagent plus le même axe ;
 *   - erreurs console.
 *
 * Usage :
 *   npm run dev                       # dans un autre terminal
 *   npm run check:board-preview
 *   npm run check:board-preview -- --shots ./captures   # + captures d'écran
 *   BOARD_PREVIEW_URL=http://localhost:3001 npm run check:board-preview
 *
 * Playwright n'est PAS une dépendance du projet (plusieurs centaines de Mo
 * de navigateurs pour un outil de confort) : le script explique comment
 * l'installer s'il manque. Code de sortie 1 si un problème est détecté, ce
 * qui le rend utilisable tel quel dans une CI qui, elle, l'installerait.
 */

const BASE_URL = process.env.BOARD_PREVIEW_URL ?? "http://127.0.0.1:3000";
const PATHNAME = "/game/board-preview";

/** Résolutions cibles : desktop large, laptop, mobile paysage, puis quelques formats hors cible qui ne doivent pas casser. */
const VIEWPORTS = [
  { w: 2560, h: 1440 },
  { w: 1920, h: 1080 },
  { w: 1600, h: 900 },
  { w: 1440, h: 900 },
  { w: 1366, h: 768 },
  { w: 1280, h: 720 },
  { w: 932, h: 430 },
  { w: 896, h: 414 },
  { w: 844, h: 390 },
  { w: 740, h: 360 },
  { w: 3440, h: 1440, extra: true },
  { w: 1024, h: 600, extra: true },
  { w: 800, h: 600, extra: true },
  { w: 430, h: 932, extra: true },
];

/** Tolérance en pixels : un arrondi de rendu sub-pixel n'est pas un défaut de layout. */
const EPSILON = 1;

async function loadPlaywright() {
  try {
    return await import("playwright");
  } catch {
    console.error(
      [
        "Playwright est introuvable — il n'est pas installé par défaut dans ce projet.",
        "",
        "  npm i -D playwright && npx playwright install chromium",
        "",
        "…puis relancer `npm run check:board-preview`.",
      ].join("\n")
    );
    process.exit(2);
  }
}

/**
 * Exécuté DANS la page : toute la géométrie est lue sur le DOM réel plutôt
 * que recalculée ici, pour mesurer ce que le navigateur affiche vraiment.
 */
function collectReport(epsilon) {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const rect = (el) => {
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.x, y: r.y, w: r.width, h: r.height, right: r.right, bottom: r.bottom };
  };
  const rects = (sel) => [...document.querySelectorAll(sel)].map(rect);
  const zone = (name) => rect(document.querySelector(`[data-zone="${name}"]`));
  const outside = (r) => r && (r.x < -epsilon || r.y < -epsilon || r.right > vw + epsilon || r.bottom > vh + epsilon);
  const overlap = (a, b) => {
    if (!a || !b) return null;
    const x = Math.min(a.right, b.right) - Math.max(a.x, b.x);
    const y = Math.min(a.bottom, b.bottom) - Math.max(a.y, b.y);
    return x > epsilon && y > epsilon ? { x: Math.round(x), y: Math.round(y) } : null;
  };

  // Classes CSS Modules : `BoardPreview_<nom>__<hash>`. Le `_<nom>__` évite
  // que `card` attrape aussi `cardBack`, `handCard`, etc.
  const cls = (name) => `[class*="_${name}__"]`;

  const zones = {
    OpponentHand: zone("OpponentHand"),
    OpponentZone: zone("OpponentZone"),
    OpponentBoard: zone("OpponentBoard"),
    CenterZone: zone("CenterZone"),
    PlayerZone: zone("PlayerZone"),
    PlayerBoard: zone("PlayerBoard"),
    PlayerHand: zone("PlayerHand"),
    SideRail: zone("SideRail"),
  };

  const stage = document.querySelector('[data-zone="OpponentZone"]')?.parentElement ?? null;
  const breakpoint = stage
    ? getComputedStyle(stage).getPropertyValue("--bp").trim().replace(/^"|"$/g, "")
    : "?";

  // Plateaux, piles, navires et tuile doivent être ENTIÈREMENT à l'écran.
  const boardItems = rects(`${cls("boardSlot")}, ${cls("cargo")}, ${cls("ship")}, ${cls("tideTile")}`).filter((r) => r && r.w > 5);
  // Les mains sont coupées en haut / en bas par construction : seul un
  // débordement latéral compte.
  const handItems = rects(`${cls("handCard")}, ${cls("cardBack")}`);
  const hudControls = rects(`${cls("hudButton")}, ${cls("hudChip")}, ${cls("phaseButton")}`);
  const hudBlocks = rects(`${cls("rail")}, ${cls("hudCornerTop")}, ${cls("hudCornerBottom")}`);
  const gameplay = [...boardItems, ...rects(cls("tide")), ...handItems];

  const problems = [];
  const docOverflowX = document.documentElement.scrollWidth - vw;
  const docOverflowY = document.documentElement.scrollHeight - vh;
  if (docOverflowX > epsilon || docOverflowY > epsilon)
    problems.push(`débordement du document (${docOverflowX}×${docOverflowY} px)`);

  const clipped = boardItems.filter(outside).length;
  if (clipped) problems.push(`${clipped} élément(s) de plateau coupé(s) par un bord`);

  const handOut = handItems.filter((r) => r.x < -epsilon || r.right > vw + epsilon).length;
  if (handOut) problems.push(`${handOut} carte(s) de main sortie(s) par un côté`);

  const hudOut = hudControls.filter(outside).length;
  if (hudOut) problems.push(`${hudOut} contrôle(s) de HUD hors écran`);

  const hudHits = hudBlocks.reduce((n, g) => n + gameplay.filter((c) => overlap(g, c)).length, 0);
  if (hudHits) problems.push(`HUD superposé à ${hudHits} élément(s) de gameplay`);

  for (const [a, b] of [
    ["OpponentZone", "CenterZone"],
    ["CenterZone", "PlayerZone"],
    ["OpponentZone", "PlayerZone"],
    ["OpponentHand", "OpponentZone"],
    ["PlayerZone", "PlayerHand"],
  ])
    if (overlap(zones[a], zones[b])) problems.push(`${a} et ${b} se chevauchent`);

  // Plateaux, piste de Marée et mains partagent l'axe vertical de l'écran.
  const axis = (r) => r && r.x + r.w / 2;
  for (const [name, r] of [
    ["OpponentBoard", zones.OpponentBoard],
    ["PlayerBoard", zones.PlayerBoard],
    ["Marée", rect(document.querySelector(cls("tide")))],
    ["OpponentHand", rect(document.querySelector(cls("opponentHandRow")))],
    ["PlayerHand", rect(document.querySelector(cls("handRow")))],
  ]) {
    if (!r) continue;
    const offset = Math.abs(axis(r) - vw / 2);
    if (offset > 2) problems.push(`${name} décentré de ${Math.round(offset)} px`);
  }

  const firstCard = rect(document.querySelector(`[data-zone="PlayerBoard"] ${cls("boardSlot")}`));
  return {
    breakpoint,
    problems,
    card: firstCard ? `${Math.round(firstCard.w)}×${Math.round(firstCard.h)}` : "?",
    margins: zones.OpponentZone &&
      zones.CenterZone &&
      zones.PlayerZone && [
        Math.round(zones.OpponentZone.y),
        Math.round(zones.CenterZone.y - zones.OpponentZone.bottom),
        Math.round(zones.PlayerZone.y - zones.CenterZone.bottom),
        Math.round(vh - zones.PlayerZone.bottom),
      ],
  };
}

const { chromium } = await loadPlaywright();
const shotsFlag = process.argv.indexOf("--shots");
const shotsDir = shotsFlag === -1 ? null : process.argv[shotsFlag + 1] ?? "./board-preview-shots";

const browser = await chromium.launch();
let failures = 0;

console.log(`Audit de ${BASE_URL}${PATHNAME}\n`);

for (const { w, h, extra } of VIEWPORTS) {
  const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
  const consoleErrors = [];
  page.on("pageerror", (error) => consoleErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });

  try {
    await page.goto(`${BASE_URL}${PATHNAME}`, { waitUntil: "networkidle" });
    await page.waitForSelector('[data-zone="PlayerHand"]');
    // Laisse le temps aux polices de se substituer : une carte mesurée
    // pendant le FOUT donne des hauteurs de texte trompeuses.
    await page.waitForTimeout(250);

    const report = await page.evaluate(collectReport, EPSILON);
    if (consoleErrors.length) report.problems.push(`console : ${consoleErrors.join(" | ")}`);

    const status = report.problems.length ? "KO" : "OK";
    if (report.problems.length) failures += 1;
    console.log(
      `${status}  ${`${w}×${h}`.padEnd(10)} ${report.breakpoint.padEnd(17)} carte ${report.card.padEnd(8)}` +
        `marges ${report.margins ? report.margins.join("/") : "?"}${extra ? "  (hors cible)" : ""}`
    );
    for (const problem of report.problems) console.log(`      → ${problem}`);

    if (shotsDir) await page.screenshot({ path: `${shotsDir}/${w}x${h}.png` });
  } catch (error) {
    failures += 1;
    console.log(`KO  ${`${w}×${h}`.padEnd(10)} ${error.message}`);
  } finally {
    await page.close();
  }
}

await browser.close();
console.log(failures ? `\n${failures} résolution(s) en défaut.` : "\nAucun problème détecté.");
process.exit(failures ? 1 : 0);
