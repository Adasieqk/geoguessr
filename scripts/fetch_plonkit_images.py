#!/usr/bin/env python3
"""Download the plonkit.net pictures the site could not show, so they are served from this repo.

plonkit.net does not let other websites embed its pictures, so the build borrows copies from
learnablemeta/geomastr. About 2 000 tips had no copy. This script downloads those originals from
plonkit into ./pk/ and writes data/pk_local.json; the site picks them up automatically.

Run it from the repository root on your own computer:

    pip install pillow            # optional but recommended: converts to small .webp files
    python3 scripts/fetch_plonkit_images.py            # only the missing pictures (~2 000)
    python3 scripts/fetch_plonkit_images.py --all      # every plonkit picture (~5 400, bigger repo)

Then publish them:

    git add pk data/pk_local.json && git commit -m "Add plonkit pictures" && git push

If plonkit's Cloudflare protection answers 403 to the script, use the browser fallback:

    python3 scripts/fetch_plonkit_images.py --browser   # writes pk_console.js
    # 1. open https://www.plonkit.net in Chrome or Edge (desktop), press F12 -> Console
    # 2. paste the content of pk_console.js, press Enter, pick an empty folder, e.g. <repo>/pk_raw
    # 3. when it says "done":
    python3 scripts/fetch_plonkit_images.py --import pk_raw
"""
import argparse, glob, io, json, os, re, sys, time, urllib.parse, urllib.request

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
OUT_DIR = os.path.join(ROOT, 'pk')
MANIFEST = os.path.join(ROOT, 'data', 'pk_local.json')
UA = ('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) '
      'Chrome/130.0 Safari/537.36')
MAX_W = 1200

try:
    from PIL import Image
except ImportError:
    Image = None


def wanted_urls(all_images):
    """Collect plonkit picture URLs referenced by the site data."""
    urls = {}
    for f in sorted(glob.glob(os.path.join(ROOT, 'data', 'countries', '*.json'))):
        slug = os.path.basename(f)[:-5]
        d = json.load(open(f, encoding='utf-8'))
        for st in d.get('steps', []):
            for it in st.get('items', []):
                u = it.get('pk_img')
                if u and (all_images or not it.get('img')):
                    urls.setdefault(u, slug)
    conf = os.path.join(ROOT, 'data', 'curated', 'confusables.json')
    if os.path.exists(conf):
        for g in json.load(open(conf, encoding='utf-8')):
            for it in g['items']:
                if it.get('pk') and (all_images or not it.get('img')):
                    urls.setdefault(it['pk'], it['slug'])
    return urls  # url -> country slug (used as Referer)


def flat_name(url):
    """/images/poland/Poland bollard.png -> poland__Poland_bollard.png"""
    path = urllib.parse.unquote(urllib.parse.urlparse(url).path)
    path = re.sub(r'^/images/', '', path)
    return re.sub(r'[^A-Za-z0-9._-]+', '_', path.replace('/', '__'))


def save(data, url):
    """Write picture bytes into pk/, converted to webp if Pillow is available; return site path."""
    name = flat_name(url)
    if Image is not None:
        try:
            im = Image.open(io.BytesIO(data))
            im.load()
            if im.mode not in ('RGB', 'RGBA'):
                im = im.convert('RGBA')
            if im.width > MAX_W:
                im = im.resize((MAX_W, round(im.height * MAX_W / im.width)), Image.LANCZOS)
            name = os.path.splitext(name)[0] + '.webp'
            im.save(os.path.join(OUT_DIR, name), 'WEBP', quality=80, method=5)
            return 'pk/' + name
        except Exception as e:  # unsupported format -> keep the original file
            print('  (kept original, could not convert: %s)' % e)
    with open(os.path.join(OUT_DIR, name), 'wb') as fh:
        fh.write(data)
    return 'pk/' + name


def load_manifest():
    return json.load(open(MANIFEST, encoding='utf-8')) if os.path.exists(MANIFEST) else {}


def write_manifest(m):
    with open(MANIFEST, 'w', encoding='utf-8') as fh:
        json.dump(m, fh, ensure_ascii=False, indent=0, sort_keys=True)


