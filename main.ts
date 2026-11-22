// Ember Picture Tastes — one ingredient: maple syrup.
// A stack of golden pancakes drowned in glossy maple syrup, butter
// melting on top, steam curling up. Drawn pixel by pixel in pure
// TypeScript: a tiny software rasteriser + a hand-rolled PNG encoder
// (zlib from Node, CRC32 table). No assets, no network, no deps.
import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";

const W = 1024;
const H = 1024;
const fb = new Uint8Array(W * H * 3);

// Deterministic PRNG so the two grader runs are byte-identical.
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rnd = mulberry32(20261123);

type RGB = [number, number, number];

function clamp255(v: number): number {
  return v < 0 ? 0 : v > 255 ? 255 : v;
}

function mix(a: RGB, b: RGB, t: number): RGB {
  return [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t,
  ];
}

// Blend src over the pixel at (x, y) with opacity alpha (0..1).
function put(x: number, y: number, c: RGB, alpha = 1) {
  if (x < 0 || y < 0 || x >= W || y >= H) return;
  const i = (y * W + x) * 3;
  if (alpha >= 1) {
    fb[i] = clamp255(c[0]); fb[i + 1] = clamp255(c[1]); fb[i + 2] = clamp255(c[2]);
  } else {
    fb[i] = clamp255(fb[i] * (1 - alpha) + c[0] * alpha);
    fb[i + 1] = clamp255(fb[i + 1] * (1 - alpha) + c[1] * alpha);
    fb[i + 2] = clamp255(fb[i + 2] * (1 - alpha) + c[2] * alpha);
  }
}

// Filled ellipse with a vertical gradient from cTop to cBottom.
function ellipse(cx: number, cy: number, rx: number, ry: number, cTop: RGB, cBottom: RGB, alpha = 1) {
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
    if (y < 0 || y >= H) continue;
    const dy = (y - cy) / ry;
    const half = rx * Math.sqrt(Math.max(0, 1 - dy * dy));
    const t = (y - (cy - ry)) / (2 * ry);
    const c = mix(cTop, cBottom, t);
    for (let x = Math.floor(cx - half); x <= Math.ceil(cx + half); x++) {
      put(x, y, c, alpha);
    }
  }
}

// Soft radial blob: colour fades to transparent at radius r.
function blob(cx: number, cy: number, r: number, c: RGB, peak = 0.5) {
  for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) {
    if (y < 0 || y >= H) continue;
    for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
      if (x < 0 || x >= W) continue;
      const d = Math.hypot(x - cx, y - cy) / r;
      if (d >= 1) continue;
      const a = peak * (1 - d * d);
      put(x, y, c, a);
    }
  }
}

// Rounded-rectangle-ish capsule: a vertical drip of syrup.
function drip(cx: number, y0: number, len: number, w: number, c: RGB, hi: RGB) {
  for (let y = y0; y <= y0 + len; y++) {
    const taper = 1 - 0.25 * ((y - y0) / len);
    const hw = (w / 2) * taper;
    for (let x = Math.floor(cx - hw); x <= Math.ceil(cx + hw); x++) {
      const edge = Math.abs(x - cx) / hw;
      put(x, y, mix(c, hi, Math.max(0, 0.55 - edge * 0.55)), 0.96);
    }
    // round bulb at the tip
    if (y > y0 + len - w) {
      const dy = y - (y0 + len);
      const hh = Math.sqrt(Math.max(0, (w * 0.7) ** 2 - dy * dy));
      for (let x = Math.floor(cx - hh); x <= Math.ceil(cx + hh); x++) {
        put(x, y, c, 0.96);
      }
    }
  }
}

// ---- background: warm morning kitchen light -------------------------
for (let y = 0; y < H; y++) {
  const t = y / H;
  const c = mix([255, 238, 205], [246, 205, 150], t);
  for (let x = 0; x < W; x++) fb[(y * W + x) * 3] = c[0], fb[(y * W + x) * 3 + 1] = c[1], fb[(y * W + x) * 3 + 2] = c[2];
}
blob(300, 220, 560, [255, 252, 230], 0.55); // sun glow, top left
blob(760, 820, 520, [214, 138, 62], 0.18); // warm bounce, bottom right

