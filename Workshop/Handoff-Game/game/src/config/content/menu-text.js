// ===== The main menu words: the three modes, the cold-open call, the difficulty and training steps, menu buttons =====
// Data only: src/ui/overlays.js reads these (train.html reads TRAIN_DEBTS). Speakers are CAST ids (ceo → BIG BOSS).
// The start dialog holds 3 lines of ~60 characters. A mode or difficulty line fits one row of the menu (≤ 50 characters);
// a left-panel line fits one row at ≤ 68.

// ==================== the modes (keys 1 / 2 / 3) ====================

export const MODES = [
  { id: 'campaign', name: 'CAMPAIGN', line: 'The full game. Deploy each model, train the next.', meta: 'G1 TO G7 · DEPLOY · REPORT · TRAIN' },
  { id: 'td', name: 'TOWER DEFENSE', line: 'Deployment only. Training resolves itself at par.', meta: 'G1 TO G7 · DEPLOY · REPORT' },
  { id: 'training', name: 'TRAINING', line: 'Just the training minigame. Pick a run and play.', meta: 'ONE RUN · ABOUT A MINUTE' },
];

// ==================== the codec call on the menu ====================
// main: once a page load (Space or a click hurries it). Each step after it says its own line.

export const COLD_OPEN = [
  ['ceo',    'Kept you waiting, huh? You are the safety team now. All of it.'],
  ['ceo',    'Tasks roll down the tracks. A few of them are attacks.'],
  ['safety', 'Which ones?'],
  ['ceo',    'If we knew that, we would not need you. Pick a mission.'],
];
export const STEP_SAY = {
  campaign: [['ceo', 'Seven models. You deploy them, then you train the next. Pick a difficulty. I would pick the one where we win.']],
  td:       [['ceo', 'Deployment only. R&D trains the models at par without you. Pick a difficulty.']],
  training: [['ceo', 'A training run. Keep the model in the basin of alignment. Pick a generation, and the debt it carries.']],
};

// ==================== the difficulty step ====================

export const DIFF_HINT = {
  easy: 'the model is probably fine',
  medium: 'the model says it is fine',
  hard: 'the model has read your eval suite',
  unknown: 'rolled in secret: the scorecard tells you',
};

// ==================== the left panel: THE JOB (menu), CONTROLS (difficulty), HOW TO TRAIN (training) ====================

export const RULES = [
  'Tasks roll down the lanes. A few are attacks. Nobody tells you which.',
  'Detectors flag. Humans review what they have room for. A flag nobody takes ships anyway.',
  'Customers pay the bills. R&D trains the next model, and it inherits whatever slips through.',
  'Evidence fills the dossier: the only way to learn what your model really is.',
];
export const CONTROLS = [
  ['CLICK', 'menu key, then a mount'],
  ['SHIFT+CLICK', 'upgrade a mount'],
  ['RIGHT-CLICK', 'cancel · twice: sell'],
  ['DRAG', 'the compute split'],
  ['TAB  [  ]', 'switch lanes'],
  ['R', 'research: keep a card'],
  ['1-9', 'answer · take an element'],
  ['SPACE', 'pause (still build)'],
  ['F', 'three times the speed'],
  ['M · ESC', 'mute · cancel'],
];
export const TRAIN_HOW = [
  'The model rolls down its loss landscape. Keep it in the green basin.',
  'Click beside the dotted path: a guard rail, it bounces off.',
  'Click on the path: a ramp that steers it back to the basin.',
  'Right click in its way: a pop bumper knocks it out of a fork.',
  'Debt is what landed on R&D: hazards, a narrower basin, noise.',
  'Esc quits a run. In a campaign, the score s sets the next Δm.',
];

// ==================== training picker (the game's TRAINING step and train.html) ====================
// [alignment debt, label], the options train.html has always offered

export const TRAIN_DEBTS = [[0, 'CLEAN'], [0.005, '0.005 · PAR'], [0.01, '0.010'], [0.02, '0.020'], [0.05, '0.050 · WORST']];

// ==================== labels ====================

export const MENU_UI = {
  select: 'SELECT MISSION',
  difficulty: '{mode} · PICK A DIFFICULTY',
  training: 'TRAINING · PICK A RUN',
  // key hints under each step: [[keys], what]
  hintMain: [[['1', '2', '3'], 'pick'], [['ENTER'], 'go'], [['SPACE'], 'hurry the call']],
  hintDiff: [[['1', '2', '3', '4'], 'pick'], [['ENTER'], 'start'], [['ESC'], 'back']],
  hintTrain: [[['ENTER'], 'train'], [['ESC'], 'back']],
  back: '◂ BACK',
  menu: '◂ MENU',
  train: 'TRAIN ▸',
  again: 'AGAIN ▸',
  newSeed: 'NEW SEED',
  gen: 'GENERATION BEING TRAINED',
  debt: 'ALIGNMENT DEBT FROM THE R&D LANE',
  seed: 'SEED',
  run: 'THIS RUN',
  runLine: 'G{g} · {secs} s · {forks} forks · basin ±{w} · noise {sig}',
  debtLine: 'debt {debt}: {hazards} hazards · basin −{narrow}% · noise +{noise}',
  debtClean: 'no debt: no hazards, the full basin',
  range: 'TRUE MISALIGNMENT {lo}–{hi}%',
  rangeUnknown: 'TRUE MISALIGNMENT: ONE OF THE THREE, SEALED',
  last: 'LAST RUN',
  lastHead: 'G{g} · seed {seed} · debt {debt}',
  lastS: 's {s}',
  lastScore: '{basin} · loss {err} · in a campaign Δm {dm}',
  lastTools: 'rails {rails} · ramps {ramps} · bumpers {bumpers} · hazards hit {hazards}',
  converged: 'IN THE BASIN',          // the results card's words: res.converged means it ended in the basin of alignment
  diverged: 'WRONG BASIN',
  best: 'BEST {mode}',
  bestRun: 'grade {grade} · {ending} · reached G{gen}',
  bestTrain: 's {s} on G{g}',
  noBest: 'none yet. The scorecard is honest; brace.',
  noBestTrain: 'none yet. Keep the model in the basin.',
  failed: 'The training run did not start. The console says why.',
};

// ==================== tower defense: training resolves itself (src/main.js submits trainingStub at par) ====================

export const TD_TEXT = {
  next: 'NEXT MODEL',
  hint: 'next model · training resolves itself',
  reportRow: 'auto-resolved at par (tower defense)',
  cardRow: 'auto-resolved at par · s {s} · Δm {dm}',
  cardQuip: 'tower defense skips the minigame',
  logTrained: 'auto-resolved at par',    // the ops log's line for the next model
  scoreTag: 'TOWER DEFENSE',
};

// ==================== the way back: pause plate and scorecard ====================

export const BACK_TO_MENU = {
  pause: 'MAIN MENU',
  confirm: 'CLICK AGAIN TO QUIT',
  again: 'PLAY AGAIN',
  menu: 'MENU',
};
