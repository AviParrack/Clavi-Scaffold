// ======================================================================
//  MOCHI  —  stub. Stage-2 owner: mochi. Contract: design/V4-CONTRACT.md
// ======================================================================
const Mochi = (() => {
  const mod = { id: 'mochi' };
  Game.register(mod);
  if (!Game.mods.includes(mod)) return undefined;
  return undefined;                                   // the owner returns the API here
})();

if (typeof module !== 'undefined') module.exports = Mochi;
