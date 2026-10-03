// usage: node shot.mjs variant-a.js [out-prefix]   -> out-prefix_t3.png, out-prefix_t8.png, prints console errors
import { chromium } from '/opt/node-tools/node_modules/playwright/index.mjs';
import fs from 'fs';
const [file, prefix = file.replace('.js', '')] = process.argv.slice(2);
const key = (fs.readFileSync(file, 'utf8').match(/VARIANTS\.(\w+)\s*=/) || [])[1];
const fontsMatch = fs.readFileSync(file, 'utf8').match(/fonts:\s*\[([^\]]*)\]/);
const fams = fontsMatch ? [...fontsMatch[1].matchAll(/'([^']+)'|"([^"]+)"/g)].map(m => m[1] || m[2]) : [];
const href = 'https://fonts.googleapis.com/css2?' + fams.map(f => 'family=' + f.replace(/ /g, '+')).join('&') + '&display=swap';
const html = `<!doctype html><meta charset=utf-8>${fams.length ? `<link rel=stylesheet href="${href}">` : ''}
<body style="margin:0;background:#000"><canvas id=c width=1200 height=660></canvas>
<script>${fs.readFileSync('shared.js', 'utf8')}</script><script>${fs.readFileSync(file, 'utf8')}</script>
<script>window.__go = async t => { await document.fonts.ready; const c = document.getElementById('c').getContext('2d'); c.setTransform(1,0,0,1,0,0); VARIANTS['${key}'].draw(c, t); }</script>`;
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1200, height: 660 } });
const errs = [];
p.on('pageerror', e => errs.push('pageerror: ' + e.message));
p.on('console', m => m.type() === 'error' && errs.push('console: ' + m.text()));
await p.route(/fonts\.(googleapis|gstatic)\.com/, async route => {
  try { const r = await fetch(route.request().url(), { headers: { 'user-agent': route.request().headers()['user-agent'] } });
    route.fulfill({ status: r.status, headers: { 'content-type': r.headers.get('content-type') || '', 'access-control-allow-origin': '*' }, body: Buffer.from(await r.arrayBuffer()) });
  } catch (e) { errs.push('font fetch failed: ' + e.message); route.abort(); }
});
await p.setContent(html, { waitUntil: 'networkidle' });
for (const t of [3, 8]) { await p.evaluate(t => window.__go(t), t); await p.waitForTimeout(100); await (await p.$('#c')).screenshot({ path: `${prefix}_t${t}.png` }); }
const loaded = await p.evaluate(() => [...document.fonts].filter(f => f.status === 'loaded').map(f => f.family));
console.log('variant:', key, '| fonts requested:', fams.join(', ') || 'none', '| fonts loaded:', [...new Set(loaded)].join(', ') || 'none');
console.log(errs.length ? 'ERRORS:\n' + errs.join('\n') : 'no errors');
await b.close();
