/* GeoStudy – personal GeoGuessr study site. Vanilla JS, hash router. */
'use strict';
const G = { index: null, cache: {}, decks: null, curated: {} };
const $ = (s, el = document) => el.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const IMG = (src, cls = '', alt = '') => src ? `<img src="${esc(src)}" class="${cls}" alt="${esc(alt)}" loading="lazy" referrerpolicy="no-referrer" decoding="async" onerror="this.classList.add('broken')">` : '';
const contSlug = c => c.toLowerCase().replace(/\s+/g, '-');
const contName = s => (G.index.continents.find(c => contSlug(c) === s) || s);

async function getJSON(path) {
  if (G.cache[path]) return G.cache[path];
  const r = await fetch(path);
  if (!r.ok) throw new Error(path + ' ' + r.status);
  return (G.cache[path] = await r.json());
}
const country = slug => getJSON(`data/countries/${slug}.json`);
const findC = slug => G.index.countries.find(c => c.slug === slug);
const flagOf = c => c.flag || (c.code && c.code.length === 2 ? `https://flagcdn.com/w80/${c.code.toLowerCase()}.png` : '');

/* ------------------------------------------------------------ router */
const routes = [];
function route(re, fn) { routes.push([re, fn]); }
async function render() {
  const hash = location.hash || '#/';
  const [path, qs] = hash.slice(1).split('?');
  const q = Object.fromEntries(new URLSearchParams(qs || ''));
  const app = $('#app');
  $('#nav').classList.remove('open');
  document.querySelectorAll('.nav a').forEach(a => a.classList.toggle('active', a.getAttribute('href') === '#' + path.split('/').slice(0, 2).join('/')));
  for (const [re, fn] of routes) {
    const m = path.match(re);
    if (m) {
      app.innerHTML = '<div class="loading">Loading…</div>';
      try { await fn(app, m, q); } catch (e) { app.innerHTML = `<div class="card">Error: ${esc(e.message)}</div>`; console.error(e); }
      if (!q.keep) window.scrollTo(0, 0);
      return;
    }
  }
  app.innerHTML = '<div class="card">Not found. <a href="#/">Home</a></div>';
}
window.addEventListener('hashchange', render);

/* ------------------------------------------------------------ home: world map */
route(/^\/$/, async app => {
  const idx = G.index;
  app.innerHTML = `
    <p class="muted small">Personal GeoGuessr study notes compiled from plonkit.net (text), learnablemeta.com (pictures + metas) and geomastr.com (bollards, plates, signs). Click a country on the map or use search.</p>
    <div class="mapwrap" id="mapwrap"><div class="loading">Loading map…</div><div class="maptip" id="maptip"></div>
      <div class="mapctl"><button id="zin">+</button><button id="zout">−</button><button id="zreset" title="reset">⟲</button></div></div>
    <div class="legend"><span><i style="background:#2f855a"></i>Guide available</span><span><i style="background:#334155"></i>No guide (not in GeoGuessr or not covered)</span><span class="kbd">Drag to pan · pinch/wheel to zoom</span></div>
    <h2>Continents</h2>
    <div class="chips">${idx.continents.map(c => `<a class="chip" href="#/continent/${contSlug(c)}">${c} <span class="muted">(${idx.countries.filter(x => x.continents.includes(c)).length})</span></a>`).join('')}</div>
    <h2>Start here</h2>
    <div class="grid">
      <a class="card" href="#/topic/bollards?c=europe"><b>🟥 European bollards</b><br><span class="muted small">Every country side by side, with notes on look-alikes.</span></a>
      <a class="card" href="#/confusables"><b>🤔 Confusables</b><br><span class="muted small">Poland vs Turkey vs Australia bollards, and other classic mix-ups.</span></a>
      <a class="card" href="#/quiz/brazil-ddd"><b>🇧🇷 Brazil phone codes (DDD)</b><br><span class="muted small">Blank map quiz: where is code 31?</span></a>
      <a class="card" href="#/quiz/us-states"><b>🇺🇸 US states</b><br><span class="muted small">Map quiz + state clues.</span></a>
      <a class="card" href="#/decks"><b>🃏 Flashcards</b><br><span class="muted small">Image → country decks with spaced repetition.</span></a>
      <a class="card" href="#/topics"><b>📚 Topics</b><br><span class="muted small">Bollards, plates, poles, road lines, signs, languages, cars, landscape.</span></a>
    </div>`;
  const svg = await (await fetch('assets/world.svg')).text();
  const wrap = $('#mapwrap');
  wrap.insertAdjacentHTML('afterbegin', svg);
  wrap.querySelector('.loading')?.remove();
  initWorldMap(wrap.querySelector('svg'));
});

