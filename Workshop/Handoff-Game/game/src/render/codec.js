// ===== Codec: MGS-style call box. Typewriter text, two portraits, choices. =====
// Reads st.codec (append-only). Never blocks the playfield except for choices (sim halts on pendingChoice).

import { CAST } from '../config/events.js';
import { drawPortrait } from './portraits.js';
import { sfx } from './audio.js';

export function createCodec(onChoose) {
  const el = {
    box: document.getElementById('codec'),
    name: document.getElementById('codec-name'),
    text: document.getElementById('codec-text'),
    choices: document.getElementById('codec-choices'),
    pl: document.getElementById('portrait-l'),
    pr: document.getElementById('portrait-r'),
  };
  let lastId = 0, queue = [], cur = null, shown = 0, curT0 = 0, lastTick = 0;

  function reset() { lastId = 0; queue = []; cur = null; el.text.textContent = ''; el.choices.innerHTML = ''; }

  function start(msg, now) {
    cur = msg; shown = 0; curT0 = now;
    const c = CAST[msg.speaker] || CAST.safety;
    el.name.innerHTML = `${c.name} <span class="freq">${(140 + (c.seed % 10) / 10 + 0.05).toFixed(2)}</span>`;
    el.name.style.color = c.color;
    el.choices.innerHTML = '';
    el.box.classList.toggle('choice', !!msg.choices);
  }

  function showChoices(st) {
    el.choices.innerHTML = '';
    cur.choices.forEach((c, i) => {
      const b = document.createElement('button');
      b.innerHTML = `${i + 1}. ${c.label}${c.hint ? `<small>${c.hint}</small>` : ''}`;
      b.onclick = () => onChoose(i);
      el.choices.appendChild(b);
    });
  }

  function update(st, now) {
    // pull new messages
    for (const m of st.codec) if (m.id > lastId) { queue.push(m); lastId = m.id; }
    // a pending choice jumps the queue
    if (st.pendingChoice && (!cur || cur.id !== st.pendingChoice.msgId)) {
      const m = queue.find(q => q.id === st.pendingChoice.msgId) || st.codec.find(q => q.id === st.pendingChoice.msgId);
      if (m) { queue = queue.filter(q => q !== m); start(m, now); }
    }
    if (cur && !st.pendingChoice && cur.choices) { el.choices.innerHTML = ''; el.box.classList.remove('choice'); }

    const speed = queue.length > 3 ? 120 : 45;               // chars per second
    const hold = queue.length > 3 ? 0.8 : 2.6;
    if (cur) {
      const want = Math.min(cur.text.length, Math.floor((now - curT0) * speed));
      if (want > shown) { shown = want; el.text.textContent = cur.text.slice(0, shown); sfx.type(); }
      const done = shown >= cur.text.length;
      if (done && cur.choices && st.pendingChoice?.msgId === cur.id && !el.choices.children.length) showChoices(st);
      const finished = done && now - curT0 > cur.text.length / speed + hold;
      if (finished && queue.length && !(st.pendingChoice?.msgId === cur.id)) start(queue.shift(), now);
    } else if (queue.length) start(queue.shift(), now);

    // portraits at ~10 fps
    if (now - lastTick > 0.1) {
      lastTick = now;
      const talking = cur && shown < cur.text.length && Math.floor(now * 10) % 2 === 0;
      const sp = cur ? cur.speaker : 'audit';
      if (sp === 'safety') {
        drawPortrait(el.pl, 'audit', { dim: true });
        drawPortrait(el.pr, 'safety', { talking });
      } else {
        drawPortrait(el.pl, sp, { talking, gen: st.gen });
        drawPortrait(el.pr, 'safety', { dim: true });
      }
    }
  }

  return { update, reset };
}