// table surface
for (let y = 700; y < H; y++) {
  const t = (y - 700) / (H - 700);
  const c = mix([196, 128, 74], [150, 92, 50], t);
  for (let x = 0; x < W; x++) {
    put(x, y, c, 0.55);
  }
}
// wood-grain streaks on the table
for (let i = 0; i < 26; i++) {
  const y = 730 + rnd() * 280;
  const a = 0.05 + rnd() * 0.07;
  for (let x = 0; x < W; x += 2) {
    const wob = Math.sin(x * 0.008 + i * 2.1) * 6;
    put(x, Math.round(y + wob), [120, 70, 34], a);
  }
}

// ---- plate ------------------------------------------------------------
ellipse(512, 838, 430, 96, [70, 42, 22], [52, 30, 16], 0.35); // shadow
ellipse(512, 812, 420, 108, [252, 247, 238], [226, 216, 202]); // plate
ellipse(512, 812, 420, 108, [255, 255, 250], [240, 232, 220], 0.0); // keep
ellipse(512, 812, 330, 82, [238, 230, 216], [214, 204, 188]); // plate well
ellipse(512, 812, 330, 82, [255, 255, 255], [255, 255, 255], 0.0);

// ---- pancake stack ----------------------------------------------------
// Pancakes are squashed ellipses with a toasted golden gradient and
// speckled browning. Each one sits a little higher and a touch askew.
function pancake(cy: number, rx: number, ry: number, tilt: number) {
  const cx = 512 + tilt;
  ellipse(cx, cy, rx, ry, [232, 176, 96], [186, 122, 52]);
  // toasted top face
  ellipse(cx, cy - ry * 0.32, rx * 0.97, ry * 0.62, [244, 196, 116], [214, 152, 74]);
  // golden-brown speckles
  for (let i = 0; i < 340; i++) {
    const ang = rnd() * Math.PI * 2;
    const rr = Math.sqrt(rnd());
    const x = cx + Math.cos(ang) * rr * rx * 0.94;
    const y = cy - ry * 0.32 + Math.sin(ang) * rr * ry * 0.58;
    const s = rnd();
    const c: RGB = s < 0.5 ? [176, 108, 44] : s < 0.8 ? [222, 158, 76] : [150, 88, 34];
    put(Math.round(x), Math.round(y), c, 0.16 + rnd() * 0.22);
    put(Math.round(x) + 1, Math.round(y), c, 0.1);
  }
  // crisp browned rim on the lower edge
  for (let x = cx - rx; x <= cx + rx; x++) {
    const dx = (x - cx) / rx;
    const y = cy + ry * 0.55 * Math.sqrt(Math.max(0, 1 - dx * dx)) + ry * 0.28;
    put(Math.round(x), Math.round(y), [150, 88, 34], 0.35);
  }
}

pancake(742, 300, 62, -6); // bottom
pancake(668, 292, 60, 8); // middle
pancake(596, 280, 58, -4); // top

// ---- maple syrup: the one ingredient ----------------------------------
// A glossy amber pool flooding the top pancake, with thick drips
// running down the stack and a puddle spreading on the plate.
const SYRUP: RGB = [176, 84, 8];
const SYRUP_DARK: RGB = [128, 54, 4];
const SYRUP_HI: RGB = [255, 176, 66];

ellipse(508, 566, 262, 44, SYRUP_HI, SYRUP); // pool on top
ellipse(508, 560, 236, 34, [226, 128, 26], [190, 96, 10]); // molten centre
// bright gloss streaks on the pool
ellipse(452, 552, 96, 10, [255, 205, 110], [255, 176, 66], 0.85);
ellipse(560, 574, 70, 8, [255, 190, 90], [240, 150, 50], 0.6);

