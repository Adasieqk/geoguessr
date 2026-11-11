/* Map quizzes: tile-grid maps (Brazil DDD, Australia, Indonesia) and SVG map (USA). */
'use strict';
route(/^\/quizzes$/, async app => {
  app.innerHTML = `<h1>Map quizzes</h1><div class="grid">
  <a class="card" href="#/quiz/brazil-ddd"><b>🇧🇷 Brazil phone codes (DDD)</b><br><span class="muted small">Code → click the state on a blank map; state → codes; colour-coded reference map with the exact area of every code.</span></a>
  <a class="card" href="#/quiz/us-states"><b>🇺🇸 US states</b><br><span class="muted small">Find the state on a real map, plus the plonkit state clues.</span></a>
  <a class="card" href="#/quiz/australia"><b>🇦🇺 Australia states</b><br><span class="muted small">Find the state on a real map, plus state-specific clues.</span></a>
  <a class="card" href="#/quiz/indonesia"><b>🇮🇩 Indonesia islands</b><br><span class="muted small">Find the island, plus island-specific clues.</span></a>
  </div>
  <h2>Related flashcards</h2><div class="card">${(G.decks || []).filter(d => /Brazil Phone|USA - License|USA State Highway|USA License|Indonesia|Australia/i.test(d.title) && d.id.startsWith('lm-')).slice(0, 12).map(deckRow).join('')}</div>`;
});

route(/^\/quiz\/([a-z-]+)$/, async (app, m, q) => {
  const id = m[1]; const key = { 'brazil-ddd': 'brazil_ddd', 'us-states': 'us_states', australia: 'australia', indonesia: 'indonesia' }[id];
  const cfg = G.curated[key]; if (!cfg) throw new Error('quiz not found');
  let tips = {};
  if (cfg.country) {
    try {
      const c = await country(cfg.country);
      const regional = c.steps.filter(s => s.kind === 'tips' && /regional|region-|province|state|island/i.test(s.title || ''));
      const all = regional.flatMap(s => s.items.filter(i => i.k === 'tip'));
      cfg.regions.forEach(r => {
        const names = [r.name, r.abbr, r.match].filter(Boolean).map(x => x.toLowerCase());
        tips[r.id] = all.filter(t => { const h = (t.html || '').toLowerCase(); return names.some(n => n.length > 2 && h.includes(n)); }).slice(0, 12);
      });
    } catch (e) { console.warn(e); }
  }
  const isCode = !!cfg.regions[0].codes;
  app.innerHTML = `<h1>${esc(cfg.title)}</h1>${cfg.intro ? `<p class="small">${cfg.intro}</p>` : ''}
  <div class="chips"><button class="chip" data-mode="ref">Reference</button>${isCode ? '<button class="chip" data-mode="code">Code → state</button><button class="chip" data-mode="rev">State → codes</button>' : ''}<button class="chip" data-mode="find">Name → map</button><button class="chip" data-mode="name">Map → name</button></div>
  <div id="qz"></div>`;
  app.querySelectorAll('[data-mode]').forEach(b => b.onclick = () => startQuiz(cfg, b.dataset.mode, tips));
  startQuiz(cfg, q.mode || (isCode ? 'code' : 'find'), tips);
});

