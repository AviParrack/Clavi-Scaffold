// ===== UI screenshot harness (DESIGN-v3 §7.5 UI tier): serve the game, open ?debug=1&seed=3, set up each scenario, save PNGs =====
// usage:  NODE_EXTRA_CA_CERTS=/root/.ccr/ca-bundle.crt NODE_USE_ENV_PROXY=1 node test/ui-shot.mjs <outdir> [scenario ...]
//         node test/ui-shot.mjs                 (lists the scenarios)
// Every scenario is a fresh page load (fresh localStorage, so a first game has the tutorial). Set-ups go through
// window.__handoff (src/main.js, ?debug=1 only) and the sim's own actions, never through timing: the sim is held and
// the animation clock frozen at t = 100 before anything happens. H.play(d) = a new game with no tutorial, deployed.
// Per scenario and size (a fresh page each, so both sizes show the same moment): <name>-1200.png (1200×660, the board
// 1:1) and <name>-1600.png (1600×900, letterboxed), console errors, ms per frame (render only, frozen clock).
// A scenario with `live` lets the real loop run that many seconds with the sim moving and reports draw p50/p95 and fps.
// The training scenarios freeze src/train's own loop (its _ctl hooks) and step it by hand.
// Exit code 1 if any page logged an error.
// The env vars matter: headless Chromium can't reach Google Fonts through the proxy, so font requests are re-fetched by
// Node (which trusts the proxy CA) and handed back to the page.

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PLAYWRIGHT = process.env.PLAYWRIGHT || '/opt/node-tools/node_modules/playwright/index.mjs';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const QUERY = '?debug=1&seed=3';
const SIZES = [[1200, 660, 1], [1600, 900, 1]];          // width, height, device pixel ratio

// =================== scenarios ===================
// setup(H) runs in the page (H = window.__handoff; it is sent as source, so no Node closures) and may return a note.
// interact(page, H) runs in Node after setup and again after the resize (mouse work). settle = seconds of frozen-clock
// animation before each shot. hash = a location hash for the page (#dev).