// drips down the front of the top pancake, ending at its bottom edge
drip(330, 588, 58, 24, SYRUP, SYRUP_HI);
drip(420, 594, 48, 18, SYRUP, SYRUP_HI);
drip(512, 598, 62, 28, SYRUP, SYRUP_HI);
drip(610, 592, 52, 20, SYRUP, SYRUP_HI);
drip(688, 586, 44, 16, SYRUP, SYRUP_HI);
// (no syrup bands between the pancakes: flat ellipses read as rods,
// the drips and the pool carry the syrup on their own)
// puddle on the plate
ellipse(700, 842, 130, 22, SYRUP, SYRUP_DARK, 0.95);
ellipse(688, 838, 84, 12, SYRUP_HI, SYRUP, 0.7);
ellipse(330, 848, 88, 16, SYRUP, SYRUP_DARK, 0.9);

// ---- butter, melting --------------------------------------------------
function butter() {
  const cx = 508, cy = 522;
  // melt pool under the pat
  ellipse(cx + 6, cy + 26, 84, 18, [255, 226, 130], [244, 196, 92]);
  // the pat: pale yellow slab with soft edges
  for (let y = cy - 20; y <= cy + 16; y++) {
    const t = (y - (cy - 20)) / 36;
    const c = mix([255, 242, 178], [242, 206, 106], t);
    const inset = y < cy - 10 ? 7 : y > cy + 8 ? 5 : 0;
    for (let x = cx - 62 + inset; x <= cx + 62 - inset; x++) {
      put(x, y, c, 0.98);
    }
  }
  // top face highlight + a soft sheen
  ellipse(cx, cy - 15, 56, 9, [255, 250, 210], [250, 228, 142], 0.9);
  put(cx - 30, cy - 10, [255, 255, 235], 0.9);
  put(cx - 29, cy - 10, [255, 255, 235], 0.9);
}
butter();

// ---- steam -------------------------------------------------------------
// Soft translucent wisps rising off the hot stack.
const steamCols: RGB[] = [[255, 255, 255], [255, 250, 240], [255, 255, 255]];
for (let i = 0; i < 3; i++) {
  const bx = 430 + i * 80;
  for (let s = 0; s < 5; s++) {
    const y = 500 - s * 62;
    const wob = Math.sin(s * 1.4 + i * 2.2) * 26;
    blob(bx + wob, y, 46 - s * 4, steamCols[i], 0.16 - s * 0.02);
  }
}

// ---- vignette: pull the eye to the stack ------------------------------
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const dx = (x - 512) / 512;
    const dy = (y - 560) / 560;
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d > 0.85) {
      const a = Math.min(0.22, (d - 0.85) * 0.9);
      put(x, y, [90, 50, 20], a);
    }
  }
}

// ---- PNG encoder --------------------------------------------------------
const CRC_TABLE = new Int32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  CRC_TABLE[n] = c;
}
function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type: string, data: Buffer): Buffer {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, "ascii");
  data.copy(out, 8);
  out.writeUInt32BE(crc32(Buffer.concat([Buffer.from(type, "ascii"), data])), 8 + data.length);
  return out;
}

const raw = Buffer.alloc(H * (1 + W * 3));
for (let y = 0; y < H; y++) {
  raw[y * (1 + W * 3)] = 0; // filter: none
  raw.set(fb.subarray(y * W * 3, (y + 1) * W * 3), y * (1 + W * 3) + 1);
}
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(W, 0);
ihdr.writeUInt32BE(H, 4);
ihdr[8] = 8; // bit depth
ihdr[9] = 2; // colour type RGB
ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;

const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk("IHDR", ihdr),
  chunk("IDAT", deflateSync(raw, { level: 9 })),
  chunk("IEND", Buffer.alloc(0)),
]);

mkdirSync("/output", { recursive: true });
writeFileSync("/output/entry.png", png);
console.log("wrote /output/entry.png", png.length, "bytes,", W, "x", H);
