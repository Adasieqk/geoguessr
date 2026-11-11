#!/usr/bin/env python3
"""Normalise raw scraped data (see scrape.py) into the JSON files the site loads.

Usage: python3 scripts/build_data.py RAW_DIR [OUT_DIR=data]
"""
import collections, glob, html, json, os, re, sys, urllib.parse

RAW = sys.argv[1]
OUT = sys.argv[2] if len(sys.argv) > 2 else os.path.join(os.path.dirname(__file__), '..', 'data')
PLONKIT = 'https://www.plonkit.net'
GEOMASTR = 'https://geomastr.com'
CONTINENTS = ['Europe', 'North America', 'South America', 'Asia', 'Africa', 'Oceania', 'Antarctica']

GM_SLUG_FIX = {'czech-republic': 'czechia', 'israel': 'israel-west-bank'}
# learnablemeta name prefixes that are not country names -> guide slug
LM_ALIAS = {
    'United States': 'united-states', 'USA': 'united-states', 'United States of America': 'united-states',
    'Estados Unidos': 'united-states', 'US': 'united-states',
    'UK': 'united-kingdom', 'Czech Republic': 'czechia', 'Israel': 'israel-west-bank', 'West Bank': 'israel-west-bank',
    'Sumatra': 'indonesia', 'Java': 'indonesia', 'Sulawesi': 'indonesia', 'Kalimantan': 'indonesia', 'Nusas': 'indonesia',
    'Nusa Tenggara': 'indonesia', 'Papua': 'indonesia', 'Bali': 'indonesia', 'Maluku': 'indonesia',
    'Ontario': 'canada', 'Québec': 'canada', 'Quebec': 'canada', 'British Columbia': 'canada', 'Alberta': 'canada',
    'Saskatchewan': 'canada', 'Manitoba': 'canada', 'Nova Scotia': 'canada', 'New Brunswick': 'canada',
    'Newfoundland': 'canada', 'Yukon': 'canada', 'PEI': 'canada', 'Prince Edward Island': 'canada',
    'Reunion': 'reunion', 'Réunion': 'reunion', 'Macao': 'macau', 'Turkiye': 'turkey', 'Türkiye': 'turkey',
    'Eswatini': 'eswatini', 'Swaziland': 'eswatini', 'North Macedonia': 'north-macedonia', 'Macedonia': 'north-macedonia',
    'Russian Federation': 'russia', 'Northern Ireland': 'united-kingdom', 'Scotland': 'united-kingdom',
    'Wales': 'united-kingdom', 'England': 'united-kingdom',
}

def md(text):
    """Tiny markdown -> HTML for plonkit tip text (list of paragraphs)."""
    if isinstance(text, str): text = [text]
    out = []; in_list = False
    for para in text:
        for line in para.split('\n'):
            s = line.strip()
            if not s: continue
            is_li = s.startswith('- ') or s.startswith('* ')
            if is_li: s = s[2:]
            h = html.escape(s, quote=False)
            h = re.sub(r'\*\*(.+?)\*\*', r'<b>\1</b>', h)
            h = re.sub(r'\[([^\]]+)\]\((https?://[^)\s]+)\)', r'<a href="\2" target="_blank" rel="noopener">\1</a>', h)
            h = re.sub(r'\[([^\]]+)\]\((/[^)\s]+)\)', lambda m: '<a href="%s" target="_blank" rel="noopener">%s</a>' % (PLONKIT + m.group(2), m.group(1)), h)
            if is_li:
                if not in_list: out.append('<ul>'); in_list = True
                out.append('<li>%s</li>' % h)
            else:
                if in_list: out.append('</ul>'); in_list = False
                out.append('<p>%s</p>' % h)
    if in_list: out.append('</ul>')
    return ''.join(out)

def purl(u):
    if not u: return None
    if u.startswith('http'): return u
    return PLONKIT + urllib.parse.quote(u)

def clean(t):
    return html.unescape(re.sub(r'\s+', ' ', re.sub('<[^>]+>', '', t))).strip()