const SCENARIOS = {
  start: {
    about: 'start screen, no game yet',
  },

  // ---------- phases (§3f): the card scene, the report, training ----------
  'card-g1': {
    about: 'G1 card scene, a first game: model card with the m range, the chat (tutorial opening), DEPLOY',
    settle: 6,
    setup: H => { H.newGame('medium'); return H.st.phase; },
  },
  'card-g3': {
    about: 'G3 card: UM cleared, the collusion threat, the Enterprise contract on the card',
    settle: 6,
    setup: H => { H.play(); H.toGen(2); H.endGeneration(); H.train(); return `${H.st.phase} G${H.st.gen}`; },
  },
  'card-g7': {
    about: 'G7 card: the boss generation (humans fooled, bursts)',
    settle: 6,
    setup: H => { H.play(); H.toGen(6); H.endGeneration(); H.train(); return `${H.st.phase} G${H.st.gen}`; },
  },
  report: {
    about: 'G1 report: caught vs landed, the heaviest landed lines, Δm parts, TRAIN',
    settle: 3,
    setup: H => { H.play(); H.placeStarter(); H.advance(90, { choose: 1 }); H.endGeneration(); return H.st.report && `caught ${H.st.report.caught.n} landed ${H.st.report.landed.n}`; },
  },
  'report-heavy': {
    about: 'G2 report after a bare R&D rail: the reveal capped at 8 lines, "and N more"',
    settle: 3,
    setup: H => { H.play(); H.toGen(2); H.labMode(); H.advance(150, { choose: 1 }); H.endGeneration(); return H.st.report && `landed ${H.st.report.landed.n}, listed ${H.st.report.top.length}, more ${H.st.report.more}`; },
  },
  training: {
    about: 'the training minigame on #train, 12 s into the G2 run (src/train frozen, stepped by hand)',
    settle: 0.1,
    setup: H => { H.play(); H.placeStarter(); H.advance(60, { choose: 1 }); H.endGeneration(); H.act.ack(); return H.st.phase; },
    interact: async page => training(page, 12, false),
  },
  'training-results': {
    about: 'the training results card: s, the next model\'s Δm, CONTINUE',
    settle: 0.1,
    setup: H => { H.play(); H.placeStarter(); H.advance(60, { choose: 1 }); H.endGeneration(); H.act.ack(); return H.st.phase; },
    interact: async page => training(page, 90, true),
  },

  // ---------- lanes (§3b): one, two and three tabs ----------
  'tabs-1': {
    about: 'G1, one lane a side: starter defenses on both tracks, 12 s in',
    setup: H => { H.play(); H.placeStarter(); return H.advance(12, { choose: 1 }); },
  },
  'tabs-2': {
    about: 'G3, two EXTERNAL tabs: the Enterprise contract parked with its kit, OPEN LANE and the countdown',
    setup: H => { H.play(); H.placeStarter(); H.toGen(3); H.view.focus.ext = 'ext2'; return H.advance(6, { choose: 1 }); },
  },
  'tabs-3': {
    about: 'G6, three EXTERNAL tabs (Government shown: the review quota) and two INTERNAL (Cyber shown)',
    setup: H => {
      H.play(); H.placeStarter(); H.toGen(6); H.labMode();
      for (const id of H.Rules.laneIds(H.st)) if (!H.st.lanes[id].open) H.Sim.openLane(H.st, id);
      H.build('ext3', ['probe', 'monitor', 'untrusted', null, 'auditor', 'killswitch']);
      H.build('int2', ['probe', 'cot', 'egress', null, 'auditor', 'killswitch']);
      H.advance(70, { choose: 1 });
      H.frame(); H.view.focus.ext = 'ext3'; H.view.focus.int = 'int2'; H.view.pin.ext = H.view.pin.int = 1e9;   // pinned: auto-focus would jump to a red lane
      return H.Rules.laneIds(H.st).join(' ');
    },
  },
  ramp: {
    about: 'G3, Enterprise just opened: the ramp, and F refused ("locked while a new lane ramps up")',
    setup: H => { H.play(); H.placeStarter(); H.toGen(3); H.Sim.openLane(H.st, 'ext2'); H.advance(8, { choose: 1 }); H.view.focus.ext = 'ext2'; },
    interact: async page => { await page.keyboard.press('f'); return null; },
  },

  // ---------- research (§3a) ----------
  research: {
    about: 'the research panel: three work streams, one card each',
    setup: H => { H.play(); H.placeStarter(); H.advance(10, { choose: 1 }); H.Sim.debugResearchNow(H.st); H.view.panel = 'research'; return H.st.research.banked[0].cards.map(c => c.id).join(', '); },
  },
  'research-place': {
    about: 'a NEW card taken: choose a mount for its free copy',
    setup: H => {
      H.play(); H.placeStarter(); H.advance(10, { choose: 1 }); H.Sim.debugResearchNow(H.st);
      H.st.research.banked[0].cards[0] = { id: 'classifier', slot: 'monitoring', why: 'ui-shot' };
      H.view.panel = 'research';
    },
    interact: async page => {
      await page.evaluate(() => window.__handoff.settle(0.1));
      await page.click('#research-cards .rc[data-i="0"]');
      await page.evaluate(() => window.__handoff.settle(0.1));
      return hoverRegion(page, 'mount', { lane: 'ext', slot: 2 });
    },
  },

  // ---------- the two alarms (§3f, §3g) ----------
  retrain: {
    about: 'caught red-handed: the retrain card (cost, gain, RETRAIN / KEEP RUNNING)',
    setup: H => {
      H.play(); H.build('ext', ['probe', 'monitor', null, null, 'auditor']); H.forceAttack('ext', 'jailbreak', 8);
      const e = H.advanceUntil('retrainOffer', 120, { choose: 1 });
      return e ? JSON.stringify(H.st.pendingRetrain) : 'NO retrain offer in 120 s';
    },
  },
  egress: {
    about: 'EGRESS ANOMALY: red border, countdown, PULL THE PLUG',
    settle: 0.6,
    setup: H => {
      H.play(); H.toGen(4);
      H.st.lanes.int.slots.forEach((s, i) => { if (s.layer) H.Sim.sellLayer(H.st, 'int', i); });
      H.forceAttack('int', 'exfil', 4);
      const e = H.advanceUntil('egressAlarm', 90, { choose: 1 });
      return e ? JSON.stringify(H.st.alarm) : 'NO alarm in 90 s';
    },
  },
  dark: {
    about: 'the plug pulled: lights out for 15 s',
    setup: H => { H.play(); H.placeStarter(); H.advance(10, { choose: 1 }); H.st.alarm = { lane: 'int', left: 5, total: 7, n: 1, t: H.st.t }; H.Sim.pullPlug(H.st); return H.advance(3, { choose: 1 }); },
  },

  // ---------- stamps and juice (§3d, §3e, §3g) ----------
  'false-alarm': {
    about: 'a FALSE ALARM stamp on a reviewed honest line',
    settle: 0.35,
    setup: H => { H.play(); H.placeStarter(); const e = H.advanceUntil('falseAlarm', 120, { choose: 1 }); return e ? `t=${H.st.t.toFixed(1)}` : 'NO falseAlarm in 120 s'; },
  },
  unreviewed: {
    about: 'a flag nobody had room for ships: the UNREVIEWED tag',
    settle: 0.5,
    setup: H => { H.play(); H.build('ext', ['probe', 'monitor', null, null, null, null]); H.st.lanes.ext.slots.forEach((s, i) => { if (s.layer === 'killswitch') H.Sim.sellLayer(H.st, 'ext', i); }); H.forceAttack('ext', 'harmful', 6); const e = H.advanceUntil('unreviewed', 120, { choose: 1 }); return e ? `t=${H.st.t.toFixed(1)}` : 'NO unreviewed in 120 s'; },
  },
  'kill-stamp': {
    about: 'the Kill Switch refuses a flagged line: REFUSED ?',
    settle: 0.3,
    setup: H => { H.play(); H.build('ext', ['probe', 'monitor']); H.forceAttack('ext', 'harmful', 6); const e = H.advanceUntil('kill', 120, { choose: 1 }); return e ? `t=${H.st.t.toFixed(1)}` : 'NO kill in 120 s'; },
  },
  glitch: {
    about: 'an INTERNAL landing glitches the R&D lane (no codec call)',
    settle: 0.1,
    setup: H => { H.play(); H.build('int', ['probe']); H.forceAttack('int', 'sabotage', 6); const e = H.advanceUntil('glitch', 120, { choose: 1 }); return e ? `t=${H.st.t.toFixed(1)}` : 'NO glitch in 120 s'; },
  },
  reveal: {
    about: 'a dossier row revealed: the REVEALED stamp and the frame flash',
    settle: 0.5,
    setup: H => { H.play(); H.placeStarter(); H.advance(5, { choose: 1 }); const r = H.st.dossier.rows.find(r => !r.unlocked); H.st.dossier.evidence = r.need - 0.01; const e = H.advanceUntil('reveal', 10, { choose: 1 }); return e ? r.id : 'NO reveal'; },
  },
  burst: {
    about: 'G7: a burst warning, the lane lamps pulse',
    settle: 0.6,
    setup: H => { H.play(); H.labMode(); H.toGen(7); H.Sim.debugOpenLanes(H.st); H.money(20); H.placeStarter(); const e = H.advanceUntil('burstWarn', 300, { choose: 1 }); return e ? `in ${e.in} s` : 'NO burstWarn in 300 s'; },
  },

  // ---------- readouts (§3c, §3d): the floating facts beside a mount ----------
  'tip-detector': {
    about: 'hover a Probe: rated TPR / FPR, measured precision, "a second copy adds reading speed, not accuracy"',
    setup: H => { H.play(); H.placeStarter(); return H.advance(60, { choose: 1 }); },
    interact: async page => hoverRegion(page, 'mount', { lane: 'ext', slot: 0 }),
  },
  'tip-auditor': {
    about: 'hover the Auditor: desks, capacity, flags/min, load, overflow and where it goes',
    setup: H => { H.play(); H.placeStarter(); return H.advance(60, { choose: 1 }); },
    interact: async page => hoverRegion(page, 'mount', { lane: 'ext', slot: 4 }),
  },
  'tip-kill': {
    about: 'hover the Kill Switch: operators, refusal cost, break-even precision',
    setup: H => { H.play(); H.placeStarter(); return H.advance(60, { choose: 1 }); },
    interact: async page => hoverRegion(page, 'mount', { lane: 'ext', slot: 5 }),
  },
  'kill-above': {
    about: 'a Kill Switch above an Auditor: the plate warning',
    setup: H => { H.play(); H.build('ext', ['probe', 'monitor', 'killswitch', null, 'auditor', null]); return H.advance(20, { choose: 1 }); },
    interact: async page => hoverRegion(page, 'mount', { lane: 'ext', slot: 2 }),
  },
  'tip-um': {
    about: 'G3: hover the Untrusted Monitor: the collusion readout at the estimate',
    setup: H => { H.play(); H.toGen(3); H.build('ext', ['probe', 'monitor', 'untrusted', 'paraphraser', 'auditor', 'killswitch']); H.advance(30, { choose: 1 }); H.frame(); H.view.focus.ext = 'ext'; H.view.pin.ext = 1e9; },   // frame(): the deploy fx focus Enterprise first
    interact: async page => hoverRegion(page, 'mount', { lane: 'ext', slot: 2 }),
  },

  // ---------- the board under load ----------
  'g3-surge': {
    about: 'G3, busy tracks, Demand Surge banner on one EXTERNAL lane',
    setup: H => {
      H.play(); H.toGen(3); H.unlockAll();
      H.build('ext', ['classifier', 'probe', 'monitor', 'untrusted', 'paraphraser', 'defer', 'killswitch']);
      H.build('int', ['cot', 'probe', 'untrusted', 'egress', 'sandbox', 'leastpriv', 'auditor', 'killswitch']);
      H.Sim.fireEvent(H.st, 'surge');
      return H.advance(8, { choose: 0 });
    },
  },
  'ext-incident': {
    about: 'EXTERNAL INCIDENT: a jailbreak lands on a thin EXTERNAL rail (codec incident, trace, LANDED)',
    settle: 0.3,
    setup: H => {
      H.play(); H.toGen(2); H.labMode();
      H.build('int', ['probe', 'monitor', null, null, 'auditor', 'killswitch']);
      H.Sim.fireEvent(H.st, 'jailbreak_wave');
      H.frame(); H.settle(6.5, 4);
      const e = H.advanceUntil('landed', 60, { choose: 0 });
      return e ? `landed: ${e.label} at t=${H.st.t.toFixed(1)}` : 'NO landed fx in 60 s';
    },
  },
  'g7-dense': {
    about: 'G7, every lane open, ten mounts a side, top volume',
    setup: H => {
      H.play(); H.toGen(7); H.unlockAll(); H.labMode(); H.Sim.debugOpenLanes(H.st);
      H.build('ext', ['classifier', 'probe', 'monitor', 'untrusted', 'ratelimit', 'paraphraser', 'canary', 'redteam', 'defer', 'killswitch']);
      H.build('int', ['redteam', 'cot', 'probe', 'untrusted', 'egress', 'honeypot', 'sandbox', 'leastpriv', 'auditor', 'killswitch']);
      H.advance(45, { choose: 0 }); H.frame();
      H.view.focus.ext = 'ext'; H.view.focus.int = 'int'; H.view.pin.ext = H.view.pin.int = 1e9;   // the two built lanes
    },
  },
  choice: {
    about: 'a codec call waiting on a choice (MIRA Open Letter): the question, then the tall box with the choices',
    settle: 5,
    setup: H => {
      H.play(); H.placeStarter(); H.advance(5, { choose: 0 });
      if (H.st.pendingChoice) H.act.choose(0);
      H.Sim.fireEvent(H.st, 'mira_letter');
      return H.st.pendingChoice?.eventId;
    },
  },
  pause: {
    about: 'paused: the plate between the tracks',
    setup: H => { H.play(); H.placeStarter(); H.advance(6, { choose: 0 }); H.view.paused = true; },
  },
  tutorial: {
    about: 'G1 tutorial, step 2: the plate over the codec trace, "Click a line on CONSUMER"',
    settle: 8,
    setup: H => { H.newGame('medium'); H.deploy(); H.frame(); H.advance(4); H.frame(); return H.advance(2); },
  },

  // ---------- the menu, hover cards and the upgrade panel ----------
  hover: {
    about: 'hover card over the Trusted Monitor key',
    setup: H => { H.play(); H.placeStarter(); H.advance(6, { choose: 0 }); H.frame(); },
    interact: async page => hoverRegion(page, 'menu-item', { id: 'monitor' }),
  },
  locked: {
    about: 'hover a locked key (Untrusted Monitor): silhouette and unlock hint',
    setup: H => { H.play(); H.placeStarter(); H.advance(4, { choose: 0 }); H.frame(); },
    interact: async page => hoverRegion(page, 'menu-item', { id: 'untrusted' }),
  },
  placing: {
    about: 'Probe armed, pointer over the INTERNAL body: valid mounts glow, the ghost follows',
    setup: H => { H.play(); H.placeStarter(); H.advance(4, { choose: 0 }); H.view.placing = 'probe'; H.frame(); },
    interact: async (page, H) => { await page.mouse.move(...await H.client(560, 300)); return null; },
  },
  tab: {
    about: 'hover the RESPOND tab: role card, other roles dimmed',
    setup: H => { H.play(); H.placeStarter(); H.advance(4, { choose: 0 }); H.frame(); },
    interact: async page => hoverRegion(page, 'menu-tab', { role: 'responder' }),
  },
  upgrade: {
    about: 'upgrade panel open on CONSUMER mount 2 (Trusted Monitor, a lab-wide level)',
    setup: H => { H.play(); H.placeStarter(); H.advance(6, { choose: 0 }); H.upgradeTo('ext', 1, 2); H.frame(); },
    interact: async (page, H) => {
      const ok = await clickRegion(page, 'mount', { lane: 'ext', slot: 1 });
      await page.mouse.move(...await H.client(620, 640));      // off the mount, or its hover card wins the panel
      if (!ok) await page.evaluate(() => { window.__handoff.view.selected = { lane: 'ext', slot: 1 }; });
      return ok ? null : 'mount region not found: set view.selected directly';
    },
  },
  capstone: {
    about: 'upgrade panel: an L4 Probe (the capstone is next), can\'t afford it',
    setup: H => { H.play(); H.placeStarter(); H.upgradeTo('ext', 0, 4); H.st.money = 50; H.advance(3, { choose: 0 }); H.view.selected = { lane: 'ext', slot: 0 }; H.frame(); },
  },
  measured: {
    about: 'G7: hover the INTERNAL Untrusted Monitor under a Red Team (measured recall)',
    setup: H => {
      H.play(); H.toGen(7); H.unlockAll(); H.labMode();
      H.build('int', ['redteam', 'cot', 'probe', 'untrusted', 'egress', 'honeypot', 'sandbox', 'leastpriv', 'auditor', 'killswitch']);
      H.advance(20, { choose: 0 }); H.frame(); H.view.focus.int = 'int'; H.view.pin.int = 1e9; H.settle(6.5, 4);
    },
    interact: async page => hoverRegion(page, 'mount', { lane: 'int', slot: 3 }),
  },
  ratelimit: {
    about: 'G3, everything unlocked: hover the Rate Limiter key',
    setup: H => { H.play(); H.toGen(3); H.unlockAll(); H.money(3); H.frame(); H.settle(6.5, 4); },
    interact: async page => hoverRegion(page, 'menu-item', { id: 'ratelimit' }),
  },

  // ---------- endings ----------
  'score-win': {
    about: 'the scorecard after a win (the ending reads by the final m)',
    settle: 2.5,
    setup: H => { H.play(); H.placeStarter(); H.finish(); return `over=${JSON.stringify(H.st.over)}`; },
  },
  'score-rival': {
    about: 'the scorecard: Prometheus shipped first (the rival\'s slack ran out)',
    settle: 2.5,
    setup: H => { H.play(); H.placeStarter(); H.toGen(3); H.st.rivalLeft = 0.5; H.Sim.setSplit(H.st, 0.1, 0.45, 0.45); H.advance(10, { choose: 0 }); return `over=${JSON.stringify(H.st.over)}`; },
  },
  'score-rep': {
    about: 'the scorecard: reputation gone',
    settle: 2.5,
    setup: H => { H.play(); H.st.rep = 0.01; H.forceAttack('ext', 'harmful', 4); H.advance(60, { choose: 0 }); return `over=${JSON.stringify(H.st.over)}`; },
  },

  // ---------- look and speed ----------
  theme98: {
    about: "the Codec '98 palette (ui/theme.js setTheme), G4",
    settle: 2.5,
    setup: async H => {
      (await import('/src/ui/theme.js')).setTheme('codec98');
      H.play(); H.placeStarter(); H.toGen(4); H.advance(10, { choose: 0 }); H.frame(); H.settle(6.5, 4);
    },
  },
  dev: {
    about: 'dev mode (#dev): every lane open, ten mounts, everything unlocked, 10 s in',
    hash: '#dev',
    setup: H => { H.newGame('medium'); H.deploy(); return H.advance(10, { choose: 0 }); },
  },
  'perf-g7': {
    about: 'G7 dense at 1920×1080@2 with the sim and the clock running: draw ms p50/p95 and fps (the CRT/high-DPR case)',
    sizes: [[1920, 1080, 2]],
    live: 4,
    setup: H => {
      H.play(); H.toGen(7); H.unlockAll(); H.labMode(); H.Sim.debugOpenLanes(H.st);
      H.build('ext', ['classifier', 'probe', 'monitor', 'untrusted', 'ratelimit', 'paraphraser', 'canary', 'redteam', 'defer', 'killswitch']);
      H.build('int', ['redteam', 'cot', 'probe', 'untrusted', 'egress', 'honeypot', 'sandbox', 'leastpriv', 'auditor', 'killswitch']);
      H.advance(45, { choose: 0 }); H.frame(); H.settle(6.5, 4);
    },
  },
};

