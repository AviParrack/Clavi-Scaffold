// ======================================================================
//  NPCS  —  stub. Stage-2 owner: aliens. Contract: design/V4-CONTRACT.md
// ======================================================================
const Npcs = (() => {
  const mod = { id: 'npcs' };
  Game.register(mod);
  if (!Game.mods.includes(mod)) return undefined;
  return undefined;                                   // the owner returns the API here
})();

if (typeof module !== 'undefined') module.exports = Npcs;
