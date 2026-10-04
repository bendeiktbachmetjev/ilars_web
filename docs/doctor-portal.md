# Doctor portal (`doctor.html`)

The doctor portal is the web page where study doctors follow their iLARS patients. It has two workspaces:

- **iLARS** — the study: a **Patients** list, an **Overview** of the whole group, and one **dashboard per patient**
  (LARS score, EQ-5D-5L, bowel diary, questionnaires, steps, food).
- **Registras** — the Lithuanian clinical registry (list + record form). Only doctors of Lithuanian hospitals see it.

It is one static HTML page with hash routes, plain CSS and classic scripts. There is **no build step** and no
framework: every file in this document is served as it is by `server.py` (or any static host).

Routes: `#patients` · `#overview` · `#patient/<code>` · `#registry` · `#registry/<id>`. An empty hash (or the old
`#list`) opens the default: `#registry` for Lithuanian doctors, `#patients` for everyone else. The hash is the only
source of truth for the workspace and the tab (`js/doctors/app.js`).

---

## 1. Files

```
doctor.html                      the page: shell, static dialogs, script and style order
css/doctor/
  tokens.css                     design tokens (colours, type, spacing, radii, motion, z-index) + layer order
  base.css                       reset, document, focus ring, [hidden], type helpers, icons
  layout.css                     top bar, page head, tabs, 12-column grid and breakpoints
  components.css                 every shared .ui-* component (buttons, chips, cards, chart card, tables, dialogs …)
  motion.css                     keyframes, staggered reveal, view transitions, reduced-motion rules
  views/boot.css                 access gate (boot card + skeleton), translation anti-flash
  views/patients.css             iLARS Patients list (.pl-*)
  views/overview.css             iLARS Overview (.ov-*)
  views/patient.css              patient dashboard (.pd-*)
  views/registry.css             registry list and record form (.reg-*, .registry-*)
  entry.css                      login.html / doctor-setup.html token alignment (not loaded by doctor.html)
js/doctors/
  api.js                         ApiService: every backend call (20 s timeout; errors carry .status and .detail)
  app.js                         router (window.app)
  tabs.js                        workspace switch iLARS | Registras (ILARS_TABS)
  registry-fields.js             registry field definitions (ILARS_REGISTRY) — frozen, see §8
  setup.js                       doctor-setup.html only
  ui/      icons.js core.js motion.js overlay.js boot.js     shared UI helpers, the access gate
  data/    store.js metrics.js api-adapter.js cohort-trajectory.js patient-model.js cohort-model.js
  charts/  theme.js base.js sparkline.js patient.js cohort.js loader.js card.js
  views/   patient-list.js overview.js patient-detail.js registry-form.js registry-list.js
tests/doctor/                    Node unit tests (never served, see §9)
```

Each file is one IIFE (or one class where other code needs the class name). Pure files (`data/*`, the chart
builders, `charts/theme.js`) have no DOM access and end with a `module.exports` guard, so `node --test` can load them.

---

## 2. Script and style order

Styles (in `<head>`, this order): `tokens` · `base` · `layout` · `components` · `views/boot` · `views/patients` ·
`views/overview` · `views/patient` · `views/registry` · `motion`. The first line of `tokens.css` fixes the cascade
layer order for the whole portal:

```css
@layer tokens, base, layout, components, views, motion, utilities;
```

So a later layer always wins over an earlier one, whatever the file order or selector weight.

Scripts (end of `<body>`, classic, no `defer`, this order — later files use globals of earlier ones):

1. Firebase compat 10.7.1 — app, auth, firestore (gstatic)
2. `js/i18n.js` · `js/config.js` · `js/firebase/config.js` · `js/firebase/auth.js` · `js/auth-check.js`
3. `js/doctors/ui/icons.js` · `ui/core.js` · `ui/motion.js` · `ui/overlay.js`
4. `js/doctors/api.js` · `data/store.js` · `data/metrics.js` · `data/api-adapter.js` · `data/cohort-trajectory.js` ·
   `data/patient-model.js` · `data/cohort-model.js`
5. `js/doctors/charts/theme.js` · `charts/base.js` · `charts/sparkline.js` · `charts/patient.js` · `charts/cohort.js` ·
   `charts/loader.js` · `charts/card.js`
6. `js/doctors/registry-fields.js` · `views/patient-list.js` · `views/overview.js` · `views/patient-detail.js` ·
   `views/registry-form.js` · `views/registry-list.js`
7. `js/doctors/tabs.js` · `js/doctors/ui/boot.js` · `js/doctors/app.js`

ECharts and SheetJS (Excel export) are **not** script tags: they load lazily when needed.

---

## 3. Global names