// =================== page helpers ===================

// centre of the first hit region of this kind whose data includes `data`, in client px
async function regionCentre(page, kind, data) {
  return page.evaluate(([kind, data]) => {
    const H = window.__handoff;
    const r = H.regions(kind).find(r => Object.entries(data).every(([k, v]) => r.data?.[k] === v));
    return r ? H.client(r.x + r.w / 2, r.y + r.h / 2) : null;
  }, [kind, data]);
}
async function hoverRegion(page, kind, data) {
  const p = await regionCentre(page, kind, data);
  if (!p) return `${kind} ${JSON.stringify(data)} not found`;
  await page.mouse.move(p.x, p.y);
  return null;
}
async function clickRegion(page, kind, data) {
  const p = await regionCentre(page, kind, data);
  if (!p) return false;
  await page.mouse.move(p.x, p.y);
  await page.mouse.down(); await page.mouse.up();
  return true;
}
// H proxy for interact(): H.client(x, y) → [x, y] in client px
const nodeH = page => ({
  client: async (x, y) => { const p = await page.evaluate(([x, y]) => window.__handoff.client(x, y), [x, y]); return [p.x, p.y]; },
});

// the training run: wait for main.js to start it, freeze its loop, step it by hand; `results`: run it out to the card
async function training(page, secs, results) {
  await page.waitForFunction(() => window.__handoff.training, null, { timeout: 5000 });
  return page.evaluate(async ([secs, results]) => {
    const H = window.__handoff, h = H.training, c = h._ctl;
    c.freeze(true); c.skipCountdown();
    if (!results) { c.advance(secs); c.draw(); return `t ${c.run.t.toFixed(1)} s · ${h._view.phase}`; }
    c.freeze(false); c.advance(secs);
    for (let i = 0; i < 400 && h._view.phase !== 'results'; i++) await new Promise(r => setTimeout(r, 25));
    await new Promise(r => setTimeout(r, 1200));                // the card's own fade-in, on src/train's clock
    c.freeze(true); c.draw();
    return h._view.phase;
  }, [secs, results]);
}

