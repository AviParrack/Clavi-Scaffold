// ======================================================================
//  HARNESS  —  load the game's scripts into Node's global scope, in the
//  same order as index.html (minus render/main), like a browser would.
//    const H = require('./harness');  H.load();  ->  CONFIG, World, Terrain, Physics, Game, ... are globals
//    H.input({ keys: ['KeyW'], pressed: ['KeyF'] })  ->  an input object for Game.update
// ======================================================================

const fs = require('fs'), path = require('path'), vm = require('vm');
const GAME = path.join(__dirname, '..', 'game');
const SKIP = new Set(['js/render.js', 'js/main.js']);

function scripts() {
  const html = fs.readFileSync(path.join(GAME, 'index.html'), 'utf8');
  return [...html.matchAll(/<script src="([^"]+)"><\/script>/g)].map((m) => m[1]).filter((s) => !SKIP.has(s));
}

let loaded = false;
//  only: 'eva,economy' registers just those feature modules (others still load but stay inert)
function load({ strict = true, quiet = true, only = null } = {}) {
  if (!loaded) {
    if (only) global.ORBIT_ONLY = Array.isArray(only) ? only.join(',') : only;
    for (const s of scripts()) vm.runInThisContext(fs.readFileSync(path.join(GAME, s), 'utf8'), { filename: s });
    loaded = true;
  }
  Game.strict = strict; Game.quiet = quiet;
  return global;
}

function input({ keys = [], pressed = [], mouse = null, touch = {} } = {}) {
  return { keys: new Set(keys), pressed, mouse, touch };
}

// run n frames of frameDt with the same input (pressed keys only on the first frame)
function run(g, n, opts = {}, frameDt = 1 / 60) {
  for (let i = 0; i < n; i++) Game.update(g, input(i === 0 ? opts : { ...opts, pressed: [] }), frameDt);
}

module.exports = { load, input, run, scripts };