function initWorldMap(svg) {
  const byCode = {};
  G.index.countries.forEach(c => { if (c.code && c.code.length === 2) byCode[c.code.toLowerCase()] = c; });
  // extra: territories without own 2-letter code in map → map to guides
  const extra = { 'us-hi': 'hawaii', 'us-ak': 'alaska' };
  svg.querySelectorAll('[class]').forEach(el => {
    const cls = (el.getAttribute('class') || '').split(/\s+/);
    const cc = cls.find(k => /^[a-z]{2}$/.test(k) && byCode[k]);
    if (cc) { el.classList.add('has'); el.dataset.cc = cc; }
  });
  const tip = $('#maptip');
  const codeOf = el => { while (el && el !== svg) { if (el.dataset && el.dataset.cc) return el.dataset.cc; el = el.parentNode; } return null; };
  svg.addEventListener('mousemove', e => {
    const cc = codeOf(e.target);
    if (!cc) { tip.style.display = 'none'; return; }
    const c = byCode[cc]; tip.textContent = c.name; tip.style.display = 'block';
    const r = svg.parentNode.getBoundingClientRect(); tip.style.left = (e.clientX - r.left + 12) + 'px'; tip.style.top = (e.clientY - r.top + 12) + 'px';
  });
  svg.addEventListener('mouseleave', () => tip.style.display = 'none');
  let moved = false;
  svg.addEventListener('click', e => { if (moved) return; const cc = codeOf(e.target); if (cc) location.hash = '#/country/' + byCode[cc].slug; });
  // pan / zoom
  const vb0 = [0, 0, 2754, 1398]; let vb = vb0.slice();
  const apply = () => svg.setAttribute('viewBox', vb.join(' '));
  const zoom = (f, cx, cy) => { const r = svg.getBoundingClientRect(); const px = vb[0] + (cx - r.left) / r.width * vb[2], py = vb[1] + (cy - r.top) / r.height * vb[3];
    const nw = Math.min(vb0[2], Math.max(200, vb[2] * f)), nh = nw * vb0[3] / vb0[2];
    vb = [px - (px - vb[0]) * nw / vb[2], py - (py - vb[1]) * nh / vb[3], nw, nh]; apply(); };
  svg.addEventListener('wheel', e => { e.preventDefault(); zoom(e.deltaY > 0 ? 1.2 : 1 / 1.2, e.clientX, e.clientY); }, { passive: false });
  $('#zin').onclick = () => { const r = svg.getBoundingClientRect(); zoom(1 / 1.5, r.left + r.width / 2, r.top + r.height / 2); };
  $('#zout').onclick = () => { const r = svg.getBoundingClientRect(); zoom(1.5, r.left + r.width / 2, r.top + r.height / 2); };
  $('#zreset').onclick = () => { vb = vb0.slice(); apply(); };
  const pts = new Map(); let last = null, dist0 = 0;
  svg.addEventListener('pointerdown', e => { pts.set(e.pointerId, [e.clientX, e.clientY]); last = [e.clientX, e.clientY]; moved = false; svg.setPointerCapture(e.pointerId); });
  svg.addEventListener('pointermove', e => {
    if (!pts.has(e.pointerId)) return; pts.set(e.pointerId, [e.clientX, e.clientY]);
    const r = svg.getBoundingClientRect();
    if (pts.size === 2) { const [a, b] = [...pts.values()]; const d = Math.hypot(a[0] - b[0], a[1] - b[1]); if (dist0) zoom(dist0 / d, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2); dist0 = d; return; }
    if (!last) return; const dx = (e.clientX - last[0]) / r.width * vb[2], dy = (e.clientY - last[1]) / r.height * vb[3];
    if (Math.abs(e.clientX - last[0]) + Math.abs(e.clientY - last[1]) > 3) moved = true;
    vb[0] -= dx; vb[1] -= dy; last = [e.clientX, e.clientY]; apply();
  });
  const up = e => { pts.delete(e.pointerId); last = null; dist0 = 0; setTimeout(() => moved = false, 50); };
  svg.addEventListener('pointerup', up); svg.addEventListener('pointercancel', up);
}

