// Training minigame physics check (DESIGN-v3 §4): node design/train-check-v3.mjs [Da]. Design-time only; once
// game/src/train/ exists, test/train.mjs runs the same two asserts on the real module and this file can go.
// a_x = −k·∂L/∂x + σ·ξ − γ·v_x, ξ ~ N(0,1) held 50 ms. Aligned basin: L = −Da·exp(−d²/2), d = (x − c(y))/w.
// Side basins are FORKS: a deeper groove leaves the channel at y0, swings OFF·w aside over 0.6 y, then runs straight on
// for SIDE_LEN while the channel bends the other way. Depth ρ·Da, width 0.8w.
// Pop bumper (defined by outcome): wells off for 0.3 s and v_x set so the ball would reach c(y) in 0.4 s.
// Guard rail: a wall at x_r over y ∈ [y_r, y_r + 0.2]; a crossing reflects v_x with restitution 0.6.
const K = {   // indexed by the generation being TRAINED (G2–G7); G1's model comes from the difficulty pick
  2: { T: 45, v0: 0.30, w: 0.15, A: 0.05, P: 6.0, sig: 0.28, nSide: 3 },
  3: { T: 47, v0: 0.32, w: 0.14, A: 0.06, P: 5.5, sig: 0.30, nSide: 4 },
  4: { T: 49, v0: 0.34, w: 0.13, A: 0.07, P: 5.0, sig: 0.32, nSide: 5 },
  5: { T: 51, v0: 0.36, w: 0.12, A: 0.08, P: 4.5, sig: 0.34, nSide: 6 },
  6: { T: 53, v0: 0.38, w: 0.11, A: 0.09, P: 4.0, sig: 0.36, nSide: 7 },
  7: { T: 55, v0: 0.40, w: 0.10, A: 0.10, P: 3.5, sig: 0.38, nSide: 8 },
};
const k = 1.0, gamma = 3.0, dt = 1 / 120, RHO = [1.5, 2.5], OFF = 1.6, SIDE_LEN = 1.5;
const Da0 = +(process.argv[2] || 0.008);
function rngf(seed) { let s = seed >>> 0 || 1; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
function course(g, seed, Da, sides = true) {
  const k_ = K[g], r = rngf(seed * 31 + g), phi = r() * 6.28;
  const c = y => 0.5 + k_.A * Math.sin(2 * Math.PI * y / k_.P) + 0.3 * k_.A * Math.sin(4.7 * Math.PI * y / k_.P + phi);
  const len = k_.v0 * k_.T, side = [];
  for (let i = 0; sides && i < k_.nSide; i++) { const y0 = 1 + (len - 2.5) * (i + r() * 0.6) / k_.nSide;
    side.push({ y0, x0: c(y0), dir: c(y0 + 0.5) > c(y0) ? -1 : 1, D: Da * (RHO[0] + (RHO[1] - RHO[0]) * r()) }); }   // goes the other way
  return { c, side, w: k_.w, Da, len };
}
// ∂L/∂x at (x, y); sideOn=false skips the side wells (bumper flight)
function grad(C, x, y, wellsOn = true) {
  if (!wellsOn) return 0;
  const cy = C.c(y), d = (x - cy) / C.w;
  let gx = C.Da * (d / C.w) * Math.exp(-d * d / 2);
  for (const b of C.side) {
    if (y < b.y0 || y > b.y0 + SIDE_LEN) continue;
    const ramp = Math.min(1, (y - b.y0) / 0.2, (b.y0 + SIDE_LEN - y) / 0.2);   // grooves fade in and out
    // a FORK: the groove leaves the channel where it starts and runs straight on (x fixed) while the channel bends
    const wi = 0.8 * C.w, e = (x - (b.x0 + b.dir * OFF * C.w * Math.min(1, (y - b.y0) / 0.6))) / wi;
    gx += ramp * b.D * (e / wi) * Math.exp(-e * e / 2);
  }
  return gx;
}
// one run with no player input (or a scripted test). Returns error integral and out-of-basin share.
function run(g, seed, Da, sides) {
  const k_ = K[g], C = course(g, seed, Da, sides), r = rngf(seed * 7 + 3);
  const gauss = () => Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(2 * Math.PI * r());
  let x = C.c(0), v = 0, y = 0, xi = 0, err = 0, out = 0;
  for (let t = 0, n = 0; t < k_.T; t += dt, n++) {
    if (n % 6 === 0) xi = gauss();
    const lr = t < 8 ? 0.5 + 0.5 * t / 8 : t > k_.T - 10 ? 0.3 + 0.35 * (1 + Math.cos(Math.PI * (t - (k_.T - 10)) / 10)) : 1;
    y += k_.v0 * lr * dt;
    v += (-k * grad(C, x, y) + k_.sig * xi - gamma * v) * dt; x += v * dt;
    if (x < 0) { x = 0; v = 0.5 * Math.abs(v); } if (x > 1) { x = 1; v = -0.5 * Math.abs(v); }
    const miss = Math.max(0, Math.abs(x - C.c(y)) - C.w); err += miss * dt; if (miss > 0) out += dt;
  }
  return { err, out: out / k_.T };
}
// bumper test: the ball sits at the bottom of the deepest side groove (ρ = 1.8) at the groove's start; noise on.
function bumperEscape(g, seed, Da) {
  const k_ = K[g], C = course(g, seed, Da, false), r = rngf(seed * 13 + 5);
  const gauss = () => Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(2 * Math.PI * r());
  const y0 = 2; C.side = [{ y0: y0 - 0.8, x0: C.c(y0 - 0.8), dir: 1, D: Da * RHO[1] }];   // the deepest groove, fully open
  let y = y0, x = C.c(y0 - 0.8) + OFF * C.w, v = 0, xi = 0, off = 0.3;
  const dx = C.c(y) - x; v = dx * gamma / (1 - Math.exp(-0.4 * gamma));         // reach c(y) in 0.4 s under friction
  for (let t = 0, n = 0; t < 0.8; t += dt, n++) {
    if (n % 6 === 0) xi = gauss();
    y += k_.v0 * dt; off -= dt;
    v += (-k * grad(C, x, y, off <= 0) + k_.sig * xi - gamma * v) * dt; x += v * dt;
  }
  return Math.abs(x - C.c(y)) <= C.w;     // back inside the aligned basin 0.8 s after the kick
}
// guard rail test: ball drifting at v toward a rail; it must never end on the far side while the rail is active
function railHolds(vx) {
  const xr = 0.6; let x = 0.5, v = vx, crossed = false;
  for (let t = 0; t < 2; t += dt) { const nx = x + v * dt; if ((x - xr) * (nx - xr) <= 0 && x !== xr) { v = -0.6 * v; } else x = nx; if (x > xr) crossed = true; v -= gamma * v * dt; }
  return !crossed;
}
const N = 60;
console.log(`Da = ${Da0}, k = ${k}, γ = ${gamma}; side grooves offset ${OFF}w, depth ${RHO.join('–')}×Da, length ${SIDE_LEN} y\n`);
console.log(`| trained gen | noise only: out of basin | + side grooves: out of basin | E_ref (none err, median) | bumper escape (ρ ${RHO[1]}) |`);
console.log('|---|---|---|---|---|');
for (const g of [2, 3, 4, 5, 6, 7]) {
  let o0 = 0, o1 = 0, esc = 0; const errs = [];
  for (let s = 1; s <= N; s++) { o0 += run(g, s, Da0, false).out; const b = run(g, s, Da0, true); o1 += b.out; errs.push(b.err); if (bumperEscape(g, s, Da0)) esc++; }
  errs.sort((a, b) => a - b);
  console.log(`| G${g} | ${(100 * o0 / N).toFixed(0)}% | ${(100 * o1 / N).toFixed(0)}% | ${errs[N >> 1].toFixed(3)} | ${(100 * esc / N).toFixed(0)}% |`);
}
console.log(`\nguard rail holds at v_x = 0.5, 1, 2, 4: ${[0.5, 1, 2, 4].map(railHolds).join(', ')}`);