# ---------------------------------------------------------------- plonkit
guides = {}
for f in glob.glob(os.path.join(RAW, 'plonkit', '*.json')):
    d = json.load(open(f))['data']; p = d['public']
    if p['slug'] in ('middle-earth',): continue
    steps = []
    for s in p['steps']:
        if s.get('kind') == 'map':
            steps.append({'kind': 'map', 'title': s.get('title'), 'html': md(s.get('text', []))}); continue
        items = []
        for it in s.get('items', []):
            k = it.get('kind'); dd = it.get('data') if isinstance(it.get('data'), dict) else {}
            if k == 'tip':
                img = dd.get('image') or {}
                items.append({'k': 'tip', 'img': purl(img.get('imageUrl')), 'link': img.get('imageLink') if str(img.get('imageLink', '')).startswith('http') else None,
                              'html': md(dd.get('text', [])), 'raw': ' '.join(dd.get('text', []))})
            elif k in ('divider', 'subsection'):
                items.append({'k': 'h', 'title': it.get('title', '')})
            elif k == 'centeredImage':
                items.append({'k': 'img', 'img': purl(it.get('imageUrl'))})
            elif k == 'centeredImageWithCaption':
                items.append({'k': 'img', 'img': purl((it.get('image') or {}).get('imageUrl')), 'html': md(it.get('text', ''))})
            elif k in ('text', 'centeredText', 'notes'):
                items.append({'k': 'text', 'html': md(it.get('text', []))})
        steps.append({'kind': 'tips', 'title': s.get('title'), 'items': items})
    guides[p['slug']] = {
        'slug': p['slug'], 'name': p['title'], 'code': p.get('code'), 'continents': p.get('cat', []),
        'hero': purl(p.get('heroImage')), 'updated': p.get('updatedAt', '')[:10], 'steps': steps,
        'docs': [{'title': c.get('title'), 'url': c.get('url') or c.get('link')} for c in d.get('communityDocs', []) if isinstance(c, dict)],
    }
print('plonkit guides', len(guides))

# ---------------------------------------------------------------- geomastr
gm = {}
for f in sorted(glob.glob(os.path.join(RAW, 'gm', 'country__*.html'))):
    slug = os.path.basename(f)[len('country__'):-5]; slug = GM_SLUG_FIX.get(slug, slug)
    h = open(f, encoding='utf-8', errors='ignore').read()
    h = re.sub(r'<(script|style)[^>]*>.*?</\1>', '', h, flags=re.S)
    body = h[h.find('<h1'):]
    name = clean(re.search(r'<h1[^>]*>(.*?)</h1>', body, re.S).group(1))
    secs = {}
    for part in re.split(r'<h[34][^>]*>', body)[1:]:
        m = re.match(r'(.*?)</h[34]>(.*)', part, re.S)
        if not m: continue
        title = clean(m.group(1)); rest = m.group(2)
        imgs = [GEOMASTR + x for x in re.findall(r'<img[^>]+src="([^"]+)"', rest) if 'icons/' not in x and 'logo' not in x]
        texts = [clean(x) for x in re.findall(r'<(?:p|li|td|span)[^>]*>(.*?)</(?:p|li|td|span)>', rest, re.S)]
        secs[title] = {'imgs': imgs, 'texts': [t for t in texts if t and '©' not in t]}
    def sec(prefix):
        for k, v in secs.items():
            if k.startswith(prefix): return v
        return {'imgs': [], 'texts': []}
    alpha = next(((k, v) for k, v in secs.items() if 'Alphabet' in k), (None, {'imgs': [], 'texts': []}))
    alpha_title = alpha[0] or ''
    m = re.match(r'(.*?Alphabet)\s*(.*)', alpha_title)
    gm[slug] = {
        'name': name,
        'alphabet': {'script': m.group(1) if m else alpha_title, 'languages': m.group(2) if m else '', 'img': (alpha[1]['imgs'] or [None])[0]},
        'bollards': sec('Bollards')['imgs'], 'bollards_note': ' '.join(sec('Bollards')['texts']),
        'plates': sec('License Plate')['imgs'], 'plates_note': ' '.join(sec('License Plate')['texts']),
        'fuel': [os.path.basename(x).rsplit('.', 1)[0] for x in sec('Fuel Stations')['imgs']],
        'post': (sec('Post Company')['imgs'] or [None])[0],
        'road_lines': ' / '.join(sec('Road Lines')['texts']),
        'street_names': sec('Street Names')['texts'],
        'signs': {k: sec(t)['imgs'] for k, t in [('bend', 'Bend Sign'), ('chevron', 'Chevron Sign'), ('pedestrian', 'Pedestrian Sign'),
                                                 ('roundabout', 'Roundabouts Sign'), ('stop', 'Stop Sign'), ('yield', 'Yield Sign')]},
        'flag': GEOMASTR + '/assets/media/flags/%s.png' % os.path.basename(f)[len('country__'):-5],
    }