| Global | File | What it is |
|---|---|---|
| `ILARS_UI` | `ui/core.js`, `ui/motion.js`, `ui/overlay.js` | `t`, `tp`, `fmtDay`, `fmtNum`, `fmtRelative`, `fmtUnit`, `esc`, `patchAria`, segmented control, view transitions, reveal, count-up, dialogs, confirm, toast, menus |
| `ILARS_ICONS` | `ui/icons.js` | inline SVG icon sprite (`icon(name, class)`) |
| `ILARS_BOOT` | `ui/boot.js` | Promise: resolves after sign-in, the doctor profile and the translations; app.js routes only then |
| `ILARS_PROFILE()` | `data/store.js` | the one cached `GET /doctors/me`; sets `ILARS_IS_LT` |
| `ILARS_IS_LT` | `data/store.js` | true for doctors of a Lithuanian hospital (registry workspace) |
| `ILARS_DATA` | `data/store.js`, `api-adapter.js`, `cohort-trajectory.js` | `store` (shared cached requests), `adaptList` / `adaptDetail`, `cohortTrajectory` |
| `ILARS_METRICS` | `data/metrics.js` | every calculation shown on screen (scores, adherence, attention rules, ranges) |
| `ILARS_VIEW_MODELS` | `data/patient-model.js`, `data/cohort-model.js` | turn adapted data into what a view draws |
| `ILARS_CHART_THEME` | `charts/theme.js` | reads the colour tokens into the object every chart uses |
| `ILARS_CHART_OPTIONS` | `charts/base.js` + `sparkline.js`, `patient.js`, `cohort.js` | pure chart builders (data → ECharts option) |
| `ILARS_CHARTS` | `charts/loader.js`, `charts/card.js` | `load()` (lazy ECharts), `card()`, `ctx()`, `disposeAll()` |
| `ILARS_TABS` | `tabs.js` | workspace switch |
| `ILARS_REGISTRY` | `registry-fields.js` | registry field definitions |
| `ILARS_I18N` | `js/i18n.js` | language loading and switching (shared with the other pages) |
| `app`, `PatientListView`, `OverviewView`, `PatientDetailView`, `RegistryListView`, `RegistryDetailView` | `app.js`, `views/*` | router and views |

Browser storage (per viewer, every access wrapped in `try/catch`): localStorage `ilars_lang`, `ilars_scope`,
`ilars_pd_range`, `ilars_pd_axis`, `ilars_chart_patterns`; sessionStorage `ilars_pl_state` plus the session keys
written by the login page (`ilars_user_role`, `ilars_doctor_*`).

---

## 4. Design tokens

`css/doctor/tokens.css` is the only place with raw colour values. It has three levels:

1. **Primitives** — grey ladder, indigo brand ramp, status families (green / amber / red / slate), categorical chart
   hues. Never used directly by components.
2. **Semantic tokens** — what things mean: `--color-text`, `--color-text-secondary`, `--color-surface`,
   `--color-border-control`, `--color-focus-ring`, `--color-danger-ink`, `--color-lars-minor`, `--viz-1` … `--viz-8`,
   `--viz-cal-daily`, and so on. Components and views use only these.
3. **Component tokens** — elevation, glass recipes, the action gradient, type scale, spacing, radii, motion
   durations and easings, z-index.

Rules:

- Components and views use `var(--token)` only. No raw hex, no `rgb()` (the one exception: white text on accent
  surfaces, which the contrast check covers through `--color-text-on-accent`).
- Colour is never the only signal: LARS categories have a word and 1–3 pips, patient status has a word and a glyph,
  chart series have a legend and, for the questionnaire calendar, a pattern per type.
- System fonts only (`--font-ui`, `--font-display`, `--font-mono`). The portal loads no web font, so hospital PCs
  never call Google.
- `prefers-contrast: more` swaps some tokens for darker ones; `prefers-reduced-transparency: reduce` makes every
  glass surface solid; a future dark theme only needs to redefine the semantic level.

**The contrast contract.** Comment lines in `tokens.css` that start with `@check`, `@cvd` or `@ordinal` describe
every colour pair that must stay readable:

```
@check <kind> <foreground> on <background>, <background>, ...
```

| kind | minimum | used for |
|---|---|---|
| `text` | 4.5:1 | normal text (WCAG 1.4.3) |
| `large` | 3:1 | text ≥ 24 px, or ≥ 18.66 px bold |
| `ui` | 3:1 | borders of controls, focus rings, marks shown without a text label (WCAG 1.4.11) |
| `soft` | 2:1 | marks always paired with a text label; disabled controls |
| `info` | — | printed for reference only |

`A@B` means "A (semi-transparent) painted over B". `@cvd` lines list colours that sit next to each other in a chart;
each pair must stay apart for normal vision and for red–green colour blindness (OKLab distance ×100: normal ≥ 15,
protan/deutan ≥ 8). `@ordinal` lines check that a ramp gets steadily darker.

