# GeoStudy – personal GeoGuessr study site

Static site (no build step, no backend) that compiles GeoGuessr "meta" knowledge from
[plonkit.net](https://www.plonkit.net) (guide text), [learnablemeta.com](https://learnablemeta.com)
(pictures + metas) and [geomastr.com](https://geomastr.com) (bollards, plates, signs, alphabets)
into one mobile-friendly reference with flashcards and map quizzes. For personal use only – the
content and pictures belong to those projects.

## Running it

* **GitHub Pages**: Settings → Pages → *Deploy from a branch* → branch `main` (or this branch), folder `/ (root)`.
  The site is then at `https://<user>.github.io/<repo>/`.
* **Locally**: `python3 -m http.server 8000` in the repo root and open <http://localhost:8000>
  (opening `index.html` directly does not work because the data is loaded with `fetch`).

## Layout

| path | what |
|---|---|
| `index.html`, `assets/` | the app: `app.js` (router, world map, country/continent/topic pages, search), `cards.js` (flashcards + spaced repetition in `localStorage`), `quiz.js` (map quizzes), `world.svg` / `us.svg` (Wikimedia Commons blank maps) |
| `data/index.json` | list of countries (name, code, continents, phone code, driving side) |
| `data/countries/<slug>.json` | everything about one country: geomastr quick facts, plonkit steps (text + borrowed pictures), learnablemeta metas, top clues |
| `data/topics/*.json` | per-topic comparisons (bollards, plates, poles, road lines, signs, language, cars, landscape, phone) |
| `data/decks/` | flashcard decks (`index.json` + one file per deck) |
| `data/curated/` | hand-written: `confusables` (look-alike groups), `brazil_ddd` (phone codes per state), `us_states`, `australia`, `indonesia` |
| `scripts/scrape.py` | downloads the raw sources into a folder (`python3 scripts/scrape.py raw`) |
| `scripts/build_data.py` | turns the raw folder into `data/` (`python3 scripts/build_data.py raw data`) |
| `scripts/confusables_src.json` | source of the confusables page (plonkit picture paths are resolved to embeddable learnablemeta copies at build time) |

## Pictures

plonkit.net does not allow its pictures to be embedded on other sites (`Cross-Origin-Resource-Policy`
+ Cloudflare), so the build borrows the matching picture from learnablemeta.com whenever a meta there
copies the same plonkit text (about 60 % of tips). Tips without a match are shown as text with a link
to the plonkit guide. learnablemeta and geomastr pictures are hot-linked (not stored in the repo).

## Updating

```bash
python3 scripts/scrape.py raw        # ~20 min, polite rate limiting
python3 scripts/build_data.py raw data
```