print('geomastr countries', len(gm))
FLAG_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'assets', 'flags')
def local_flag(code):
    if not code: return None
    cc = code.split('-')[0].lower()
    if code.upper() in ('PT-MA', 'PT-AZ'): cc = 'pt'
    return 'assets/flags/%s.svg' % cc if os.path.exists(os.path.join(FLAG_DIR, cc + '.svg')) else None
for slug, q in gm.items():
    lf = local_flag((guides.get(slug) or {}).get('code'))
    if lf: q['flag'] = lf

# driving side + phone code from continent / phone pages (by country name)
drive = {}; phone = {}
for f in glob.glob(os.path.join(RAW, 'gm', 'continent__*.html')):
    h = re.sub(r'<(script|style)[^>]*>.*?</\1>', '', open(f, encoding='utf-8', errors='ignore').read(), flags=re.S)
    for r in re.findall(r'<tr[^>]*>(.*?)</tr>', h, re.S):
        cells = [clean(x) for x in re.findall(r'<td[^>]*>(.*?)</td>', r, re.S)]
        if len(cells) >= 3 and cells[2] in ('Left', 'Right'): drive[cells[1]] = cells[2]
for f in glob.glob(os.path.join(RAW, 'gm', 'phone-numbers__*.html')):
    h = re.sub(r'<(script|style)[^>]*>.*?</\1>', '', open(f, encoding='utf-8', errors='ignore').read(), flags=re.S)
    for slug, name, code in re.findall(r'<a href="/country/([^"]+)/" class="fw-bold[^>]*>([^<]+)</a>.*?<div class="fs-4 fw-bold">\+\s*([\d\s]+)</div>', h, re.S):
        phone[clean(name)] = '+' + re.sub(r'\s+', '', code)
        phone[GM_SLUG_FIX.get(slug, slug)] = phone[clean(name)]
PHONE_FALLBACK = {'alaska': '+1', 'hawaii': '+1', 'united-states': '+1', 'canada': '+1', 'us-virgin-islands': '+1 340', 'northern-mariana-islands': '+1 670',
    'australia': '+61', 'cocos-islands': '+61', 'new-zealand': '+64', 'china': '+86', 'hong-kong': '+852', 'macau': '+853', 'kazakhstan': '+7', 'belarus': '+375',
    'cyprus': '+357', 'liechtenstein': '+423', 'svalbard': '+47', 'azores': '+351', 'madeira': '+351', 'costa-rica': '+506', 'panama': '+507', 'egypt': '+20',
    'iraq': '+964', 'lebanon': '+961', 'oman': '+968', 'pakistan': '+92', 'nepal': '+977', 'mali': '+223', 'namibia': '+264', 'tanzania': '+255',
    'sao-tome-and-principe': '+239', 'reunion': '+262', 'martinique': '+596', 'saint-pierre-and-miquelon': '+508', 'falkland-islands': '+500',
    'pitcairn-islands': '+64', 'british-indian-ocean-territory': '+246', 'south-georgia-sandwich-islands': '+500', 'israel-west-bank': '+972 / +970'}
for k, v in PHONE_FALLBACK.items(): phone.setdefault(k, v)
print('drive', len(drive), 'phone', len(phone))

# ---------------------------------------------------------------- learnablemeta
lm_maps = {m['geoguessrId']: m for m in json.load(open(os.path.join(RAW, 'lm_maps.json')))}
def devalue(data):
    def res(i):
        v = data[i]
        if isinstance(v, dict): return {k: res(j) for k, j in v.items()}
        if isinstance(v, list):
            if v and isinstance(v[0], str) and v[0] == 'list' and isinstance(v[1], list): return [res(j) for j in v[1]]
            return [res(j) for j in v]
        return v
    return res(0)
def clean_note(n):
    n = re.sub(r'<(script|style)[^>]*>.*?</\1>', '', n or '', flags=re.S)
    n = re.sub(r'<a ', '<a target="_blank" rel="noopener" ', n)
    return n.strip()
