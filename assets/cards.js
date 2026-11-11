/* Flashcards with a light SM-2 spaced-repetition scheduler stored in localStorage. */
'use strict';
const SRS = {
  key: 'geostudy.srs.v1',
  load() { try { return JSON.parse(localStorage.getItem(this.key) || '{}'); } catch (e) { return {}; } },
  save(d) { localStorage.setItem(this.key, JSON.stringify(d)); },
  id(deck, card) { return deck + '|' + (card.q[0] || card.qtext || '') + '|' + card.a; },
  // grade: 0 again, 1 hard, 2 good, 3 easy
  grade(deck, card, g) {
    const d = this.load(); const k = this.id(deck, card); const s = d[k] || { ef: 2.5, n: 0, iv: 0, due: 0, seen: 0, ok: 0 };
    s.seen++; if (g >= 2) s.ok++;
    if (g === 0) { s.n = 0; s.iv = 0; s.due = Date.now() + 60 * 1000; }
    else {
      s.n++;
      s.iv = s.n === 1 ? (g === 3 ? 4 : 1) : s.n === 2 ? (g === 3 ? 10 : 6) : Math.round(s.iv * s.ef * (g === 1 ? .7 : g === 3 ? 1.3 : 1));
      s.ef = Math.max(1.3, s.ef + (0.1 - (3 - g) * (0.08 + (3 - g) * 0.02)));
      s.due = Date.now() + s.iv * 864e5;
    }
    d[k] = s; this.save(d);
  },
  state(deck, card) { return this.load()[this.id(deck, card)]; },
  deckStats(deck, cards) {
    const d = this.load(); let due = 0, seen = 0, learned = 0; const now = Date.now();
    cards.forEach(c => { const s = d[SRS.id(deck, c)]; if (!s) return; seen++; if (s.due <= now) due++; if (s.n >= 3) learned++; });
    return { due, seen, learned, newc: cards.length - seen };
  },
};
function deckRow(d) {
  return `<div class="deckrow"><div class="t"><a href="#/deck/${d.id}">${esc(d.title)}</a><small>${esc(d.desc || '')} · ${d.count} cards</small></div><a class="btn sm" href="#/deck/${d.id}">Study</a></div>`;
}
route(/^\/decks$/, async (app, m, q) => {
  const decks = G.decks; const groups = [...new Set(decks.map(d => d.group))];
  const order = ['Europe', 'North America', 'South America', 'Asia', 'Africa', 'Oceania', 'LM World', 'LM Europe', 'LM North America', 'LM South America', 'LM Asia', 'LM Africa', 'LM Oceania', 'Country top', 'Country'];
  groups.sort((a, b) => (order.indexOf(a) + 1 || 99) - (order.indexOf(b) + 1 || 99));
  const sel = q.g || groups[0]; const f = (q.f || '').toLowerCase();
  const list = decks.filter(d => d.group === sel && (!f || d.title.toLowerCase().includes(f)));
  app.innerHTML = `<h1>Flashcards</h1>
  <p class="muted small">Image → answer decks. Progress is saved in this browser (spaced repetition). "LM …" decks are learnablemeta maps (each meta with its pictures); continent decks come from geomastr images; "Country" decks are all plonkit tips for one country.</p>
  <div class="chips">${groups.map(g => `<a class="chip ${g === sel ? 'active' : ''}" href="#/decks?g=${encodeURIComponent(g)}">${esc(g)} <span class="muted">(${decks.filter(d => d.group === g).length})</span></a>`).join('')}</div>
  <input id="deckfilter" type="search" placeholder="Filter decks…" value="${esc(q.f || '')}" style="width:100%;padding:.5rem;border-radius:8px;border:1px solid #475569;background:var(--bg2);color:var(--fg);font-size:16px">
  <div class="card" id="decklist">${list.map(deckRow).join('') || '<span class="muted">No decks.</span>'}</div>`;
  $('#deckfilter').oninput = e => { const v = e.target.value.toLowerCase(); $('#decklist').innerHTML = decks.filter(d => d.group === sel && d.title.toLowerCase().includes(v)).map(deckRow).join(''); };
});
route(/^\/progress$/, async app => {
  const d = SRS.load(); const by = {};
  Object.keys(d).forEach(k => { const id = k.split('|')[0]; const s = d[k]; by[id] = by[id] || { seen: 0, due: 0, learned: 0 }; by[id].seen++; if (s.due <= Date.now()) by[id].due++; if (s.n >= 3) by[id].learned++; });
  const rows = Object.entries(by).map(([id, s]) => ({ id, ...s, title: (G.decks.find(x => x.id === id) || {}).title || id, count: (G.decks.find(x => x.id === id) || {}).count || '?' }));
  app.innerHTML = `<h1>Progress</h1><p class="muted small">${Object.keys(d).length} cards seen in total. Data lives in this browser's localStorage.</p>
  <div class="card">${rows.map(r => `<div class="deckrow"><div class="t"><a href="#/deck/${r.id}">${esc(r.title)}</a><small>seen ${r.seen}/${r.count} · learned ${r.learned}</small></div><div class="due">${r.due ? `<b>${r.due} due</b>` : 'nothing due'}</div><a class="btn sm" href="#/deck/${r.id}">Study</a></div>`).join('') || '<span class="muted">Nothing studied yet.</span>'}</div>
  <p><button class="btn" id="exp">Export progress</button> <button class="btn" id="imp">Import</button> <button class="btn" id="clr">Reset all</button></p>`;
  $('#exp').onclick = () => { const b = new Blob([JSON.stringify(d)], { type: 'application/json' }); const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = 'geostudy-progress.json'; a.click(); };
  $('#imp').onclick = () => { const i = document.createElement('input'); i.type = 'file'; i.onchange = () => i.files[0].text().then(t => { SRS.save({ ...d, ...JSON.parse(t) }); render(); }); i.click(); };
  $('#clr').onclick = () => { if (confirm('Delete all progress?')) { SRS.save({}); render(); } };
});

