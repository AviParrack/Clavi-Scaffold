// ======================================================================
//  HAUL  —  stub. Stage-2 owner: ship. Contract: design/V4-CONTRACT.md
// ======================================================================
const Haul = (() => {
  const mod = { id: 'haul' };
  Game.register(mod);
  if (!Game.mods.includes(mod)) return undefined;
  return undefined;                                   // the owner returns the API here
})();

if (typeof module !== 'undefined') module.exports = Haul;
