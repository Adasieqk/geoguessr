#!/usr/bin/env python3
"""Download raw source data (plonkit guides, geomastr pages, learnablemeta map metas).

Usage: python3 scripts/scrape.py RAW_DIR
Everything is saved under RAW_DIR; run scripts/build_data.py afterwards.
"""
import json, os, re, sys, time, urllib.request

RAW = sys.argv[1] if len(sys.argv) > 1 else 'raw'
UA = {'User-Agent': 'Mozilla/5.0 (personal geoguessr study site)'}

def get(url, timeout=60, retries=4):
    for i in range(retries):
        try:
            return urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=timeout).read()
        except Exception as e:  # noqa
            if '429' in str(e) and i < retries - 1:
                time.sleep(20 * (i + 1)); continue
            if i == retries - 1: raise
            time.sleep(2)

def plonkit():
    d = os.path.join(RAW, 'plonkit'); os.makedirs(d, exist_ok=True)
    guides = json.loads(get('https://www.plonkit.net/api/guides'))['data']
    json.dump(guides, open(os.path.join(RAW, 'plonkit_guides.json'), 'w'))
    for g in guides:
        out = os.path.join(d, g['slug'] + '.json')
        if os.path.exists(out): continue
        h = get(f"https://www.plonkit.net/{g['slug']}").decode()
        m = re.search(r'<script id="__PRELOADED_DATA__" type="application/json">(.*?)</script>', h, re.S)
        if m: open(out, 'w').write(m.group(1)); print('plonkit', g['slug'])
        time.sleep(0.5)

def learnablemeta():
    d = os.path.join(RAW, 'lm_maps'); os.makedirs(d, exist_ok=True)
    maps = json.loads(get('https://learnablemeta.com/api/maps'))
    json.dump(maps, open(os.path.join(RAW, 'lm_maps.json'), 'w'))
    for m in maps:
        out = os.path.join(d, m['geoguessrId'] + '.json')
        if os.path.exists(out): continue
        open(out, 'wb').write(get(f"https://learnablemeta.com/maps/{m['geoguessrId']}/__data.json"))
        print('lm', m['name']); time.sleep(0.3)

def geomastr():
    d = os.path.join(RAW, 'gm'); os.makedirs(d, exist_ok=True)
    home = get('https://geomastr.com/').decode()
    open(os.path.join(RAW, 'gm_home.html'), 'w').write(home)
    slugs = sorted(set(re.findall(r'href="/country/([^"/]+)/"', home)))
    pages = [f'country/{s}' for s in slugs]
    for t in ['bollards', 'phone-numbers', 'road-lines', 'license-plates', 'flags', 'alphabets', 'street-signs', 'continent']:
        for c in ['africa', 'asia', 'europe', 'north-america', 'oceania', 'south-america']:
            pages.append(f'{t}/{c}')
    for p in pages:
        out = os.path.join(d, p.replace('/', '__') + '.html')
        if os.path.exists(out): continue
        open(out, 'wb').write(get(f'https://geomastr.com/{p}/')); print('gm', p); time.sleep(0.3)

if __name__ == '__main__':
    os.makedirs(RAW, exist_ok=True)
    plonkit(); geomastr(); learnablemeta()