route(/^\/deck\/([a-z0-9-]+)$/, async (app, m, q) => {
  const meta = G.decks.find(d => d.id === m[1]); if (!meta) throw new Error('deck not found');
  const deck = await getJSON(`data/decks/${m[1]}.json`);
  const st = SRS.deckStats(deck.id, deck.cards);
  const answers = [...new Set(deck.cards.map(c => c.a))];
  const canChoice = answers.length >= 4;
  app.innerHTML = `<div class="fc"><h1 style="font-size:1.25rem">${esc(deck.title)}</h1><p class="muted small">${esc(deck.desc || '')} · ${deck.cards.length} cards · ${st.due} due · ${st.newc} new · ${st.learned} learned</p>
  <div class="chips"><button class="chip" data-mode="due">Due + new</button><button class="chip" data-mode="all">All (cram)</button>${canChoice ? '<button class="chip" data-mode="choice">Multiple choice</button>' : ''}<button class="chip" data-mode="browse">Browse</button></div>
  <div id="fcbody"></div></div>`;
  app.querySelectorAll('[data-mode]').forEach(b => b.onclick = () => startDeck(deck, b.dataset.mode));
  startDeck(deck, q.mode || (st.due + st.newc ? 'due' : 'all'));
});
function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
function startDeck(deck, mode) {
  const body = $('#fcbody'); const now = Date.now();
  document.querySelectorAll('[data-mode]').forEach(b => b.classList.toggle('active', b.dataset.mode === mode));
  if (mode === 'browse') { body.innerHTML = deck.cards.map(c => `<div class="meta-item"><b>${esc(c.a)}</b>${c.qtext ? ' – ' + esc(c.qtext) : ''}<div class="note">${c.note || ''}</div><div class="imgs">${c.q.map(i => IMG(i)).join('')}</div></div>`).join(''); return; }
  let queue = deck.cards.map((c, i) => ({ c, i }));
  if (mode === 'due') { queue = queue.filter(x => { const s = SRS.state(deck.id, x.c); return !s || s.due <= now; }); }
  shuffle(queue); if (mode === 'due') queue = queue.slice(0, 40);
  const answers = [...new Set(deck.cards.map(c => c.a))];
  let pos = 0, right = 0, wrong = 0; const again = [];
  const next = () => {
    if (pos >= queue.length) {
      if (again.length && mode !== 'choice') { queue = shuffle(again.splice(0)); pos = 0; } else {
        body.innerHTML = `<div class="card" style="text-align:center"><h2>Done 🎉</h2><p>${right} right · ${wrong} wrong</p><button class="btn primary" id="again">Study again</button> <a class="btn" href="#/decks">All decks</a></div>`; $('#again').onclick = () => startDeck(deck, mode); return; }
    }
    const { c } = queue[pos]; const s = SRS.state(deck.id, c);
    body.innerHTML = `<div class="stat"><span>${pos + 1} / ${queue.length}${again.length ? ' (+' + again.length + ' again)' : ''}</span><span>${s ? 'seen ' + s.seen + '× · interval ' + s.iv + 'd' : 'new'}</span></div><div class="bar"><i style="width:${pos / queue.length * 100}%"></i></div>
    <div class="q">${c.q.length ? c.q.map(i => IMG(i)).join('') : `<div class="qtext">${esc(c.qtext)}</div>`}</div>
    <div id="ans"></div>`;
    const ans = $('#ans');
    const showAnswer = (chosen) => {
      ans.innerHTML = `<div class="a"><div class="ans">${c.slug ? `<a href="#/country/${c.slug}">${esc(c.a)}</a>` : esc(c.a)}</div>${c.step ? `<div class="muted small">${esc(c.step)}</div>` : ''}<div class="note">${c.note || ''}</div></div>` +
        (mode === 'choice' ? `<p style="text-align:center"><button class="btn primary" id="nx">Next →</button></p>` :
          `<div class="grade"><button class="g0" data-g="0">Again<br><small>&lt;1 min</small></button><button class="g1" data-g="1">Hard</button><button class="g2" data-g="2">Good</button><button class="g3" data-g="3">Easy</button></div>`);
      ans.querySelectorAll('[data-g]').forEach(b => b.onclick = () => { const g = +b.dataset.g; SRS.grade(deck.id, c, g); if (g === 0) { again.push(queue[pos]); wrong++; } else right++; pos++; next(); });
      const nx = $('#nx'); if (nx) nx.onclick = () => { pos++; next(); };
      window.scrollTo({ top: Math.max(0, ans.getBoundingClientRect().top + window.scrollY - 300), behavior: 'smooth' });
    };
    if (mode === 'choice') {
      const opts = shuffle([c.a, ...shuffle(answers.filter(a => a !== c.a)).slice(0, 3)]);
      ans.innerHTML = `<div class="choices">${opts.map(o => `<button data-o="${esc(o)}">${esc(o)}</button>`).join('')}</div>`;
      ans.querySelectorAll('[data-o]').forEach(b => b.onclick = () => {
        const ok = b.dataset.o === c.a; ans.querySelectorAll('[data-o]').forEach(x => { x.disabled = true; if (x.dataset.o === c.a) x.classList.add('ok'); }); if (!ok) b.classList.add('bad');
        SRS.grade(deck.id, c, ok ? 2 : 0); if (ok) right++; else wrong++;
        const keep = ans.innerHTML; showAnswer(); ans.insertAdjacentHTML('afterbegin', keep);
        ans.querySelectorAll('[data-o]').forEach(x => { x.disabled = true; x.classList.toggle('ok', x.dataset.o === c.a); x.classList.toggle('bad', x === b && !ok); });
      });
    } else {
      ans.innerHTML = `<p style="text-align:center"><button class="btn primary" id="show">Show answer</button> <span class="kbd">space</span></p>`;
      $('#show').onclick = () => showAnswer();
    }
  };
  document.onkeydown = e => { if (!$('#fcbody')) { document.onkeydown = null; return; } if (e.target.tagName === 'INPUT') return;
    if (e.key === ' ') { e.preventDefault(); const b = $('#show') || $('#nx'); if (b) b.click(); }
    const g = { '1': 0, '2': 1, '3': 2, '4': 3 }[e.key]; if (g !== undefined) { const b = $(`[data-g="${g}"]`); if (b) b.click(); } };
  next();
}
