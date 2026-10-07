// ===== Hit regions: everything clickable or hoverable registers its rect while it draws =====
// Each frame: begin() → modules call add() as they draw → end() publishes the list. Input (input.js) asks at(x, y)
// against the last published frame. Later regions sit on top of earlier ones.
//   add(x, y, w, h, kind, data, cursor)   kind: a string from the table in design/UI-PLAN.md, data: plain object

export function createHits() {
  let building = [], live = [];
  return {
    begin() { building = []; },
    add(x, y, w, h, kind, data = null, cursor = 'pointer') { building.push({ x, y, w, h, kind, data, cursor }); },
    end() { live = building; },
    at(x, y) {
      for (let i = live.length - 1; i >= 0; i--) {
        const r = live[i];
        if (x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h) return r;
      }
      return null;
    },
    all(kind = null) { return live.filter(r => !kind || r.kind === kind); },
  };
}

// same region in two different frames (regions are rebuilt every frame, so compare kind + data)
export const sameRegion = (a, b) => !!a && !!b && a.kind === b.kind && JSON.stringify(a.data) === JSON.stringify(b.data);
