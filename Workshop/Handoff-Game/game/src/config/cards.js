// ===== Research cards (v1 set) =====
// type: unlock (adds a layer to the hand) | upgrade (one-off effect, applied in sim/research.js)
// requires: layer that must already be unlocked | addresses: attack types this card helps with

export const CARDS = [
  // --- unlocks ---
  { id: 'unlock_untrusted',   type: 'unlock', layer: 'untrusted',   addresses: ['harmful', 'leak', 'sabotage', 'poison', 'exfil'] },
  { id: 'unlock_honeypot',    type: 'unlock', layer: 'honeypot',    addresses: ['sabotage', 'poison', 'exfil'] },
  { id: 'unlock_defer',       type: 'unlock', layer: 'defer',       addresses: ['harmful', 'leak', 'jailbreak'] },
  { id: 'unlock_resampler',   type: 'unlock', layer: 'resampler',   addresses: ['sabotage', 'poison', 'harmful'] },
  { id: 'unlock_paraphraser', type: 'unlock', layer: 'paraphraser', addresses: ['sabotage', 'exfil'] },
  { id: 'unlock_sandbox',     type: 'unlock', layer: 'sandbox',     addresses: ['sabotage', 'poison', 'exfil', 'leak'] },

  // --- upgrades ---
  { id: 'retrain_probes', type: 'upgrade', requires: 'probe', title: 'Retrain Probes',
    text: 'Unlocks a button: spend 5 evidence to restore probe TPR.', addresses: ['sabotage', 'harmful'] },
  { id: 'monitor_ensemble', type: 'upgrade', requires: 'monitor', title: 'Monitor Ensemble',
    text: 'Trusted monitor TPR +0.10, per-task cost ×1.5.', addresses: ['harmful', 'leak', 'sabotage'] },
  { id: 'ai_auditing', type: 'upgrade', requires: 'auditor', title: 'AI-Assisted Auditing',
    text: 'Auditor capacity ×10. Accuracy now capped by the assisting model\'s honesty.', addresses: ['poison', 'exfil'] },
  { id: 'promote_model', type: 'upgrade', requires: 'monitor', minGen: 2, title: 'Promote Last Model to Trusted',
    text: 'Trusted monitor TPR reset to G1 level for good, but colludes if that model was misaligned.', addresses: ['sabotage', 'poison', 'exfil'] },
  { id: 'extra_slot_ext', type: 'upgrade', repeatable: true, lane: 'ext', title: 'Extra Tier Slot: EXTERNAL',
    text: '+1 tier slot in the external lane.', addresses: ['harmful', 'leak', 'jailbreak'] },
  { id: 'extra_slot_int', type: 'upgrade', repeatable: true, lane: 'int', title: 'Extra Tier Slot: INTERNAL',
    text: '+1 tier slot in the internal lane.', addresses: ['sabotage', 'poison', 'exfil'] },
  { id: 'tripwires', type: 'upgrade', title: 'Tripwires',
    text: 'Any catch pauses that lane for 2 s so you can react.', addresses: [] },
  { id: 'irt', type: 'upgrade', title: 'Incident Response Team',
    text: 'Halves reputation loss per incident.', addresses: ['harmful', 'leak', 'jailbreak'] },
];