const SVGNS = 'http://www.w3.org/2000/svg';
async function renderMap(cfg, container, labels, colors) {
  if (cfg.svg) {
    const svg = await (await fetch(cfg.svg)).text();
    container.innerHTML = `<div class="svgmap">${svg}</div>`;
    const s = container.querySelector('svg');
    s.querySelectorAll('title').forEach(t => t.remove());
    const top = document.createElementNS(SVGNS, 'g'); top.setAttribute('class', 'overlay'); s.appendChild(top);
    cfg.regions.forEach(r => {
      const els = [...s.querySelectorAll('.' + r.id)].filter(e => e.tagName !== 'g' || !e.querySelector('.' + r.id));
      if (!els.length) return;
      els.forEach(e => { e.dataset.rid = r.id; if (colors && colors(r)) e.style.fill = colors(r); });
      // bounding box of the whole region (all parts)
      let x1 = 1e9, y1 = 1e9, x2 = -1e9, y2 = -1e9;
      els.forEach(e => { const bb = e.getBBox(); x1 = Math.min(x1, bb.x); y1 = Math.min(y1, bb.y); x2 = Math.max(x2, bb.x + bb.width); y2 = Math.max(y2, bb.y + bb.height); });
      const main = els.reduce((m, e) => { const bb = e.getBBox(); return bb.width * bb.height > m.a ? { e, a: bb.width * bb.height, bb } : m; }, { a: -1 });
      const cx = main.bb.x + main.bb.width / 2, cy = main.bb.y + main.bb.height / 2;
      const vb = s.viewBox.baseVal; const unit = Math.max(vb.width, vb.height) / 100;
      const size = Math.max(x2 - x1, y2 - y1);
      if (size < unit * 2.5) { // tiny region (DF, ACT, DC, RI…) -> slightly bigger tap target
        const c = document.createElementNS(SVGNS, 'circle'); c.setAttribute('cx', cx); c.setAttribute('cy', cy); c.setAttribute('r', Math.max(size / 2, unit * 1.1));
        c.setAttribute('class', 'hit'); c.dataset.rid = r.id; if (colors && colors(r)) c.style.fill = colors(r); top.appendChild(c);
      }
      const lab = labels && labels(r);
      if (lab) {
        const t = document.createElementNS(SVGNS, 'text'); t.setAttribute('x', cx); t.setAttribute('y', cy); t.setAttribute('class', 'lbl');
        t.setAttribute('font-size', Math.max(unit * 1.3, Math.min(unit * 2.3, Math.min(main.bb.width, main.bb.height) / 3.2)));
        String(lab).split('\n').forEach((ln, i, arr) => { const ts = document.createElementNS(SVGNS, 'tspan'); ts.setAttribute('x', cx); ts.setAttribute('dy', i === 0 ? -(arr.length - 1) * 0.55 + 0.35 + 'em' : '1.1em'); ts.textContent = ln; t.appendChild(ts); });
        top.appendChild(t);
      }
    });
    const all = () => [...container.querySelectorAll('[data-rid]')];
    // fit the viewBox to the drawn shapes (some source files have a too-small viewBox)
    let X1 = 1e9, Y1 = 1e9, X2 = -1e9, Y2 = -1e9;
    s.querySelectorAll('path[data-rid]').forEach(e => { const bb = e.getBBox(); X1 = Math.min(X1, bb.x); Y1 = Math.min(Y1, bb.y); X2 = Math.max(X2, bb.x + bb.width); Y2 = Math.max(Y2, bb.y + bb.height); });
    if (X2 > X1) { const pad = (X2 - X1) * 0.02; s.setAttribute('viewBox', [X1 - pad, Y1 - pad, X2 - X1 + 2 * pad, Y2 - Y1 + 2 * pad].join(' ')); }
    return { mark: (r, cls, on = true) => all().filter(e => e.dataset.rid === r.id).forEach(e => e.classList.toggle(cls, on)), all, svg: s };
  }
  container.innerHTML = `<div class="tilemap" style="grid-template-columns:repeat(${cfg.cols},1fr)">${cfg.regions.map(r => `<div class="t" data-rid="${r.id}" style="grid-column:${r.col + 1}/span ${r.w || 1};grid-row:${r.row + 1}/span ${r.h || 1};${(r.w || 1) > 1 || (r.h || 1) > 1 ? 'aspect-ratio:auto;min-height:60px' : ''}">${labels ? `<span>${esc(labels(r) || '')}</span>` : ''}</div>`).join('')}</div>`;
  const all = () => [...container.querySelectorAll('[data-rid]')];
  return { mark: (r, cls, on = true) => all().filter(e => e.dataset.rid === r.id).forEach(e => e.classList.toggle(cls, on)), all };
}