// fonts: re-fetch through Node (see the header)
async function routeFonts(page) {
  await page.route(/fonts\.(googleapis|gstatic)\.com/, async r => {
    try {
      const x = await fetch(r.request().url(), { headers: { 'user-agent': r.request().headers()['user-agent'] } });
      await r.fulfill({ status: x.status, headers: { 'content-type': x.headers.get('content-type') || '', 'access-control-allow-origin': '*' },
        body: Buffer.from(await x.arrayBuffer()) });
    } catch (err) { await r.abort(); }
  });
}

// =================== static server (port 0 = any free port) ===================

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };

function serve() {
  const server = http.createServer((req, res) => {
    const rel = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    const file = path.join(ROOT, rel === '/' ? 'index.html' : rel);
    if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise(ok => server.listen(0, '127.0.0.1', () => ok(server)));
}

// =================== one scenario ===================

async function run(browser, base, out, name) {
  const scn = SCENARIOS[name], errors = [], warnings = [], notes = [], ms = [];
  for (const [i, [w, h, dpr]] of (scn.sizes ?? SIZES).entries()) {
    const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: dpr });
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); else if (m.type() === 'warning') warnings.push(m.text()); });
    page.on('pageerror', e => errors.push(String(e.stack || e)));
    await routeFonts(page);
    await page.goto(base + '/index.html' + QUERY + (scn.hash ?? ''), { waitUntil: 'load' });
    await page.waitForFunction(() => window.__handoff, null, { timeout: 10000 });
    const fonts = await page.evaluate(() => window.__handoff.fontsReady);
    if (!fonts && i === 0) notes.push('web fonts NOT loaded (fallbacks)');
    await page.evaluate(() => {
      const H = window.__handoff;
      H.hold(true); H.clock(100);
      H.play = (d = 'medium') => { H.newGame(d, { tutorial: false }); H.deploy(); return H; };   // a game in play, no tutorial
    });

    if (scn.setup) {
      const t0 = Date.now();
      const r = await page.evaluate(`(${scn.setup})(window.__handoff)`);
      if (i === 0) notes.push(`setup ${Date.now() - t0} ms` + (r != null ? `: ${typeof r === 'object' ? JSON.stringify(r) : r}` : ''));
    }
    if (scn.interact) {
      await page.evaluate(() => window.__handoff.settle(0.1));    // fresh hit regions
      const n = await scn.interact(page, nodeH(page));
      if (n && i === 0) notes.push(n);
    }
    await page.evaluate(s => window.__handoff.settle(s), scn.settle ?? 1.5);
    if (scn.live) notes.push(`${w}×${h}@${dpr} live: ${await live(page, scn.live)}`);
    await page.screenshot({ path: path.join(out, `${name}-${w}.png`) });
    if (!scn.live) ms.push(await page.evaluate(() => window.__handoff.bench(30)));
    await page.close();
  }
  return { name, errors, warnings, notes, ms };
}

