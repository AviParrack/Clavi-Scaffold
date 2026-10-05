// ===== publish list: the `files` map for the Artifact publish of the game =====
// usage:  node scripts/publish-files.mjs          prints the JSON map { "published/path": "source/path" }, sources relative to game/
//         node scripts/publish-files.mjs --abs    the same, with absolute source paths
// Publish with file_path = game/index.html, root = game/, files = this map. train.html rides along (game/train.html#g=5,go).
// Checks before it prints (exit 1 on any): every relative import and every local src/href in the pages resolves to a
// file in the list (a missing ES module is a blank page), at most 255 files, at most 16 MB in all.
// The report goes to stderr, so `node scripts/publish-files.mjs > files.json` stays clean JSON.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const GAME = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ABS = process.argv.includes('--abs');
const MAX_FILES = 255, MAX_BYTES = 16 * 1024 * 1024;

// ===== glob: src/**/*.js, style.css, train.html =====

const walk = dir => fs.readdirSync(dir, { withFileTypes: true }).flatMap(d => {
  const p = path.join(dir, d.name);
  return d.isDirectory() ? walk(p) : [p];
});
const rel = p => path.relative(GAME, p).split(path.sep).join('/');

const files = [
  ...walk(path.join(GAME, 'src')).filter(p => p.endsWith('.js')).map(rel).sort(),
  'style.css',
  'train.html',
];

// ===== checks =====

const problems = [];
const have = new Set([...files, 'index.html']);
const exists = f => fs.existsSync(path.join(GAME, f));
for (const f of files) if (!exists(f)) problems.push(`missing on disk: ${f}`);

// relative imports in every .js (static `from '...'` and dynamic `import('...')`)
const IMPORT = /(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+)['"](\.{1,2}\/[^'"]+)['"]/g;
let imports = 0;
for (const f of files.filter(f => f.endsWith('.js'))) {
  const src = fs.readFileSync(path.join(GAME, f), 'utf8');
  for (const m of src.matchAll(IMPORT)) {
    const target = path.posix.normalize(path.posix.join(path.posix.dirname(f), m[1]));
    imports++;
    if (!have.has(target)) problems.push(`${f} imports ${m[1]} → ${target}, not in the list`);
  }
}

// local src= / href= in the pages, and the module imports inside train.html's inline script
for (const page of ['index.html', 'train.html']) {
  const html = fs.readFileSync(path.join(GAME, page), 'utf8');
  const refs = [...html.matchAll(/\b(?:src|href)=["']([^"'#?]+)["']/g)].map(m => m[1])
    .concat([...html.matchAll(/\bfrom\s*['"](\.{1,2}\/[^'"]+)['"]/g)].map(m => m[1]))
    .filter(r => !/^(https?:)?\/\//.test(r));
  for (const r of refs) {
    const target = path.posix.normalize(r.replace(/^\.\//, ''));
    if (!have.has(target)) problems.push(`${page} loads ${r}, not in the list`);
  }
}

const bytes = [...have].filter(exists).reduce((n, f) => n + fs.statSync(path.join(GAME, f)).size, 0);
if (have.size > MAX_FILES) problems.push(`${have.size} files > ${MAX_FILES}`);
if (bytes > MAX_BYTES) problems.push(`${(bytes / 1e6).toFixed(1)} MB > 16 MB`);

// ===== report (stderr) and the map (stdout) =====

console.error(`[publish] ${files.length} files + index.html · ${(bytes / 1024).toFixed(0)} KB · ${imports} relative imports checked`);
if (problems.length) {
  for (const p of problems) console.error(`[publish] ❌ ${p}`);
  process.exit(1);
}
console.error(`[publish] ✅ every import resolves. Artifact: file_path game/index.html · root game/ · files = the map below`);

const map = Object.fromEntries(files.map(f => [f, ABS ? path.join(GAME, f) : f]));
console.log(JSON.stringify(map, null, 2));