/* ------------------------------------------------------------ continents */
const countryCard = c => `<a class="ccard ${c.hasGuide ? '' : 'dim'}" href="#/country/${c.slug}">${IMG(flagOf(c))}<div><div>${esc(c.name)}</div><div class="meta">${c.phone ? esc(c.phone) + ' · ' : ''}${c.drive ? 'drives ' + c.drive.toLowerCase() : ''}${c.tips ? ' · ' + c.tips + ' tips' : ''}</div></div></a>`;
route(/^\/continents$/, async app => {
  app.innerHTML = '<h1>Continents</h1>' + G.index.continents.map(c => {
    const cs = G.index.countries.filter(x => x.continents.includes(c)).sort((a, b) => a.name.localeCompare(b.name));
    return `<h2><a href="#/continent/${contSlug(c)}">${c}</a> <span class="muted small">${cs.length}</span></h2><div class="grid narrow">${cs.map(countryCard).join('')}</div>`;
  }).join('');
});
route(/^\/continent\/([a-z-]+)$/, async (app, m) => {
  const cont = contName(m[1]);
  const cs = G.index.countries.filter(x => x.continents.includes(cont)).sort((a, b) => a.name.localeCompare(b.name));
  const cs2 = m[1];
  app.innerHTML = `<h1>${esc(cont)}</h1>
  <div class="chips">
    <a class="chip" href="#/topic/bollards?c=${cs2}">Bollards</a><a class="chip" href="#/topic/plates?c=${cs2}">Plates</a><a class="chip" href="#/topic/poles?c=${cs2}">Poles</a>
    <a class="chip" href="#/topic/road-lines?c=${cs2}">Road lines</a><a class="chip" href="#/topic/signs?c=${cs2}">Signs</a><a class="chip" href="#/topic/language?c=${cs2}">Languages</a>
    <a class="chip" href="#/topic/cars?c=${cs2}">Google cars</a><a class="chip" href="#/topic/landscape?c=${cs2}">Landscape</a><a class="chip" href="#/topic/phone?c=${cs2}">Phone codes</a>
    <a class="chip" href="#/decks?g=${encodeURIComponent(cont)}">🃏 Flashcards for ${esc(cont)}</a>
  </div>
  <h2>Quick table</h2>
  <div class="card" style="overflow:auto"><table class="table"><tr><th></th><th>Country</th><th>Phone</th><th>Drives</th><th>Guide</th></tr>
  ${cs.map(c => `<tr><td>${IMG(flagOf(c), 'flag')}</td><td><a href="#/country/${c.slug}">${esc(c.name)}</a></td><td>${esc(c.phone || '')}</td><td>${esc(c.drive || '')}</td><td class="muted small">${c.tips ? c.tips + ' tips' : '—'}${c.metas ? ', ' + c.metas + ' metas' : ''}</td></tr>`).join('')}
  </table></div>
  <h2>Countries</h2><div class="grid narrow">${cs.map(countryCard).join('')}</div>`;
});