metas = []
for f in glob.glob(os.path.join(RAW, 'lm_maps', '*.json')):
    mid = os.path.basename(f)[:-5]
    try:
        d = json.load(open(f)); node = [n for n in d['nodes'] if n and n.get('type') == 'data'][0]; root = devalue(node['data'])
    except Exception: continue
    for m in root.get('metaList') or []:
        metas.append({'map': lm_maps[mid]['name'], 'mapId': mid, 'regions': lm_maps[mid].get('regions', []),
                      'name': (m.get('name') or '').strip(), 'note': clean_note(m.get('note')), 'images': m.get('images') or [],
                      'n': m.get('locationsCount')})
print('lm metas', len(metas))

# map meta -> country slug
name_to_slug = {}
for s, g in guides.items():
    name_to_slug[g['name'].lower()] = s
for k, v in LM_ALIAS.items(): name_to_slug[k.lower()] = v
for s in gm:
    name_to_slug.setdefault(gm[s]['name'].lower(), s)
def meta_country(m):
    n = m['name']
    if ' - ' in n:
        pre = n.split(' - ')[0].strip().lower()
        if pre in name_to_slug: return name_to_slug[pre], n.split(' - ', 1)[1].strip()
    # map named after a single country
    mn = m['map'].lower()
    hits = [s for nm, s in name_to_slug.items() if len(nm) > 3 and re.search(r'\b' + re.escape(nm) + r'\b', mn)]
    hits = sorted(set(hits), key=lambda s: -len(guides.get(s, {}).get('name', s)))
    if len(hits) == 1: return hits[0], n
    return None, n
by_country = collections.defaultdict(list); unassigned = 0
seen = set()
for m in metas:
    slug, short = meta_country(m)
    if not slug: unassigned += 1; continue
    key = (slug, short.lower(), (m['images'] or [''])[0])
    if key in seen: continue
    seen.add(key)
    by_country[slug].append({'map': m['map'], 'name': short, 'note': m['note'], 'images': m['images']})
print('metas assigned to', len(by_country), 'countries; unassigned', unassigned)

# ---------------------------------------------------------------- plonkit images are not embeddable (CORP) -> borrow matching learnablemeta images
import difflib
def norm(t):
    t = re.sub(r'<[^>]+>', ' ', t or ''); t = re.sub(r'\[([^\]]+)\]\([^)]*\)', r'\1', t); t = t.replace('**', '')
    t = html.unescape(t).lower(); t = re.sub(r'[^a-z0-9 ]+', ' ', t); return re.sub(r'\s+', ' ', t).strip()
lm_index = collections.defaultdict(list)   # slug -> [(normtext, images, name)]
for slug, lst in by_country.items():
    for m in lst:
        if m['images']: lm_index[slug].append((norm(m['note']), m['images'], m['name']))
ALL_LM = [(norm(m['note']), m['images'], m['name']) for m in metas if m['images']]
match_stats = collections.Counter()
def words(t): return set(w for w in t.split()[:70] if len(w) > 2)
def borrow_images(slug, tip):
    """Return LM image list whose note text matches this plonkit tip text (LM copies plonkit text), else None."""
    t = norm(tip.get('raw', ''))
    if len(t) < 25: match_stats['short'] += 1; return None
    tw = words(t)
    best, bscore = None, 0
    for nt, imgs, name in lm_index.get(slug, []):
        if not nt: continue
        if len(t) >= 60 and (t[:60] in nt or nt[:60] in t): return imgs
        nw = words(nt)
        if not nw: continue
        j = len(tw & nw) / len(tw | nw)
        if j > bscore: best, bscore = imgs, j
    if bscore >= 0.5: return best
    return None
for slug, g in guides.items():
    for st in g['steps']:
        if st['kind'] != 'tips': continue
        for it in st['items']:
            if it['k'] == 'tip':
                imgs = borrow_images(slug, it)
                it['pk_img'] = it['img']
                if imgs: it['img'] = imgs[0]; it['imgs'] = imgs[:3]; match_stats['matched'] += 1
                else:
                    it['img'] = None; q = gm.get(slug) or {}; t = (it.get('raw') or '').lower(); alt = None
                    for kw, get in [('plate', lambda: q.get('plates')), ('bollard', lambda: q.get('bollards')), ('chevron', lambda: q.get('signs', {}).get('chevron')),
                                    ('pedestrian', lambda: q.get('signs', {}).get('pedestrian')), ('stop sign', lambda: q.get('signs', {}).get('stop')), ('yield', lambda: q.get('signs', {}).get('yield')),
                                    ('give way', lambda: q.get('signs', {}).get('yield')), ('roundabout', lambda: q.get('signs', {}).get('roundabout')), ('flag', lambda: [q.get('flag')]),
                                    ('alphabet', lambda: [q.get('alphabet', {}).get('img')]), ('language', lambda: [q.get('alphabet', {}).get('img')]), ('letters', lambda: [q.get('alphabet', {}).get('img')])]:
                        if kw in t[:160]:
                            alt = [a for a in (get() or []) if a]
                            if alt: break
                    if alt: it['img'] = alt[0]; it['imgs'] = alt[:3]; it['gm_fallback'] = True; match_stats['gm_fallback'] += 1
                    else: match_stats['nomatch'] += 1
            elif it['k'] == 'img':
                it['pk_img'] = it['img']; it['img'] = None
    g['hero'] = None
