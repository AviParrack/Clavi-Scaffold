// Assemble the three variants into one gallery page: node build.mjs -> handoff-codec.html
import fs from 'fs';
const files = ['variant-c.js', 'variant-a.js', 'variant-b.js'];
const src = Object.fromEntries(files.map(f => [f, fs.readFileSync(f, 'utf8')]));
const key = f => src[f].match(/VARIANTS\.(\w+)\s*=/)[1];
const fams = new Set(['Silkscreen', 'VT323']);
for (const f of files) { const m = src[f].match(/fonts:\s*\[([^\]]*)\]/); if (m) for (const x of m[1].matchAll(/'([^']+)'|"([^"]+)"/g)) fams.add(x[1] || x[2]); }
const href = 'https://fonts.googleapis.com/css2?' + [...fams].map(f => 'family=' + f.replace(/ /g, '+')).join('&') + '&display=swap';
const meta = {
  c: ['Direction 1 · recommended', 'Soliton', 'The operator console. Tracks are tactical radar screens. Every defense is a labelled plate on the left rail that hangs its tag on the line it is reading, and an ops log prints what each one did. Green LCD instruments, a monochrome codec with the blue dialog box from the MSX2 game, and a little transceiver.'],
  a: ['Direction 2', "Codec '98", 'Pure PlayStation codec: one green phosphor on a black void, with red saved for alarms. PTT, MEMORY and a 141.80 frequency readout. It is the densest and most legible at high volume, and the cheapest to build.'],
  b: ['Direction 3', "Transceiver '90", 'The MSX2 Metal Gear 2 screen: painted at half resolution and blown up 2x, so every pixel is a block. Coloured portraits face each other across a walkie-talkie, and the big blue dialog box delivers the bad news. The most literal retro look, but the least room for information.'],
};
const sections = files.map(f => { const k = key(f), [tag, name, p] = meta[k];
  return `<section class="dir"><div class="meta"><span class="tag">${tag}</span><h2>${name}</h2></div><p>${p}</p><div class="frame"><canvas width="1200" height="660" data-v="${k}"></canvas></div></section>`; }).join('\n');
const html = `<title>HANDOFF Codec Looks</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="stylesheet" href="${href}">
<style>
:root { --void: #050a07; --ink: #c8f5d8; --muted: #6f9a80; --line: #17331f; --hot: #ff4a3d; --lcd: #8affc1; color-scheme: dark; }
html, body { background: var(--void); color: var(--ink); }
body { font-family: "VT323", ui-monospace, monospace; font-size: 20px; padding-inline: 16px; padding-block: 28px 64px; }
.wrap { max-width: 1200px; margin: 0 auto; display: grid; gap: 48px; }
header { display: grid; gap: 10px; }
.freq { font-family: "Silkscreen", "VT323", monospace; font-size: 12px; letter-spacing: 3px; color: var(--muted); }
h1 { font-family: "Silkscreen", "VT323", monospace; font-weight: 400; font-size: clamp(26px, 4.5vw, 44px); margin: 0; color: var(--lcd); letter-spacing: 2px; text-wrap: balance; }
header p { margin: 0; max-width: 70ch; line-height: 1.35; color: var(--ink); }
header p em { color: var(--hot); font-style: normal; }
.dir { display: grid; gap: 10px; }
.meta { display: flex; flex-wrap: wrap; gap: 6px 16px; align-items: baseline; }
.tag { font-family: "Silkscreen", monospace; font-size: 11px; letter-spacing: 2px; text-transform: uppercase; color: var(--muted); }
h2 { font-family: "Silkscreen", monospace; font-weight: 400; font-size: 22px; margin: 0; color: var(--lcd); }
.dir p { margin: 0; max-width: 78ch; line-height: 1.35; color: var(--ink); opacity: .85; }
.frame { border: 1px solid var(--line); background: #000; overflow: hidden; }
canvas { display: block; width: 100%; height: auto; max-width: 100%; image-rendering: pixelated; }
footer { color: var(--muted); font-size: 16px; }
</style>
<div class="wrap">
<header>
  <div class="freq">CALL 141.80 · PTT</div>
  <h1>HANDOFF: three codec looks</h1>
  <p>Old retro graphics with a cyber terminal feel, after the Metal Gear codec screens. Each one shows the same moment in G3: defenses on the left rail scan task lines as they scroll past, responder bays pull flagged lines out to a desk, a Demand Surge is ticking down, and an <em>EXTERNAL INCIDENT</em> just landed on the codec. All the art is original pixel work drawn in code.</p>
</header>
${sections}
<footer>All three are live canvas drawings (they animate). Pick one, or name the parts you want mixed.</footer>
</div>
<script>${fs.readFileSync('shared.js', 'utf8')}</script>
${files.map(f => `<script>${src[f]}</script>`).join('\n')}
<script>
const cvs = [...document.querySelectorAll('canvas[data-v]')];
const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
const vis = new Map(cvs.map(c => [c, true]));
const io = new IntersectionObserver(es => es.forEach(e => vis.set(e.target, e.isIntersecting)));
cvs.forEach(c => io.observe(c));
function paint(t) { for (const c of cvs) { if (!vis.get(c)) continue; const g = c.getContext('2d'); g.setTransform(1,0,0,1,0,0); try { VARIANTS[c.dataset.v].draw(g, t); } catch (e) { console.error(e); } } }
function loop(ms) { paint(ms / 1000); if (!still) requestAnimationFrame(loop); }
document.fonts.ready.then(() => { cvs.forEach(c => { const g = c.getContext('2d'); VARIANTS[c.dataset.v].draw(g, 3); }); requestAnimationFrame(loop); });
cvs.forEach(c => { try { VARIANTS[c.dataset.v].draw(c.getContext('2d'), 3); } catch (e) {} });
</script>`;
fs.writeFileSync('handoff-codec.html', html);
console.log('wrote handoff-codec.html', (html.length / 1024).toFixed(0), 'KB; fonts:', [...fams].join(', '));