/* ------------------------------------------------------------ country page */
const tipHTML = (t, slug) => `<div class="tip ${t.img ? '' : 'noimg'}">${t.img ? `<div>${IMG(t.img)}${t.imgs && t.imgs.length > 1 ? `<div class="imgrow" style="margin-top:.3rem">${t.imgs.slice(1).map(i => IMG(i, 'small')).join('')}</div>` : ''}</div>` : ''}<div class="txt">${t.html || ''}<div class="src">${t.link ? `<a href="${esc(t.link)}" target="_blank" rel="noopener">📍 Street View</a> · ` : ''}${t.img ? '' : `<span title="plonkit does not allow embedding its pictures; this one had no learnablemeta copy">📷 picture only on <a href="https://www.plonkit.net/${slug || ''}" target="_blank" rel="noopener">plonkit</a></span>`}</div></div></div>`;
const metaHTML = m => `<div class="meta-item"><b>${esc(m.name)}</b> <span class="muted small">· ${esc(m.map)}</span><div class="note">${m.note || ''}</div><div class="imgs">${(m.images || []).map(i => IMG(i)).join('')}</div></div>`;
function stepsHTML(steps, open, slug) {
  return steps.map((s, i) => {
    if (s.kind === 'map') return `<details><summary>${esc(s.title)}</summary><div class="body">${s.html}</div></details>`;
    const body = s.items.map(it => {
      if (it.k === 'tip') return tipHTML(it, slug);
      if (it.k === 'h') return `<h3 class="subh">${esc(it.title)}</h3>`;
      if (it.k === 'img') return it.img || it.html ? `<div class="card" style="text-align:center">${IMG(it.img)}${it.html ? `<div class="small">${it.html}</div>` : ''}${it.img ? '' : `<div class="muted small">🖼 infographic – see <a href="https://www.plonkit.net/${slug}" target="_blank" rel="noopener">plonkit</a></div>`}</div>` : '';
      if (it.k === 'text') return `<div class="card">${it.html}</div>`;
      return '';
    }).join('');
    return `<details id="step${i}" ${open || i === 0 ? 'open' : ''}><summary>${esc(s.title)} <span class="muted small">(${s.items.filter(x => x.k === 'tip').length} tips)</span></summary><div class="body">${body}</div></details>`;
  }).join('');
}
route(/^\/country\/([a-z0-9-]+)$/, async (app, m) => {
  const c = await country(m[1]); const q = c.gm || {};
  const signs = q.signs || {};
  const lmByMap = {};
  (c.lm || []).forEach(x => (lmByMap[x.map] = lmByMap[x.map] || []).push(x));
  const regional = c.steps.filter(s => s.kind === 'tips' && /regional|region-|province|state/i.test(s.title || ''));
  const decks = (G.decks || []).filter(d => d.id === 'pk-top-' + c.slug || d.id === 'pk-' + c.slug || (d.id.startsWith('lm-') && (c.lm || []).some(x => x.map === d.title)));
  const cur = (G.curated.confusables || []).filter(x => x.countries.includes(c.slug));
  app.innerHTML = `
  ${c.hero ? `<div class="hero">${IMG(c.hero)}<div class="ht">${IMG(flagOf(c), 'flag')}<h1>${esc(c.name)}</h1></div></div>` : `<h1>${IMG(flagOf(c), 'flag')} ${esc(c.name)}</h1>`}
  <div class="subnav"><a href="#facts">Facts</a><a href="#top">Top clues</a><a href="#ref">Quick reference</a><a href="#guide">Full guide</a>${regional.length ? '<a href="#regional">Regional</a>' : ''}${c.lm.length ? '<a href="#metas">Metas</a>' : ''}<a href="#practice">Practice</a></div>
  <div class="chips">${c.continents.map(x => `<a class="chip" href="#/continent/${contSlug(x)}">${esc(x)}</a>`).join('')}${cur.length ? `<a class="chip" href="#/confusables">🤔 ${cur.length} confusable group(s)</a>` : ''}</div>
  <h2 id="facts">Facts</h2>
  <div class="facts">
    <div class="fact"><div class="k">Phone code</div><div class="v">${esc(c.phone || '?')}</div></div>
    <div class="fact"><div class="k">Driving side</div><div class="v">${esc(c.drive || '?')}</div></div>
    <div class="fact"><div class="k">Road lines</div><div class="v" style="font-size:.95rem">${esc(q.road_lines || '—')}</div></div>
    <div class="fact"><div class="k">Script / language</div><div class="v" style="font-size:.95rem">${esc(q.alphabet?.script || '—')}<br><span class="muted small">${esc(q.alphabet?.languages || '')}</span></div></div>
    <div class="fact"><div class="k">ISO</div><div class="v">${esc(c.code || '')}</div></div>
    <div class="fact"><div class="k">Guide updated</div><div class="v" style="font-size:.95rem">${esc(c.updated || '—')}</div></div>
  </div>
  ${q.alphabet?.img ? `<div class="imgrow">${IMG(q.alphabet.img, 'alpha')}</div>` : ''}
  <h2 id="top">Top clues</h2>
  <p class="muted small">The first tips of the plonkit "Identifying" step – these are the things to learn first.</p>
  ${c.top.length ? c.top.map(t => tipHTML(t, c.slug)).join('') : '<p class="muted">No plonkit guide for this country.</p>'}
  <h2 id="ref">Quick reference</h2>
  ${c.gm ? `<div class="grid">
    <div class="card"><h3>Bollards</h3><div class="imgrow">${(q.bollards || []).map(i => IMG(i)).join('') || '<span class="muted">none listed</span>'}</div><div class="small muted">${esc(q.bollards_note || '')}</div></div>
    <div class="card"><h3>License plates</h3><div class="imgrow">${(q.plates || []).map(i => IMG(i)).join('') || '<span class="muted">none</span>'}</div><div class="small muted">${esc(q.plates_note || '')}</div></div>
    <div class="card"><h3>Road signs</h3><div class="imgrow">${['stop', 'yield', 'pedestrian', 'chevron', 'bend', 'roundabout'].map(k => (signs[k] || []).map(i => IMG(i, 'sign', k)).join('')).join('')}</div><div class="small muted">stop · yield · pedestrian · chevron · bend · roundabout</div></div>
    <div class="card"><h3>Fuel &amp; post</h3><div class="small">${(q.fuel || []).map(esc).join(', ') || '—'}</div>${q.post ? `<div class="imgrow" style="margin-top:.4rem">${IMG(q.post, 'small')}</div>` : ''}</div>
  </div>` : '<p class="muted">No geomastr data.</p>'}
  <h2 id="guide">Full guide <span class="muted small">(plonkit)</span></h2>
  ${c.steps.length ? stepsHTML(c.steps, false, c.slug) : '<p class="muted">No guide.</p>'}
  ${regional.length ? `<h2 id="regional">Regional clues</h2><p class="muted small">Same content as in the full guide, kept open for region-guessing practice.</p>${stepsHTML(regional, true, c.slug)}` : ''}
  ${c.lm.length ? `<h2 id="metas">Metas from learnablemeta <span class="muted small">(${c.lm.length})</span></h2>${Object.entries(lmByMap).map(([k, v]) => `<details><summary>${esc(k)} <span class="muted small">(${v.length})</span></summary><div class="body">${v.map(metaHTML).join('')}</div></details>`).join('')}` : ''}
  <h2 id="practice">Practice</h2>
  <div class="card">${decks.length ? decks.map(d => deckRow(d)).join('') : '<span class="muted">No decks.</span>'}</div>
  ${c.docs?.length ? `<h3>Community docs</h3><ul>${c.docs.filter(d => d.url).map(d => `<li><a href="${esc(d.url)}" target="_blank" rel="noopener">${esc(d.title)}</a></li>`).join('')}</ul>` : ''}
  <p class="muted small">Sources: <a href="https://www.plonkit.net/${c.slug}" target="_blank" rel="noopener">plonkit.net/${c.slug}</a>${c.gm ? ` · <a href="https://geomastr.com/country/${c.slug}/" target="_blank" rel="noopener">geomastr</a>` : ''} · learnablemeta.com</p>`;
  // lazy-load details bodies for very long pages: nothing needed, images are lazy
  wireAnchors(app);
});
function wireAnchors(app) {
  app.querySelectorAll('.subnav a[href^="#"]').forEach(a => a.onclick = e => { e.preventDefault(); const el = document.getElementById(a.getAttribute('href').slice(1)); if (el) { const y = el.getBoundingClientRect().top + window.scrollY - 100; window.scrollTo({ top: y, behavior: 'smooth' }); } });
}