print('image borrowing', dict(match_stats))

# ---------------------------------------------------------------- write per-country
os.makedirs(os.path.join(OUT, 'countries'), exist_ok=True)
index = []
all_slugs = sorted(set(guides) | set(gm))
for slug in all_slugs:
    g = guides.get(slug); q = gm.get(slug)
    name = (g or q)['name']
    if slug in ('beginners-guide', 'spillover-countries'): continue
    conts = g['continents'] if g else []
    if not conts and q:
        conts = []
    country = {
        'slug': slug, 'name': name, 'code': g['code'] if g else None, 'continents': conts,
        'hero': g['hero'] if g else None, 'updated': g['updated'] if g else None, 'flag': (q['flag'] if q else None) or local_flag(g['code'] if g else None),
        'drive': drive.get(name) or drive.get(q['name'] if q else ''), 'phone': phone.get(slug) or phone.get(name) or phone.get(q['name'] if q else ''),
        'gm': q, 'steps': g['steps'] if g else [], 'docs': g['docs'] if g else [],
        'lm': by_country.get(slug, []),
    }
    # top identifiers = tips of the first "Identifying" step
    top = []
    for s in country['steps']:
        if s['kind'] == 'tips' and (s['title'] or '').lower().startswith('identifying'):
            top = [it for it in s['items'] if it['k'] == 'tip'][:12]; break
    country['top'] = top
    slim = dict(country); slim['steps'] = [dict(s_, items=[{k: v for k, v in it.items() if k != 'raw'} for it in s_.get('items', [])]) if s_['kind'] == 'tips' else s_ for s_ in country['steps']]
    json.dump(slim, open(os.path.join(OUT, 'countries', slug + '.json'), 'w'), ensure_ascii=False, separators=(',', ':'))
    index.append({'slug': slug, 'name': name, 'code': country['code'], 'continents': conts, 'flag': (q['flag'] if q else None) or local_flag(g['code'] if g else None),
                  'drive': country['drive'], 'phone': country['phone'], 'hasGuide': bool(g), 'hasGm': bool(q),
                  'tips': sum(len([i for i in s.get('items', []) if i['k'] == 'tip']) for s in country['steps']), 'metas': len(country['lm'])})
json.dump({'countries': index, 'continents': CONTINENTS}, open(os.path.join(OUT, 'index.json'), 'w'), ensure_ascii=False, separators=(',', ':'))
print('countries written', len(index))

# ---------------------------------------------------------------- topics (per continent comparison pages)
os.makedirs(os.path.join(OUT, 'topics'), exist_ok=True)
def tips_matching(slug, pattern):
    g = guides.get(slug)
    if not g: return []
    out = []
    for s in g['steps']:
        if s['kind'] != 'tips': continue
        for it in s['items']:
            if it['k'] == 'tip' and re.search(pattern, it['raw'], re.I): out.append({'img': it['img'], 'pk': it.get('pk_img'), 'html': it['html'], 'step': s['title']})
    return out