The checker script (`check-contrast.mjs`) belongs to the design work and is **not in this repository**. When you
change a token: keep every `@check` line that mentions it true, add a line for any new pair you introduce, and ask
for the check to be re-run before merging. If a new colour fails, change the colour, never the line.

---

## 5. Charts

- **Library:** Apache ECharts 6.1.0 (full build, SVG renderer). It is never a `<script>` tag.
  `charts/loader.js` injects it when a chart route opens (`#patient/*`, `#overview`), in parallel with the data
  request: first from jsDelivr, then once from cdnjs if that fails. Both use the same **SRI hash**
  (`integrity` + `crossorigin="anonymous"`), so a changed file is refused. Each attempt gives up after 10 s.
- **Fallback:** if ECharts cannot load, every chart card calls `card.failed()`: the card shows a short info note
  ("Charts could not be loaded. The tables still work.") and its table. Every chart has a table twin, also reachable
  with the card's table button, so no information depends on the chart library.
- **Builders** (`charts/base.js`, `patient.js`, `cohort.js`, `sparkline.js`) are pure functions: model + context →
  ECharts option. They read colours only through `ILARS_CHART_THEME.readTokens()` (CSS tokens), texts only through
  `ctx.t` / `ctx.tp`, dates through `ctx.fmtDay`. Under reduced motion every option has `animation: false`.
- **Chart card** (`charts/card.js`): one shell for every chart — title, hint, view switch, table toggle, ⓘ,
  takeaway sentence, fixed-height chart box, HTML legend, notes, table twin. Resizing goes through a
  `ResizeObserver`; switching between views of the same kind animates, between different kinds cross-fades.
  An element with no data shows one calm line instead of empty axes.
- `app.js` disposes the patient charts when you leave a patient (`ILARS_CHARTS.disposeAll(root)`).

---

## 6. Data layer and API versions