/* ------------------------------------------------------------ topics */
const TOPICS = { bollards: 'Bollards', plates: 'License plates', poles: 'Poles & insulators', 'road-lines': 'Road lines', signs: 'Road signs & guardrails', language: 'Languages & alphabets', cars: 'Google cars & coverage', landscape: 'Landscape & vegetation', phone: 'Phone / area codes' };
route(/^\/topics$/, async app => {
  app.innerHTML = `<h1>Topics</h1><p class="muted small">Each topic shows, per continent, every country's relevant images and plonkit tips side by side.</p><div class="grid">${Object.entries(TOPICS).map(([k, v]) => `<a class="card" href="#/topic/${k}?c=europe"><b>${v}</b></a>`).join('')}
  <a class="card" href="#/confusables"><b>Confusables</b><br><span class="muted small">Hand-picked look-alikes.</span></a></div>`;
});
route(/^\/topic\/([a-z-]+)$/, async (app, m, q) => {
  const tid = m[1]; const data = await getJSON(`data/topics/${tid}.json`);
  const csl = q.c || 'europe'; const cont = contName(csl);
  const rows = data.filter(e => e.continents.includes(cont)).sort((a, b) => a.name.localeCompare(b.name));
  const cur = (G.curated.confusables || []).filter(x => x.topic === tid && rows.some(r => x.countries.includes(r.slug)));
  app.innerHTML = `<h1>${esc(TOPICS[tid] || tid)} – ${esc(cont)}</h1>
  <div class="chips">${G.index.continents.map(c => `<a class="chip ${contSlug(c) === csl ? 'active' : ''}" href="#/topic/${tid}?c=${contSlug(c)}">${c}</a>`).join('')}</div>
  <div class="chips">${Object.keys(TOPICS).map(k => `<a class="chip ${k === tid ? 'active' : ''}" href="#/topic/${k}?c=${csl}">${TOPICS[k]}</a>`).join('')}</div>
  ${cur.length ? `<h2>Look-alikes in this topic</h2>${cur.map(confHTML).join('')}` : ''}
  <div class="chips">${rows.map(r => `<a class="chip" href="#c-${r.slug}">${esc(r.name)}</a>`).join('')}</div>
  ${rows.map(r => `<div class="card" id="c-${r.slug}"><h3>${IMG(r.flag, 'flag')} <a href="#/country/${r.slug}">${esc(r.name)}</a> ${tid === 'phone' ? `<span class="muted">${esc(r.phone || '')}</span>` : ''}${tid === 'road-lines' && r.gm_note ? `<span class="muted small"> · ${esc(r.gm_note)}</span>` : ''}</h3>
    ${r.gm_imgs?.length ? `<div class="imgrow">${r.gm_imgs.map(i => IMG(i, tid === 'signs' ? 'sign' : '')).join('')}</div>` : ''}
    ${r.gm_note && tid !== 'road-lines' ? `<div class="small muted">${esc(r.gm_note)}</div>` : ''}
    ${r.tips.map(t => `<div class="tip compact">${t.img ? `<div>${IMG(t.img)}</div>` : '<div></div>'}<div class="txt">${t.html}<div class="src">${esc(t.step)}</div></div></div>`).join('')}
  </div>`).join('') || '<p class="muted">Nothing for this continent.</p>'}`;
  app.querySelectorAll('a[href^="#c-"]').forEach(a => a.onclick = e => { e.preventDefault(); document.getElementById(a.getAttribute('href').slice(1))?.scrollIntoView({ behavior: 'smooth', block: 'start' }); });
});