TOPICS = {
    'bollards': (r'\bbollard', lambda q: q['bollards']),
    'plates': (r'licen[cs]e plate|number plate|\bplates?\b', lambda q: q['plates']),
    'poles': (r'\b(utility |electric(ity)? |power |telephone )?poles?\b|insulator', lambda q: []),
    'road-lines': (r'road lines?|centre line|center line|edge line|outer line|middle line|yellow line|white line', lambda q: []),
    'signs': (r'\bsigns?\b|chevron|guardrail|pedestrian crossing', lambda q: sum(q['signs'].values(), [])),
    'language': (r'language|alphabet|script|letters?\b|diacritic|cyrillic', lambda q: [q['alphabet']['img']] if q['alphabet']['img'] else []),
    'cars': (r'google car|street view car|gen ?[1234]|camera|snorkel|antenna|rifts?\b|blur', lambda q: []),
    'landscape': (r'landscape|vegetation|trees?\b|palm|pine|eucalypt|grass|desert|mountain|soil|forest', lambda q: []),
    'phone': (r'phone|area code|dial|\bDDD\b', lambda q: []),
}
for tid, (pat, gmfn) in TOPICS.items():
    entries = []
    for c in index:
        slug = c['slug']; q = gm.get(slug)
        tips = tips_matching(slug, pat)
        gimgs = gmfn(q) if q else []
        if not tips and not gimgs: continue
        entries.append({'slug': slug, 'name': c['name'], 'continents': c['continents'], 'flag': c['flag'], 'gm_imgs': gimgs,
                        'gm_note': (q.get(tid + '_note') if q else '') or (q['road_lines'] if q and tid == 'road-lines' else ''),
                        'tips': tips[:8], 'drive': c['drive'], 'phone': c['phone']})
    json.dump(entries, open(os.path.join(OUT, 'topics', tid + '.json'), 'w'), ensure_ascii=False, separators=(',', ':'))
    print('topic', tid, len(entries))

# ---------------------------------------------------------------- flashcard decks
os.makedirs(os.path.join(OUT, 'decks'), exist_ok=True)
decks = []
def add_deck(did, title, group, cards, desc=''):
    cards = [c for c in cards if c.get('q') or c.get('qtext') or c.get('pk')]
    if len(cards) < 4: return
    json.dump({'id': did, 'title': title, 'group': group, 'desc': desc, 'cards': cards}, open(os.path.join(OUT, 'decks', did + '.json'), 'w'), ensure_ascii=False, separators=(',', ':'))
    decks.append({'id': did, 'title': title, 'group': group, 'count': len(cards), 'desc': desc})

cont_of = {c['slug']: c['continents'] for c in index}
# geomastr image -> country decks per continent
for cont in CONTINENTS:
    cs = [c for c in index if cont in c['continents'] and c['hasGm']]
    if not cs: continue
    key = cont.lower().replace(' ', '-')
    for tid, title, fn in [('bollards', 'Bollards', lambda q: q['bollards']), ('plates', 'License plates', lambda q: q['plates']),
                           ('stop', 'Stop signs', lambda q: q['signs']['stop']), ('yield', 'Yield signs', lambda q: q['signs']['yield']),
                           ('pedestrian', 'Pedestrian signs', lambda q: q['signs']['pedestrian']), ('chevron', 'Chevrons', lambda q: q['signs']['chevron']),
                           ('bend', 'Bend / curve signs', lambda q: q['signs']['bend']), ('flags', 'Flags', lambda q: [q['flag']]),
                           ('alphabet', 'Alphabets / languages', lambda q: [q['alphabet']['img']] if q['alphabet']['img'] else [])]:
        cards = []
        for c in cs:
            for img in fn(gm[c['slug']]):
                if img: cards.append({'q': [img], 'a': c['name'], 'slug': c['slug'], 'note': ''})
        add_deck(f'gm-{tid}-{key}', f'{title} – {cont}', cont, cards, 'Image → country (geomastr)')
    # road lines text deck
    cards = [{'q': [], 'qtext': c['name'], 'a': gm[c['slug']]['road_lines'] or '?', 'slug': c['slug'], 'note': ''} for c in cs if gm[c['slug']]['road_lines']]
    add_deck(f'gm-roadlines-{key}', f'Road lines (text) – {cont}', cont, cards, 'Country → road line colours')
    cards = [{'q': [], 'qtext': c['name'], 'a': (c['phone'] or '?') + ' · drives ' + (c['drive'] or '?'), 'slug': c['slug'], 'note': ''} for c in cs if c['phone']]
    add_deck(f'gm-phone-{key}', f'Phone codes + driving side – {cont}', cont, cards, 'Country → +code, driving side')

# learnablemeta map decks (image(s) -> meta name + note)
for mid, m in lm_maps.items():
    ms = [x for x in metas if x['mapId'] == mid and x['images']]
    if len(ms) < 4: continue
    cards = [{'q': x['images'][:4], 'a': x['name'], 'slug': meta_country(x)[0], 'note': x['note']} for x in ms]
    reg = (m.get('regions') or ['World'])[0]
    add_deck('lm-' + mid, m['name'], 'LM ' + reg, cards, 'learnablemeta.com map')

