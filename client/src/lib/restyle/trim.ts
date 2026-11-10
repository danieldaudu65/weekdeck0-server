/**
 * Finds the real photo inside a screenshot (a picture saved from Google, a
 * phone screen, a web page): the plain bars, borders and text around it are
 * left out. Works on small RGBA pixels, so it runs the same in tests.
 */

export interface Area {
  x: number;
  y: number;
  w: number;
  h: number;
}

const BIN = (r: number, g: number, b: number) => ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);

/** The screen's plain colours: grey-ish colours that cover the picture's edge. */
function plainColours(d: Uint8ClampedArray, w: number, h: number): number[][] {
  const count = new Map<number, { n: number; r: number; g: number; b: number }>();
  let edge = 0;
  const add = (x: number, y: number) => {
    const i = (y * w + x) * 4;
    const r = d[i], g = d[i + 1], b = d[i + 2];
    edge++;
    if (Math.max(r, g, b) - Math.min(r, g, b) > 40) return; // coloured: part of a photo
    const k = BIN(r, g, b);
    const c = count.get(k) ?? { n: 0, r: 0, g: 0, b: 0 };
    c.n++;
    c.r += r;
    c.g += g;
    c.b += b;
    count.set(k, c);
  };
  for (let x = 0; x < w; x++) {
    add(x, 0);
    add(x, h - 1);
  }
  for (let y = 1; y < h - 1; y++) {
    add(0, y);
    add(w - 1, y);
  }
  return [...count.values()].filter((c) => c.n >= edge * 0.05).map((c) => [c.r / c.n, c.g / c.n, c.b / c.n]);
}

/** The longest stretch of lines that look like photo (small gaps allowed). */
function longestRun(score: number[], min: number, gap: number): [number, number] | null {
  let best: [number, number] | null = null;
  let start = -1;
  let lastGood = -1;
  for (let i = 0; i <= score.length; i++) {
    const good = i < score.length && score[i] >= min;
    if (good) {
      if (start < 0 || i - lastGood > gap + 1) {
        if (start >= 0 && (!best || lastGood - start > best[1] - best[0])) best = [start, lastGood];
        start = i;
      }
      lastGood = i;
    }
  }
  if (start >= 0 && (!best || lastGood - start > best[1] - best[0])) best = [start, lastGood];
  return best;
}

/**
 * The photo's place in the picture (fractions of its size), or null when the
 * picture is already just a photo.
 */
export function mainArea(d: Uint8ClampedArray, w: number, h: number): Area | null {
  if (w < 24 || h < 24) return null;
  const bg = plainColours(d, w, h);
  if (!bg.length) return null;
  const busy = new Uint8Array(w * h);
  for (let p = 0; p < w * h; p++) {
    const r = d[p * 4], g = d[p * 4 + 1], b = d[p * 4 + 2];
    busy[p] = bg.every(([R, G, B]) => Math.abs(r - R) + Math.abs(g - G) + Math.abs(b - B) > 42) ? 1 : 0;
  }
  let x0 = 0, x1 = w - 1, y0 = 0, y1 = h - 1;
  const rows = () => {
    const s: number[] = [];
    for (let y = 0; y < h; y++) {
      let n = 0;
      for (let x = x0; x <= x1; x++) n += busy[y * w + x];
      s.push(n / (x1 - x0 + 1));
    }
    return s;
  };
  const cols = () => {
    const s: number[] = [];
    for (let x = 0; x < w; x++) {
      let n = 0;
      for (let y = y0; y <= y1; y++) n += busy[y * w + x];
      s.push(n / (y1 - y0 + 1));
    }
    return s;
  };
  for (let pass = 0; pass < 2; pass++) {
    const r = longestRun(rows(), 0.5, Math.max(1, Math.round(h * 0.02)));
    if (!r) return null;
    [y0, y1] = r;
    const c = longestRun(cols(), 0.5, Math.max(1, Math.round(w * 0.02)));
    if (!c) return null;
    [x0, x1] = c;
  }
  const cw = x1 - x0 + 1, ch = y1 - y0 + 1;
  // Too small to be "the" photo, or nothing worth cutting.
  if (cw * ch < w * h * 0.18 || cw < w * 0.3 || ch < h * 0.3) return null;
  if (cw > w * 0.96 && ch > h * 0.96) return null;
  // What's cut away must be mostly plain screen (bars, margins, a few words), not photo.
  // Screen bars are perfectly flat; a pale sky or wall in a photo never is.
  let cutBusy = 0, cutAll = 0, flat = 0;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      if (x >= x0 && x <= x1 && y >= y0 && y <= y1) continue;
      cutAll++;
      const p = y * w + x;
      cutBusy += busy[p];
      const i = p * 4;
      if (x + 1 < w && Math.abs(d[i] - d[i + 4]) + Math.abs(d[i + 1] - d[i + 5]) + Math.abs(d[i + 2] - d[i + 6]) <= 3 && (y + 1 >= h || Math.abs(d[i] - d[i + w * 4]) + Math.abs(d[i + 1] - d[i + w * 4 + 1]) + Math.abs(d[i + 2] - d[i + w * 4 + 2]) <= 3)) flat++;
    }
  if (cutAll && (cutBusy / cutAll > 0.35 || flat / cutAll < 0.55)) return null;
  // The edge line is half screen, half photo at this small size: step in past it.
  const inset = (cut: boolean) => (cut ? 1.2 : 0);
  const l = inset(x0 > 0), t = inset(y0 > 0), r = inset(x1 < w - 1), b = inset(y1 < h - 1);
  return { x: (x0 + l) / w, y: (y0 + t) / h, w: (cw - l - r) / w, h: (ch - t - b) / h };
}