/* ------------------------------------------------------------ confusables (curated) */
function confHTML(g) {
  return `<div class="card"><h3>${esc(g.title)}</h3><p class="small">${g.intro || ''}</p><div class="cmp">${g.items.map(it => { const c = findC(it.slug); return `<div class="c">${IMG(it.img)}<div class="n"><a href="#/country/${it.slug}">${esc(c ? c.name : it.slug)}</a></div><div class="d">${it.note}</div></div>`; }).join('')}</div>${g.tip ? `<p class="small">💡 ${g.tip}</p>` : ''}</div>`;
}
route(/^\/confusables$/, async app => {
  const list = G.curated.confusables || [];
  const topics = [...new Set(list.map(x => x.topic))];
  app.innerHTML = `<h1>Confusables</h1><p class="muted small">Things that look alike and how to tell them apart. Hand-written from plonkit / learnablemeta notes; the pictures are the real ones from those guides.</p>
  <div class="chips">${topics.map(t => `<a class="chip" href="#t-${t}">${esc(TOPICS[t] || t)}</a>`).join('')}</div>
  ${topics.map(t => `<h2 id="t-${t}">${esc(TOPICS[t] || t)}</h2>${list.filter(x => x.topic === t).map(confHTML).join('')}`).join('')}`;
  app.querySelectorAll('a[href^="#t-"]').forEach(a => a.onclick = e => { e.preventDefault(); document.getElementById(a.getAttribute('href').slice(1))?.scrollIntoView({ behavior: 'smooth' }); });
});

