/**
 * Cover pictures drawn in the browser: no AI service, no cost, instant.
 * Real-estate scenes (estate, land plots, city, dream home, open land) in the
 * team's colours. Each "seed" gives a different version of the same scene.
 *
 * Pictures are square and keep the important part in the middle, because the
 * cover styles crop them to tall, wide or square boxes.
 */
import type { Theme } from './templates';

export type Scene = 'estate' | 'plots' | 'city' | 'home' | 'fields';
export const SCENES: { id: Scene; name: string }[] = [
  { id: 'estate', name: 'Housing estate' },
  { id: 'plots', name: 'Land plots' },
  { id: 'city', name: 'City skyline' },
  { id: 'home', name: 'Dream home' },
  { id: 'fields', name: 'Land for sale' },
];

const SIZE = 1000;

/* ---------------------------------------------------------------- helpers */

function rng(seed: number) {
  let a = seed >>> 0 || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
type R = ReturnType<typeof rng>;
const between = (r: R, a: number, b: number) => a + r() * (b - a);
const pick = <T,>(r: R, list: T[]) => list[Math.floor(r() * list.length)];

const hex = (c: string) => (c.startsWith('#') ? c : `#${c}`);
function mix(a: string, b: string, t: number) {
  const pa = parseInt(a.replace('#', ''), 16);
  const pb = parseInt(b.replace('#', ''), 16);
  const ch = (s: number) => Math.round(((pa >> s) & 255) + (((pb >> s) & 255) - ((pa >> s) & 255)) * t);
  return `#${[16, 8, 0].map((s) => ch(s).toString(16).padStart(2, '0')).join('')}`;
}

function vGrad(g: CanvasRenderingContext2D, y0: number, y1: number, stops: string[]) {
  const gr = g.createLinearGradient(0, y0, 0, y1);
  stops.forEach((c, i) => gr.addColorStop(i / (stops.length - 1), c));
  return gr;
}

/** A soft hill line across the picture. */
function hills(g: CanvasRenderingContext2D, r: R, base: number, amp: number, color: string) {
  g.beginPath();
  g.moveTo(0, SIZE);
  const f1 = between(r, 0.004, 0.009);
  const f2 = between(r, 0.011, 0.02);
  const p1 = r() * 6;
  const p2 = r() * 6;
  for (let x = 0; x <= SIZE; x += 10) g.lineTo(x, base - Math.sin(x * f1 + p1) * amp - Math.sin(x * f2 + p2) * amp * 0.35);
  g.lineTo(SIZE, SIZE);
  g.closePath();
  g.fillStyle = color;
  g.fill();
}

function sun(g: CanvasRenderingContext2D, x: number, y: number, rad: number, color: string, sky: string) {
  for (let i = 4; i >= 1; i--) {
    g.beginPath();
    g.arc(x, y, rad * (1 + i * 0.35), 0, Math.PI * 2);
    g.fillStyle = mix(sky, color, 0.12 * (5 - i));
    g.fill();
  }
  g.beginPath();
  g.arc(x, y, rad, 0, Math.PI * 2);
  g.fillStyle = color;
  g.fill();
}

function palm(g: CanvasRenderingContext2D, x: number, y: number, h: number, color: string, lean: number) {
  g.strokeStyle = color;
  g.lineCap = 'round';
  g.lineWidth = h * 0.05;
  g.beginPath();
  g.moveTo(x, y);
  g.quadraticCurveTo(x + lean * 0.3, y - h * 0.5, x + lean, y - h);
  g.stroke();
  const tx = x + lean;
  const ty = y - h;
  g.fillStyle = color;
  for (let i = 0; i < 7; i++) {
    const a = -Math.PI / 2 + (i - 3) * 0.55;
    const len = h * 0.42;
    g.beginPath();
    g.moveTo(tx, ty);
    g.quadraticCurveTo(tx + Math.cos(a - 0.3) * len * 0.6, ty + Math.sin(a - 0.3) * len * 0.6 - h * 0.04, tx + Math.cos(a) * len, ty + Math.sin(a) * len + h * 0.12);
    g.quadraticCurveTo(tx + Math.cos(a + 0.2) * len * 0.5, ty + Math.sin(a + 0.2) * len * 0.5, tx, ty);
    g.fill();
  }
}

function house(g: CanvasRenderingContext2D, x: number, base: number, w: number, h: number, wall: string, roof: string, win: string, r: R) {
  const roofH = h * between(r, 0.35, 0.5);
  g.fillStyle = wall;
  g.fillRect(x, base - h, w, h);
  g.fillStyle = roof;
  g.beginPath();
  g.moveTo(x - w * 0.08, base - h);
  g.lineTo(x + w / 2, base - h - roofH);
  g.lineTo(x + w * 1.08, base - h);
  g.closePath();
  g.fill();
  // windows and door
  g.fillStyle = win;
  const ww = w * 0.2;
  g.fillRect(x + w * 0.14, base - h * 0.72, ww, ww);
  g.fillRect(x + w * 0.66, base - h * 0.72, ww, ww);
  g.fillStyle = roof;
  g.fillRect(x + w * 0.42, base - h * 0.45, w * 0.17, h * 0.45);
}

/* ---------------------------------------------------------------- scenes */

interface Colors {
  sky: string;
  skyLow: string;
  sun: string;
  far: string;
  mid: string;
  near: string;
  ground: string;
  primary: string;
  accent: string;
  ink: string;
  light: string;
}

function colors(t: Theme, r: R): Colors {
  const dusk = r() < 0.35;
  const sky = dusk ? mix(t.coverBg, '#1b1530', 0.35) : mix('#bfe3ff', t.primary, 0.18);
  return {
    sky,
    skyLow: dusk ? mix(t.accent, '#ffb36b', 0.4) : mix('#fff4dc', t.accent, 0.15),
    sun: dusk ? mix(t.accent, '#ffd27a', 0.5) : '#fff3c4',
    far: mix(mix('#7fb48a', t.primary, 0.25), sky, 0.45),
    mid: mix('#5f9e62', t.primary, 0.2),
    near: mix('#3d7a45', t.primary, 0.25),
    ground: mix('#c9a46a', t.accent, 0.15),
    primary: hex(t.primary),
    accent: hex(t.accent),
    ink: mix(t.coverBg, '#10151c', 0.5),
    light: '#fdfaf3',
  };
}

function estate(g: CanvasRenderingContext2D, c: Colors, r: R) {
  g.fillStyle = vGrad(g, 0, SIZE * 0.7, [c.sky, c.skyLow]);
  g.fillRect(0, 0, SIZE, SIZE);
  sun(g, between(r, 250, 750), between(r, 180, 300), 70, c.sun, c.skyLow);
  hills(g, r, 600, 50, c.far);
  hills(g, r, 690, 35, c.mid);
  // two rows of houses, back row smaller
  const walls = [c.light, mix(c.light, c.accent, 0.25), mix(c.light, c.primary, 0.15), '#f3e3c9'];
  for (const [base, scale] of [
    [700, 0.65],
    [800, 1],
  ] as const) {
    let x = between(r, -60, 0);
    while (x < SIZE) {
      const w = between(r, 120, 170) * scale;
      const h = between(r, 90, 130) * scale;
      house(g, x, base, w, h, pick(r, walls), r() < 0.5 ? c.primary : mix(c.primary, c.ink, 0.35), mix(c.sky, '#ffffff', 0.4), r);
      x += w + between(r, 20, 45) * scale;
    }
  }
  g.fillStyle = c.near;
  g.fillRect(0, 800, SIZE, 200);
  // road with dashes
  g.fillStyle = mix(c.ink, '#555', 0.4);
  g.fillRect(0, 860, SIZE, 70);
  g.fillStyle = c.light;
  for (let x = 20; x < SIZE; x += 90) g.fillRect(x, 892, 50, 7);
  palm(g, between(r, 40, 140), 860, 230, mix(c.near, c.ink, 0.5), 30);
  palm(g, between(r, 850, 960), 860, 260, mix(c.near, c.ink, 0.5), -40);
}

function plots(g: CanvasRenderingContext2D, c: Colors, r: R) {
  // Aerial view of a surveyed layout
  g.fillStyle = mix('#7fae5c', c.primary, 0.12);
  g.fillRect(0, 0, SIZE, SIZE);
  const cell = between(r, 120, 150);
  const road = 34;
  const greens = ['#8cbf63', '#9fca6c', '#b8d27c', '#d9c28a', '#c7b07a'];
  const chosen = [6, 6];
  const cellX = (i: number) => i * (cell + 6) + Math.floor(i / 3) * road;
  const cellY = (j: number) => j * (cell + 6) + Math.floor(j / 2) * road;
  g.save();
  // Centre the chosen plot in the picture, then tilt the whole layout a little.
  g.translate(SIZE / 2, SIZE / 2);
  g.rotate(between(r, -0.35, 0.35));
  g.translate(-(cellX(chosen[0]) + cell / 2), -(cellY(chosen[1]) + cell / 2));
  for (let i = 0; i < 13; i++)
    for (let j = 0; j < 13; j++) {
      const x = cellX(i);
      const y = cellY(j);
      g.fillStyle = mix(pick(r, greens), c.primary, 0.08);
      g.fillRect(x, y, cell, cell);
      // survey pegs at corners
      g.fillStyle = c.accent;
      g.fillRect(x - 4, y - 4, 8, 8);
      if (r() < 0.12) {
        // a tree or two
        g.fillStyle = mix('#2f6b33', c.primary, 0.15);
        g.beginPath();
        g.arc(x + between(r, 30, cell - 30), y + between(r, 30, cell - 30), between(r, 14, 26), 0, Math.PI * 2);
        g.fill();
      }
      if (r() < 0.1 && !(i === chosen[0] && j === chosen[1])) {
        // a finished building seen from above
        g.fillStyle = c.light;
        g.fillRect(x + cell * 0.25, y + cell * 0.25, cell * 0.5, cell * 0.4);
        g.fillStyle = c.primary;
        g.fillRect(x + cell * 0.25, y + cell * 0.25, cell * 0.5, cell * 0.08);
      }
      if (i === chosen[0] && j === chosen[1]) {
        g.strokeStyle = c.accent;
        g.lineWidth = 10;
        g.setLineDash([22, 12]);
        g.strokeRect(x + 6, y + 6, cell - 12, cell - 12);
        g.setLineDash([]);
      }
    }
  g.restore();
  // a map pin on the chosen plot (screen centre)
  const px = SIZE / 2;
  const py = SIZE / 2 - 120; // the pin's tip touches the middle of the chosen plot
  g.fillStyle = 'rgba(0,0,0,0.18)';
  g.beginPath();
  g.ellipse(px, py + 120, 40, 12, 0, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = c.accent;
  g.beginPath();
  g.arc(px, py, 58, Math.PI, 0);
  g.quadraticCurveTo(px + 58, py + 50, px, py + 120);
  g.quadraticCurveTo(px - 58, py + 50, px - 58, py);
  g.fill();
  g.fillStyle = c.light;
  g.beginPath();
  g.arc(px, py, 24, 0, Math.PI * 2);
  g.fill();
}

function city(g: CanvasRenderingContext2D, c: Colors, r: R) {
  g.fillStyle = vGrad(g, 0, 640, [mix(c.sky, c.ink, 0.25), c.skyLow]);
  g.fillRect(0, 0, SIZE, SIZE);
  sun(g, between(r, 300, 700), between(r, 330, 430), 80, c.sun, c.skyLow);
  const water = 650;
  // back towers
  for (const [shade, minH, maxH, wMin, wMax] of [
    [0.55, 160, 300, 60, 110],
    [0.8, 120, 420, 70, 130],
  ] as const) {
    let x = between(r, -40, 0);
    while (x < SIZE) {
      const w = between(r, wMin, wMax);
      const h = between(r, minH, maxH) * (Math.abs(x + w / 2 - SIZE / 2) < 220 ? 1.25 : 1);
      const col = mix(c.skyLow, c.ink, shade);
      g.fillStyle = col;
      g.fillRect(x, water - h, w, h);
      if (shade > 0.7) {
        g.fillStyle = mix(c.sun, col, 0.35);
        for (let wy = water - h + 16; wy < water - 20; wy += 26)
          for (let wx = x + 10; wx < x + w - 16; wx += 20) if (r() < 0.45) g.fillRect(wx, wy, 9, 12);
        if (r() < 0.3) {
          g.fillStyle = c.accent;
          g.fillRect(x + w / 2 - 3, water - h - 40, 6, 40);
        }
      }
      x += w + between(r, 4, 18);
    }
  }
  // lagoon with reflections
  g.fillStyle = vGrad(g, water, SIZE, [mix(c.primary, c.ink, 0.3), mix(c.primary, c.ink, 0.6)]);
  g.fillRect(0, water, SIZE, SIZE - water);
  g.fillStyle = mix(c.sun, c.primary, 0.3);
  for (let y = water + 14; y < SIZE; y += 22) {
    const w = between(r, 60, 220) * (1 - (y - water) / 500);
    g.fillRect(SIZE / 2 - w / 2 + between(r, -60, 60), y, w, 4);
  }
  // bridge
  g.strokeStyle = mix(c.ink, '#000', 0.2);
  g.lineWidth = 14;
  g.beginPath();
  g.moveTo(0, water + 90);
  g.quadraticCurveTo(SIZE / 2, water + 40, SIZE, water + 90);
  g.stroke();
  g.lineWidth = 4;
  for (let x = 60; x < SIZE; x += 150) {
    g.beginPath();
    g.moveTo(x, water + 70 + Math.abs(x - SIZE / 2) * 0.05);
    g.lineTo(x, SIZE);
    g.stroke();
  }
}

function home(g: CanvasRenderingContext2D, c: Colors, r: R) {
  g.fillStyle = vGrad(g, 0, 700, [c.sky, c.skyLow]);
  g.fillRect(0, 0, SIZE, SIZE);
  sun(g, between(r, 680, 820), 200, 60, c.sun, c.sky);
  hills(g, r, 640, 30, c.far);
  // lawn
  g.fillStyle = c.near;
  g.fillRect(0, 760, SIZE, 240);
  const wall = r() < 0.5 ? c.light : '#efe6d6';
  const trim = mix(c.ink, c.primary, 0.3);
  const glass = mix(c.sky, '#dff3ff', 0.5);
  // modern duplex: two stacked boxes, flat roofs
  g.fillStyle = 'rgba(0,0,0,0.15)';
  g.fillRect(205, 760, 620, 18);
  g.fillStyle = wall;
  g.fillRect(200, 520, 600, 240); // ground floor
  g.fillRect(320, 330, 440, 200); // upper floor
  g.fillStyle = trim;
  g.fillRect(180, 505, 640, 20); // slab
  g.fillRect(300, 312, 480, 22); // roof
  g.fillStyle = c.primary;
  g.fillRect(200, 525, 110, 235); // feature wall
  // glass
  g.fillStyle = glass;
  g.fillRect(350, 370, 160, 120);
  g.fillRect(540, 370, 190, 120);
  g.fillRect(340, 570, 200, 150);
  g.fillStyle = trim;
  for (const x of [430, 635, 440]) g.fillRect(x, x === 440 ? 570 : 370, 6, x === 440 ? 150 : 120);
  // door
  g.fillStyle = mix(c.accent, '#5a3a1a', 0.45);
  g.fillRect(600, 590, 90, 170);
  g.fillStyle = c.accent;
  g.fillRect(672, 670, 8, 24);
  // balcony rail
  g.fillStyle = trim;
  g.fillRect(320, 490, 440, 8);
  for (let x = 330; x < 760; x += 24) g.fillRect(x, 470, 4, 24);
  // path, hedges, gate
  g.fillStyle = mix(c.ground, '#ffffff', 0.25);
  g.beginPath();
  g.moveTo(600, 760);
  g.lineTo(690, 760);
  g.lineTo(760, SIZE);
  g.lineTo(560, SIZE);
  g.fill();
  g.fillStyle = mix(c.near, '#1f4d24', 0.4);
  for (let x = 0; x < SIZE; x += 52) if (x < 540 || x > 760) {
    g.beginPath();
    g.arc(x + 26, 790, 30, Math.PI, 0);
    g.fill();
  }
  palm(g, 110, 780, 330, mix(c.near, c.ink, 0.45), 25);
  palm(g, 900, 780, 290, mix(c.near, c.ink, 0.45), -30);
}

function fields(g: CanvasRenderingContext2D, c: Colors, r: R) {
  g.fillStyle = vGrad(g, 0, 650, [c.sky, c.skyLow]);
  g.fillRect(0, 0, SIZE, SIZE);
  sun(g, between(r, 200, 800), between(r, 200, 320), 75, c.sun, c.skyLow);
  hills(g, r, 560, 60, c.far);
  hills(g, r, 650, 45, c.mid);
  hills(g, r, 760, 30, c.near);
  g.fillStyle = mix(c.near, c.ground, 0.25);
  g.fillRect(0, 820, SIZE, 180);
  // a red-earth path to the horizon
  g.fillStyle = mix('#b5652f', c.accent, 0.2);
  g.beginPath();
  g.moveTo(430, SIZE);
  g.quadraticCurveTo(520, 760, 505, 640);
  g.lineTo(520, 640);
  g.quadraticCurveTo(560, 760, 640, SIZE);
  g.fill();
  // survey pegs along the path
  g.fillStyle = c.accent;
  for (let i = 0; i < 6; i++) {
    const t = i / 6;
    const y = SIZE - t * 330;
    const spread = 160 * (1 - t) + 20;
    g.fillRect(520 - spread - 4, y - 18 * (1 - t) - 6, 8 * (1 - t) + 3, 18 * (1 - t) + 6);
    g.fillRect(520 + spread, y - 18 * (1 - t) - 6, 8 * (1 - t) + 3, 18 * (1 - t) + 6);
  }
  // FOR SALE signboard
  const sx = between(r, 150, 260);
  g.fillStyle = mix(c.ink, '#5a3a1a', 0.4);
  g.fillRect(sx + 20, 640, 14, 210);
  g.fillRect(sx + 196, 640, 14, 210);
  g.fillStyle = c.primary;
  g.fillRect(sx, 560, 230, 130);
  g.fillStyle = c.accent;
  g.fillRect(sx, 660, 230, 30);
  g.fillStyle = c.light;
  g.font = 'bold 50px Arial, sans-serif';
  g.textAlign = 'center';
  g.fillText('LAND', sx + 115, 612);
  g.font = 'bold 26px Arial, sans-serif';
  g.fillText('FOR SALE', sx + 115, 648);
  palm(g, between(r, 780, 900), 840, 300, mix(c.near, c.ink, 0.45), -35);
  palm(g, between(r, 700, 760), 800, 200, mix(c.mid, c.ink, 0.4), 20);
}

const DRAW: Record<Scene, (g: CanvasRenderingContext2D, c: Colors, r: R) => void> = { estate, plots, city, home, fields };

/** Draws a scene on a canvas you provide (used by tests/previews). */
export function drawCover(canvas: HTMLCanvasElement, scene: Scene, theme: Theme, seed: number) {
  canvas.width = SIZE;
  canvas.height = SIZE;
  const g = canvas.getContext('2d')!;
  const r = rng(seed);
  DRAW[scene](g, colors(theme, r), r);
  // gentle vignette so text on top stays readable
  const v = g.createRadialGradient(SIZE / 2, SIZE / 2, SIZE * 0.35, SIZE / 2, SIZE / 2, SIZE * 0.75);
  v.addColorStop(0, 'rgba(0,0,0,0)');
  v.addColorStop(1, 'rgba(0,0,0,0.22)');
  g.fillStyle = v;
  g.fillRect(0, 0, SIZE, SIZE);
}

/** A ready-to-save cover picture (small JPEG data URL). */
export function generateCover(scene: Scene, theme: Theme, seed: number): string {
  const canvas = document.createElement('canvas');
  drawCover(canvas, scene, theme, seed);
  return canvas.toDataURL('image/jpeg', 0.82);
}

export const randomSeed = () => Math.floor(Math.random() * 2 ** 31);