- `api.js` (`ApiService`) does every HTTP call: Firebase ID token, 20 s timeout (`AbortController`), and errors that
  carry `.status` (0 = network or timeout) and `.detail` (the server's message).
- `data/store.js` caches what several views share: the doctor profile (one `GET /doctors/me` per session), the
  patient list (`GET /getPatients?status=all`, one cache entry per `include` value) and the patient names from
  Firestore. Views call `store.invalidate('patients' | 'names')` after a change. A failed request is never cached.
- `data/api-adapter.js` is the **only file that knows the wire names** of the newer backend ("API v2", backend branch
  `feature/doctor-api-v2`). It turns either backend answer into one internal shape. Detection is by **key presence
  only**: an answer with `as_of_date` is v2; per-row capabilities (`ILARS_METRICS.listRowCaps`) are true when the key
  exists, even with a `null` value. No version number and no extra request.
- What changes with today's API: elements that need v2 data either hide (whole cards with nothing to show) or show
  one calm "Not available yet." line inside the card. The Overview trajectory card asks for
  `include=lars_history` only when the list already has v2 keys, and removes itself if that request fails.
- `data/metrics.js` holds every rule and threshold (LARS categories, adherence, "needs attention" rules, date ranges).
  All days are UTC day numbers; "today" is the server's `as_of_date` when present, else the browser's UTC date.
- Fake data only in development: the portal never needs production data to be tested (see §9).

---

## 7. Translations (i18n)

- Dictionaries: `locales/{en,lt,it,es,tr}.json`. Portal keys live under `doctor.ui.*` (shell, buttons, page texts)
  and `doctor.cm.*` (charts and metrics copy). English is complete; the other languages may lag.
- Static HTML uses `data-i18n` (text), `data-i18n-html`, `data-i18n-placeholder` (applied by `js/i18n.js`) and
  `data-i18n-aria-label` (applied by `ILARS_UI.patchAria()`, after the translations load and on every language
  change). A label next to an icon sits in its own `<span data-i18n>`, because the text replacement would delete the
  icon. JavaScript texts always go through `ILARS_UI.t(key, params)` — never hard-coded English, also not in
  `aria-label`s.
- **Fallback:** `t()` looks in the current language, then in English (`locales/en.json`, loaded once by `ui/boot.js`),
  then returns the key. Each missing key is logged once in the console. A user never sees a raw key.
- **Plurals:** `ILARS_UI.tp(key, n)` picks `key_one` / `key_few` / `key_many` / `key_other` with
  `Intl.PluralRules` (Lithuanian needs `_few`; it/es/tr need `_one` and `_other`). When the current language lacks the
  key, the English text is used with English plural rules. Missing categories fall back to `_other`.
- **Dates, numbers, durations** never come from the dictionaries: `Intl` with en-GB, lt-LT, it-IT, es-ES, tr-TR.
  Durations ("19 days", "10 mėnesių") use `ILARS_UI.fmtUnit(n, 'day' | 'week' | 'month')`. Chart axes use month
  names; Lithuanian has no short month name, so it gets the full name ("birželis").
- **Cache buster:** every change to a file in `locales/` bumps the `?v=` number in `js/i18n.js` **and** the
  `EN_FALLBACK` URL in `js/doctors/ui/boot.js` (keep the two equal), in the same commit. `server.py` sends
  `Cache-Control: no-cache` for `/locales/*.json`, but browsers and proxies may still hold copies cached for a year
  by the older server, and other hosts may cache too.

---

## 8. Registry freeze

The Lithuanian registry is used for real clinical records, so its **behaviour is frozen**:

- `js/doctors/registry-fields.js` is not changed (field list, types, Lithuanian labels, options).
- `views/registry-list.js` and `views/registry-form.js` keep every class, id and data attribute, every API call and
  Firestore write, sorting, filtering, export, validation and the payload sent on save. Only visual, accessibility and
  safety changes are allowed (styles, icons, ARIA, native dialogs with Esc, quote-safe escaping).
- Registry texts stay Lithuanian and are not moved into the dictionaries.
- Elements that legacy code shows or hides through `element.style.display` (`#table-mode-bar`, `#study-mode`,
  `#registry-mode`, the create buttons, `#registry-error`, `.view`) **never** get the `hidden` attribute: `base.css`
  makes `[hidden]` win with `!important`, which would hide them for good. They start with `style="display:none"`
  when they must start hidden. New code toggles only `hidden`.

Any registry change beyond that needs its own review and a before/after comparison of every registry flow.

---

## 9. Tests and local preview

Unit tests (Node 18 or newer, no install), run from `web/`:

```bash
ECHARTS_DIR=<folder with echarts.js 6.1.0> node --test tests/doctor/*.test.js
```

- `metrics.test.js`, `adapter.test.js`, `cohort.test.js` — calculations and the API adapter (fictional fixtures).
- `chart-options.test.js` — every chart builder rendered to SVG with ECharts server-side rendering, in both API
  modes and every axis mode; also checks that every English key used by the builders exists.
- `ECHARTS_DIR` points to a folder that holds `echarts.js` (or the `echarts` npm package). **ECharts is never
  committed into `web/`.** Without it the rendering tests are skipped, the rest still run.
- Pass the file glob: Node 24 does not accept the bare folder.
- Time zones matter for date code; to be thorough run the suite with `TZ=UTC`, `America/Chicago`, `Pacific/Honolulu`,
  `Asia/Tokyo` and `Europe/Vilnius`.

`server.py` answers **404 for everything under `/tests/`**, so the tests and fixtures are never served.

Local server: `PORT=8000 python3 server.py` from `web/` (it serves its working directory; one thread per request).
The portal needs a signed-in doctor and the backend; for screenshots and manual checks use a mock harness with fake
data and never the production backend.

---

## 10. Accessibility and motion

- **Focus:** one visible ring everywhere (2 px `--color-focus-ring`, 2 px offset; `Highlight` in forced colours).
  After each route change focus moves to the page heading; on back navigation the list restores scroll and focuses
  the row you came from.
- **Keyboard:** list rows are real links; segmented controls and the workspace switch are one Tab stop with ←/→;
  menus support ↑/↓/Home/End/Esc; Alt+↑/↓ steps through patients on the dashboard.
- **Dialogs** are native `<dialog>` with `showModal()` (focus trap, Esc, inert page). `ILARS_UI.openDialog` focuses
  the first field (or the primary action, or the first list item) — never the × button — and returns focus to the
  opener. Inside a dialog form the primary action is the only `type="submit"`, so Enter never closes a dialog by
  accident. `ILARS_UI.confirm()` replaces `window.confirm()` in the iLARS part.
- **Toasts** carry their own `role` (`status`, or `alert` for errors); success toasts pause while hovered or focused,
  error toasts stay until closed.
- **Targets** are at least 24 × 24 px. Number fields have no spin buttons; ↑/↓ still step the value.
- **Forced colours** (Windows high contrast): cards, menus, dialogs and controls get real borders; small glyphs
  (LARS pips, status dots, avatars) use system colours; legend keys keep the chart colours.
- **Motion** explains a change of state; nothing loops except loaders. Only `transform` and `opacity` animate.
  Same-document View Transitions between routes; a staggered reveal only on the first render of a view; KPI
  count-up once per load. **Reduced motion** reduces, never breaks: short opacity fades stay; movement, shimmer,
  count-up, view-transition slides and chart animations stop.
- **Restraint:** light and calm. One gradient action per view, glass only on the top bar, menus, dialogs and
  floating bars, colour reserved for meaning.