/* ------------------------------------------------------------ search */
function initSearch() {
  const inp = $('#search'), box = $('#search-results'); let items = [], active = -1;
  const run = () => {
    const v = inp.value.trim().toLowerCase(); if (v.length < 1) { box.hidden = true; return; }
    items = [];
    G.index.countries.filter(c => c.name.toLowerCase().includes(v) || (c.code || '').toLowerCase() === v).slice(0, 8).forEach(c => items.push({ h: '#/country/' + c.slug, t: c.name, k: 'country', img: flagOf(c) }));
    Object.entries(TOPICS).filter(([k, t]) => t.toLowerCase().includes(v)).forEach(([k, t]) => items.push({ h: '#/topic/' + k + '?c=europe', t, k: 'topic' }));
    (G.decks || []).filter(d => d.title.toLowerCase().includes(v)).slice(0, 8).forEach(d => items.push({ h: '#/deck/' + d.id, t: d.title, k: 'deck · ' + d.count }));
    box.innerHTML = items.map(i => `<a href="${i.h}">${i.img ? IMG(i.img) : ''}${esc(i.t)}<span class="kind">${esc(i.k)}</span></a>`).join('') || '<a>No results</a>';
    box.hidden = false; active = -1;
  };
  inp.addEventListener('input', run);
  inp.addEventListener('focus', run);
  inp.addEventListener('keydown', e => {
    const as = box.querySelectorAll('a');
    if (e.key === 'ArrowDown') { active = Math.min(as.length - 1, active + 1); } else if (e.key === 'ArrowUp') { active = Math.max(0, active - 1); }
    else if (e.key === 'Enter') { const a = as[active >= 0 ? active : 0]; if (a && a.getAttribute('href')) { location.hash = a.getAttribute('href'); box.hidden = true; inp.blur(); } return; }
    else if (e.key === 'Escape') { box.hidden = true; return; } else return;
    as.forEach((a, i) => a.classList.toggle('active', i === active)); e.preventDefault();
  });
  document.addEventListener('click', e => { if (!e.target.closest('.search-wrap')) box.hidden = true; });
  box.addEventListener('click', () => { box.hidden = true; inp.value = ''; });
}

/* ------------------------------------------------------------ lightbox */
document.addEventListener('click', e => {
  const img = e.target.closest('img');
  if (!img || img.closest('.ccard') || img.classList.contains('flag') || img.closest('.lightbox') || img.closest('.search-results')) return;
  const lb = $('#lightbox'); lb.querySelector('img').src = img.src; lb.querySelector('.lb-cap').innerHTML = img.closest('.tip')?.querySelector('.txt')?.innerHTML || img.closest('.meta-item')?.querySelector('.note')?.innerHTML || img.alt || ''; lb.hidden = false;
});
$('#lightbox').addEventListener('click', e => { if (!e.target.closest('a')) $('#lightbox').hidden = true; });
document.addEventListener('keydown', e => { if (e.key === 'Escape') $('#lightbox').hidden = true; });
$('#menu-btn').onclick = () => $('#nav').classList.toggle('open');

/* ------------------------------------------------------------ boot */
(async function boot() {
  G.index = await getJSON('data/index.json');
  G.decks = await getJSON('data/decks/index.json');
  for (const k of ['confusables', 'brazil_ddd', 'us_states', 'indonesia', 'australia']) { try { G.curated[k] = await getJSON(`data/curated/${k}.json`); } catch (e) { G.curated[k] = null; } }
  initSearch();
  render();
})();
