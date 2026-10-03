// ===== Procedural pixel faces (12×12, mirrored). No image files. =====

import { CAST } from '../config/events.js';

const N = 12;

function rng(seed) { let s = seed * 9301 + 49297; return () => ((s = (s * 16807) % 2147483647) / 2147483647); }

// returns a 12×12 grid of palette indices: 0 bg, 1 skin, 2 hair, 3 eye, 4 mouth, 5 accent
function faceGrid(seed, complexity = 0) {
  const r = rng(seed);
  const g = Array.from({ length: N }, () => Array(N).fill(0));
  const hairTop = 1 + Math.floor(r() * 2), jaw = 9 + Math.floor(r() * 2), width = 3 + Math.floor(r() * 2);
  for (let y = 2; y <= jaw; y++) for (let x = 6 - width; x < 6; x++) g[y][x] = 1;
  for (let y = hairTop; y < 4; y++) for (let x = 6 - width - 1; x < 6; x++) g[y][x] = 2;
  if (r() < 0.6) for (let y = 4; y < 7; y++) g[y][6 - width - 1] = 2;              // sideburns
  g[5][3 + Math.floor(r() * 1.5)] = 3;                                               // eye
  for (let x = 4; x < 6; x++) g[8][x] = 4;                                           // mouth
  for (let i = 0; i < complexity; i++) g[2 + Math.floor(r() * 9)][Math.floor(r() * 6)] = 5;  // model noise
  for (let y = 0; y < N; y++) for (let x = 0; x < 6; x++) g[y][11 - x] = g[y][x];  // mirror
  return g;
}

function paletteFor(color, seed) {
  const r = rng(seed + 7);
  const skins = ['#f1c27d', '#c68642', '#8d5524', '#e0ac69', '#ffdbac'];
  const hairs = ['#222', '#5a3825', '#999', '#d4a017', '#7a1f1f'];
  return [null, skins[Math.floor(r() * skins.length)], hairs[Math.floor(r() * hairs.length)], '#000', '#5a1010', color];
}

// talking: mouth opens; gen: model portraits change with generation
export function drawPortrait(canvas, speaker, { talking = false, gen = 1, dim = false } = {}) {
  const ctx = canvas.getContext('2d');
  const c = CAST[speaker] || CAST.safety;
  const isModel = speaker === 'model';
  const seed = isModel ? c.seed + gen * 101 : c.seed;
  const grid = faceGrid(seed, isModel ? gen * 3 : 0);
  let pal = paletteFor(c.color, seed);
  if (isModel) {
    const hue = [140, 140, 40, 40, 185, 185, 50][gen - 1];
    const light = 45 + gen * 6;
    pal = [null, `hsl(${hue},40%,${light}%)`, `hsl(${hue},60%,${light - 25}%)`, gen >= 6 ? '#fff' : '#000', `hsl(${hue},50%,20%)`, `hsl(${hue},90%,75%)`];
  }
  const s = canvas.width / N;
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    let v = grid[y][x];
    if (talking && y === 9 && (x === 5 || x === 6) && grid[8][x] === 4) v = 4;
    if (!v) continue;
    ctx.fillStyle = pal[v];
    ctx.fillRect(x * s, y * s, s, s);
  }
  // scanline tint + dim when not speaking
  ctx.fillStyle = dim ? 'rgba(0,0,0,0.6)' : 'rgba(0,0,0,0.15)';
  for (let y = 0; y < canvas.height; y += 2) ctx.fillRect(0, y, canvas.width, 1);
  if (dim) { ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.fillRect(0, 0, canvas.width, canvas.height); }
}