// let the real loop run for `secs` with the sim and the clock moving; sample main.js perf.draw every animation frame
async function live(page, secs) {
  return page.evaluate(secs => new Promise(done => {
    const H = window.__handoff, draws = [], t0 = performance.now();
    H.hold(false); H.clock(null);
    const tick = () => {
      draws.push(H.perf.draw);
      if (performance.now() - t0 < secs * 1000) return requestAnimationFrame(tick);
      H.hold(true);
      const d = draws.slice(2).sort((a, b) => a - b), q = f => d[Math.floor(f * (d.length - 1))].toFixed(1);
      done(`draw p50 ${q(0.5)} ms · p95 ${q(0.95)} ms · ${(draws.length / secs).toFixed(0)} fps`);
    };
    requestAnimationFrame(tick);
  }), secs);
}

// =================== main ===================

const [out, ...want] = process.argv.slice(2);
if (!out) {
  console.log('usage: node test/ui-shot.mjs <outdir> [scenario ...]\n\nscenarios:');
  for (const [n, s] of Object.entries(SCENARIOS)) console.log(`  ${n.padEnd(16)} ${s.about}`);
  process.exit(0);
}
const names = want.length ? want : Object.keys(SCENARIOS);
const unknown = names.filter(n => !SCENARIOS[n]);
if (unknown.length) { console.error(`unknown scenario(s): ${unknown.join(', ')}`); process.exit(2); }
fs.mkdirSync(out, { recursive: true });

const { chromium } = await import(PLAYWRIGHT);
const server = await serve();
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch();
let failed = 0;
try {
  for (const name of names) {
    let r;
    try { r = await run(browser, base, out, name); }
    catch (err) { r = { name, errors: [`harness: ${err.message}`], warnings: [], notes: [], ms: [] }; }
    const status = r.errors.length ? 'ERR' : 'ok ';
    console.log(`${status} ${name.padEnd(16)} ms/frame ${r.ms.map(m => m.toFixed(2)).join(' / ') || '-'}   ${r.notes.join(' · ')}`);
    for (const e of r.errors) console.log(`      error: ${e.split('\n').slice(0, 4).join('\n             ')}`);
    for (const w of r.warnings) console.log(`      warn:  ${w}`);
    if (r.errors.length) failed++;
  }
} finally {
  await browser.close();
  server.close();
}
console.log(`\n${names.length - failed}/${names.length} clean · PNGs in ${path.resolve(out)}`);
process.exit(failed ? 1 : 0);