function startQuiz(cfg, mode, tips) {
  const box = $('#qz'); document.querySelectorAll('[data-mode]').forEach(b => b.classList.toggle('active', b.dataset.mode === mode));
  const regions = cfg.regions; const byId = Object.fromEntries(regions.map(r => [r.id, r]));
  const codeList = regions.flatMap(r => (r.codes || []).map(c => ({ ...c, rid: r.id })));
  if (mode === 'ref') {
    box.innerHTML = `<div id="map"></div>${cfg.digits ? `<div class="card"><b>First digit → region</b><table class="table">${Object.entries(cfg.digits).map(([d, t]) => `<tr><td><b>${d}x</b></td><td>${esc(t)}</td></tr>`).join('')}</table></div>` : ''}
    <div id="reflist">${regions.map(r => `<details id="r-${r.id}"><summary>${esc(r.abbr || '')} ${esc(r.name)} ${r.codes ? `<span class="muted small">${r.codes.map(c => c.code).join(', ')}</span>` : ''}</summary><div class="body">
      ${r.codes ? `<div class="grid narrow">${r.codes.map(c => `<div class="card" style="margin:0"><b>${esc(c.code)}</b> <span class="small">${esc(c.note)}</span>${c.img ? `<div style="margin-top:.3rem">${IMG(c.img)}</div>` : ''}</div>`).join('')}</div>` : ''}
      ${(tips[r.id] || []).length ? `<h3 class="subh">Clues (plonkit regional step)</h3>${tips[r.id].map(t => `<div class="tip compact">${t.img ? `<div>${IMG(t.img)}</div>` : '<div></div>'}<div class="txt">${t.html}</div></div>`).join('')}` : (r.codes ? '' : '<p class="muted small">No region-specific tips matched by name; see the country page\'s Regional section.</p>')}
    </div></details>`).join('')}</div>`;
    const colors = cfg.digitColors ? (r => cfg.digitColors[r.codes[0].code[0]]) : null;
    renderMap(cfg, $('#map'), r => r.codes ? [r.abbr, ...r.codes.map(c => c.code).reduce((acc, c, i) => (i % 4 ? acc[acc.length - 1] += ' ' + c : acc.push(c), acc), [])].join('\n') : (r.abbr || ''), colors).then(mp => {
      mp.all().forEach(el => el.onclick = () => { const d = document.getElementById('r-' + el.dataset.rid); d.open = true; d.scrollIntoView({ behavior: 'smooth', block: 'start' }); });
    });
    if (cfg.digitColors) $('#map').insertAdjacentHTML('afterend', `<div class="legend">${Object.entries(cfg.digits).map(([d, t]) => `<span><i style="background:${cfg.digitColors[d]}"></i><b>${d}x</b> ${esc(t)}</span>`).join('')}</div>`);
    return;
  }
  // quiz modes
  let queue = shuffle(mode === 'code' ? codeList.slice() : regions.slice()); let pos = 0, right = 0, wrong = 0;
  const header = `<div class="stat"><span id="qpos"></span><span id="qscore"></span></div><div class="qhead" id="qprompt"></div><div id="map"></div><div class="qfeed" id="qfeed"></div><div id="qextra"></div><p style="text-align:center"><button class="btn primary" id="qnext" hidden>Next →</button></p>`;
  box.innerHTML = header;
  renderMap(cfg, $('#map'), (mode === 'code' || mode === 'rev') ? (r => r.abbr) : null).then(mp => {
    const ask = () => {
      if (pos >= queue.length) { $('#qprompt').textContent = `Done: ${right} right, ${wrong} wrong`; $('#qfeed').innerHTML = '<button class="btn primary" id="again">Again</button>'; $('#again').onclick = () => startQuiz(cfg, mode, tips); return; }
      mp.all().forEach(el => { el.classList.remove('ok', 'bad', 'target'); el.onclick = null; });
      $('#qfeed').textContent = ''; $('#qextra').innerHTML = ''; $('#qnext').hidden = true;
      $('#qpos').textContent = `${pos + 1} / ${queue.length}`; $('#qscore').textContent = `✓ ${right} ✗ ${wrong}`;
      const cur = queue[pos];
      const finish = (ok, targetId, extra) => {
        if (ok) right++; else wrong++;
        $('#qfeed').innerHTML = ok ? '<span class="ok-t">Correct!</span>' : `<span class="bad-t">Wrong – it's ${esc(byId[targetId].name)}</span>`;
        mp.mark(byId[targetId], 'ok');
        if (extra) $('#qextra').innerHTML = extra;
        $('#qnext').hidden = false; $('#qnext').onclick = () => { pos++; ask(); };
      };
      if (mode === 'code' || mode === 'find') {
        const targetId = mode === 'code' ? cur.rid : cur.id;
        $('#qprompt').innerHTML = mode === 'code' ? `Where is phone code <b>${esc(cur.code)}</b>?` : `Where is <b>${esc(cur.name)}</b>?`;
        mp.all().forEach(el => el.onclick = () => {
          const ok = el.dataset.rid === targetId; if (!ok) mp.mark(byId[el.dataset.rid], 'bad');
          const r = byId[targetId];
          finish(ok, targetId, mode === 'code' ? `<div class="card"><b>${esc(cur.code)}</b> = ${esc(r.name)} – ${esc(cur.note)}<br>all codes of ${esc(r.abbr)}: ${r.codes.map(c => c.code).join(', ')}${cur.img ? `<div style="margin-top:.4rem;text-align:center">${IMG(cur.img)}</div>` : ''}</div>` : (tips[targetId] || []).slice(0, 3).map(t => `<div class="tip compact">${t.img ? `<div>${IMG(t.img)}</div>` : '<div></div>'}<div class="txt">${t.html}</div></div>`).join(''));
        });
      } else { // name / rev: region highlighted → choose
        mp.mark(cur, 'target');
        const correct = mode === 'rev' ? cur.codes.map(c => c.code).join(', ') : cur.name;
        const pool = regions.filter(r => r !== cur).map(r => mode === 'rev' ? r.codes.map(c => c.code).join(', ') : r.name);
        const opts = shuffle([correct, ...shuffle(pool).slice(0, 3)]);
        $('#qprompt').innerHTML = mode === 'rev' ? 'Which phone codes belong to the highlighted state?' : 'Which region is highlighted?';
        $('#qextra').innerHTML = `<div class="fc"><div class="choices">${opts.map(o => `<button data-o="${esc(o)}">${esc(o)}</button>`).join('')}</div></div>`;
        $('#qextra').querySelectorAll('[data-o]').forEach(b => b.onclick = () => {
          const ok = b.dataset.o === correct; $('#qextra').querySelectorAll('[data-o]').forEach(x => { x.disabled = true; if (x.dataset.o === correct) x.classList.add('ok'); }); if (!ok) b.classList.add('bad');
          if (ok) right++; else wrong++;
          $('#qfeed').innerHTML = ok ? '<span class="ok-t">Correct!</span>' : `<span class="bad-t">Wrong – ${esc(cur.name)}: ${esc(correct)}</span>`;
          mp.mark(cur, 'target', false); mp.mark(cur, 'ok');
          $('#qnext').hidden = false; $('#qnext').onclick = () => { pos++; ask(); };
        });
      }
    };
    ask();
  });
}