def download(urls, delay):
    os.makedirs(OUT_DIR, exist_ok=True)
    manifest = load_manifest()
    todo = [(u, s) for u, s in urls.items() if not (u in manifest and os.path.exists(os.path.join(ROOT, manifest[u])))]
    print('%d pictures wanted, %d already downloaded, %d to go' % (len(urls), len(urls) - len(todo), len(todo)))
    ok = fail = blocked_in_a_row = 0
    for i, (url, slug) in enumerate(todo, 1):
        req = urllib.request.Request(url, headers={'User-Agent': UA, 'Referer': 'https://www.plonkit.net/' + slug,
                                                   'Accept': 'image/avif,image/webp,image/png,image/*;q=0.8,*/*;q=0.5'})
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                data = r.read()
                ctype = r.headers.get('Content-Type', '')
            if not ctype.startswith('image/'):
                raise RuntimeError('not an image (%s)' % ctype)
            manifest[url] = save(data, url)
            ok += 1; blocked_in_a_row = 0
        except Exception as e:
            fail += 1
            if '403' in str(e) or '429' in str(e):
                blocked_in_a_row += 1
            print('  ! %s: %s' % (url, e))
            if blocked_in_a_row >= 8:
                print('\nplonkit is blocking this script (Cloudflare). Use the browser fallback:\n'
                      '    python3 scripts/fetch_plonkit_images.py --browser\n')
                break
        if i % 50 == 0:
            write_manifest(manifest)
            print('%d/%d  ok=%d failed=%d' % (i, len(todo), ok, fail))
        time.sleep(delay)
    write_manifest(manifest)
    print('done: %d downloaded, %d failed. Manifest: %s' % (ok, fail, os.path.relpath(MANIFEST, ROOT)))


CONSOLE_JS = r"""// GeoStudy: paste into the DevTools console on https://www.plonkit.net (Chrome/Edge desktop)
(async () => {
  const LIST = __LIST__;
  const dir = await window.showDirectoryPicker({ mode: 'readwrite' });
  let ok = 0, fail = 0;
  for (let i = 0; i < LIST.length; i++) {
    const [url, name] = LIST[i];
    try {
      try { await dir.getFileHandle(name); ok++; continue; } catch (e) { /* not there yet */ }
      const r = await fetch(url, { credentials: 'include' });
      if (!r.ok) throw new Error(r.status);
      const fh = await dir.getFileHandle(name, { create: true });
      const w = await fh.createWritable(); await w.write(await r.blob()); await w.close(); ok++;
    } catch (e) { fail++; console.warn('failed', url, e); }
    if (i % 50 === 0) console.log(`${i}/${LIST.length}  ok=${ok} failed=${fail}`);
    await new Promise(res => setTimeout(res, 150));
  }
  console.log(`done: ok=${ok} failed=${fail}. Now run: python3 scripts/fetch_plonkit_images.py --import <that folder>`);
})();
"""


def browser_script(urls):
    lst = [[u.replace('https://www.plonkit.net', ''), flat_name(u)] for u in urls]
    out = os.path.join(ROOT, 'pk_console.js')
    with open(out, 'w', encoding='utf-8') as fh:
        fh.write(CONSOLE_JS.replace('__LIST__', json.dumps(lst)))
    print('wrote %s (%d pictures). Paste it into the console on https://www.plonkit.net' % (os.path.relpath(out, ROOT), len(lst)))


def import_folder(folder, urls):
    os.makedirs(OUT_DIR, exist_ok=True)
    manifest = load_manifest(); n = 0
    for url in urls:
        p = os.path.join(folder, flat_name(url))
        if os.path.exists(p):
            with open(p, 'rb') as fh:
                manifest[url] = save(fh.read(), url)
            n += 1
    write_manifest(manifest)
    print('imported %d pictures into pk/ (%d wanted). You can delete %s now.' % (n, len(urls), folder))


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--all', action='store_true', help='download every plonkit picture, not only the missing ones')
    ap.add_argument('--browser', action='store_true', help='write pk_console.js for the browser fallback')
    ap.add_argument('--import', dest='imp', metavar='FOLDER', help='import pictures saved by pk_console.js')
    ap.add_argument('--delay', type=float, default=0.4, help='seconds between requests (default 0.4)')
    a = ap.parse_args()
    if Image is None:
        print('Note: Pillow not installed -> pictures are stored unconverted (bigger). pip install pillow\n')
    urls = wanted_urls(a.all)
    if a.browser:
        browser_script(urls)
    elif a.imp:
        import_folder(a.imp, urls)
    else:
        download(urls, a.delay)


if __name__ == '__main__':
    sys.exit(main())