# per-country plonkit decks (image -> what does it tell you)
for slug, g in guides.items():
    cards = []
    for s in g['steps']:
        if s['kind'] != 'tips': continue
        for it in s['items']:
            if it['k'] == 'tip' and (it['img'] or it.get('pk_img')):
                cards.append({'q': [it['img']] if it['img'] else [], 'pk': it.get('pk_img'), 'a': g['name'], 'slug': slug, 'note': it['html'], 'step': s['title']})
    add_deck('pk-' + slug, g['name'] + ' – all plonkit tips', 'Country', cards, 'Image → explanation (plonkit)')
    top = [c for c in cards if (c['step'] or '').lower().startswith('identifying')][:12]
    add_deck('pk-top-' + slug, g['name'] + ' – top identifiers', 'Country top', top, 'The key clues (plonkit step 1)')

# continent "which country?" decks from plonkit step-1 images
for cont in CONTINENTS:
    cards = []
    for slug, g in guides.items():
        if cont not in g['continents']: continue
        for s in g['steps']:
            if s['kind'] == 'tips' and (s['title'] or '').lower().startswith('identifying'):
                for it in [i for i in s['items'] if i['k'] == 'tip' and (i['img'] or i.get('pk_img'))][:10]:
                    cards.append({'q': [it['img']] if it['img'] else [], 'pk': it.get('pk_img'), 'a': g['name'], 'slug': slug, 'note': it['html']})
    add_deck('pk-which-' + cont.lower().replace(' ', '-'), f'Which country? – {cont} (plonkit)', cont, cards, 'Image → country, from each guide\'s key clues')

json.dump(decks, open(os.path.join(OUT, 'decks', 'index.json'), 'w'), ensure_ascii=False, separators=(',', ':'))
print('decks', len(decks))

# ---------------------------------------------------------------- curated confusables: swap plonkit image urls for borrowed learnablemeta ones
src = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'confusables_src.json')
if os.path.exists(src):
    groups = json.load(open(src)); swapped = dropped = kept = 0
    pk_map = {}
    for slug, g in guides.items():
        for st in g['steps']:
            for it in st.get('items', []):
                if it.get('pk_img') and it.get('img'): pk_map[it['pk_img']] = it['img']
    for grp in groups:
        for it in grp['items']:
            u = it.get('img') or ''
            if u.startswith(PLONKIT):
                it['pk'] = u
                if u in pk_map: it['img'] = pk_map[u]; swapped += 1
                else:
                    q = gm.get(it['slug']) or {}; title = (grp['title'] + ' ' + grp['topic']).lower(); alt = None
                    kw = next((k for k in ['pedestrian', 'chevron', 'bollard', 'guardrail', 'stop sign', 'road line', 'roadline', 'plate', 'pole', 'alphabet', 'cyrillic', 'language'] if k in title), None)
                    if kw:
                        lm_kw = {'road line': 'roadline', 'alphabet': 'language', 'cyrillic': 'language'}.get(kw, kw)
                        hit = next((m for m in by_country.get(it['slug'], []) if m['images'] and (lm_kw in m['name'].lower() or lm_kw in norm(m['note'])[:120])), None)
                        if hit: alt = hit['images'][:1]
                        if not alt:
                            alt = {'pedestrian': q.get('signs', {}).get('pedestrian'), 'chevron': q.get('signs', {}).get('chevron'), 'bollard': q.get('bollards'), 'stop sign': q.get('signs', {}).get('stop'),
                                   'plate': q.get('plates'), 'alphabet': [q.get('alphabet', {}).get('img')], 'cyrillic': [q.get('alphabet', {}).get('img')], 'language': [q.get('alphabet', {}).get('img')]}.get(kw)
                            alt = [a for a in (alt or []) if a]
                    it['img'] = alt[0] if alt else None; dropped += 1
            else: kept += 1
    os.makedirs(os.path.join(OUT, 'curated'), exist_ok=True)
    json.dump(groups, open(os.path.join(OUT, 'curated', 'confusables.json'), 'w'), ensure_ascii=False, indent=0)
    print('confusables images: swapped', swapped, 'fallback/dropped', dropped, 'kept', kept)
