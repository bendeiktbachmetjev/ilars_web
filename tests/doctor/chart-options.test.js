// Tests for js/doctors/charts/{base,sparkline,patient,cohort}.js: every builder through ECharts 6.1.0 server-side
// rendering (SVG, no browser), in both API modes (today's API and v2) and every axis mode. Fictional, generated data only.
//
// Run from web/:   ECHARTS_DIR=<folder with echarts.js 6.1.0, or the echarts npm package> node --test tests/doctor/*.test.js
// Time zones:      for z in UTC America/Chicago Pacific/Honolulu Asia/Tokyo Europe/Vilnius; do TZ=$z ECHARTS_DIR=… node --test tests/doctor/*.test.js; done
// ECharts is never committed into web/ (DESIGN-SPEC §6.2): without ECHARTS_DIR the rendering tests are skipped.
// The English key check reads locales/en.json; ILARS_I18N_EXTRA=<a.json>:<b.json> adds dictionaries not merged yet.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const WEB = path.resolve(__dirname, '../..');
const CHART_FILES = ['base', 'sparkline', 'patient', 'cohort'].map((f) => path.join(WEB, 'js/doctors/charts', f + '.js'));
const M = require(path.join(WEB, 'js/doctors/data/metrics.js'));
const O = require(CHART_FILES[0]);
CHART_FILES.slice(1).forEach((f) => require(f));
const THEME = require(path.join(WEB, 'js/doctors/charts/theme.js'));
const DAY = 864e5;
const iso = M.dayToIso;
const TODAY = M.parseDay('2026-10-01');
const NOW = { nowMs: TODAY * DAY + 3600e3 };          // today's API has no as_of_date: pin the browser clock

// ------------------------------------------------------------------ ECharts (outside web/)
function loadEcharts() {
  const dir = process.env.ECHARTS_DIR;
  if (!dir) return null;
  for (const f of ['echarts.js', 'echarts.min.js', 'dist/echarts.js', 'dist/echarts.min.js']) {
    const p = path.resolve(dir, f);
    if (fs.existsSync(p)) return require(p);
  }
  try { return require(require.resolve('echarts', { paths: [dir] })); } catch (e) { return null; }
}
const echarts = loadEcharts();
const SSR = echarts ? {} : { skip: 'set ECHARTS_DIR to a folder with ECharts 6.1.0 (never inside web/)' };

/** Renders an option to SVG; any ECharts warning or error fails the test. */
function render(option, w = 900, h = 300) {
  const logged = [], warn = console.warn, error = console.error;
  console.warn = (...a) => logged.push(a.join(' ')); console.error = (...a) => logged.push(a.join(' '));
  const c = echarts.init(null, null, { renderer: 'svg', ssr: true, width: w, height: h });
  try {
    c.setOption(option, true);
    const svg = c.renderToSVGString();
    assert.ok(svg.startsWith('<svg'));
    assert.deepEqual(logged, [], 'ECharts logged: ' + logged.join(' | '));
    return svg;
  } finally { c.dispose(); console.warn = warn; console.error = error; }
}

// ------------------------------------------------------------------ i18n (English dictionary; plural keys only through tp)
const deep = (a, b) => { for (const k of Object.keys(b)) a[k] = b[k] && typeof b[k] === 'object' ? deep(a[k] && typeof a[k] === 'object' ? a[k] : {}, b[k]) : b[k]; return a; };
const dict = JSON.parse(fs.readFileSync(path.join(WEB, 'locales/en.json'), 'utf8'));
(process.env.ILARS_I18N_EXTRA || '').split(':').filter(Boolean).forEach((f) => deep(dict, JSON.parse(fs.readFileSync(f, 'utf8'))));
const lookup = (k) => { const v = k.split('.').reduce((o, p) => (o == null ? undefined : o[p]), dict); return typeof v === 'string' ? v : null; };
const isPlural = (k) => lookup(k + '_other') != null;
const hasCm = lookup('doctor.cm.lars.title') != null;
const missing = new Set(), pluralThroughT = new Set();
const fill = (s, p) => s.replace(/\{(\w+)\}/g, (m, n) => (p && p[n] != null ? p[n] : m));
const t = (k, p) => {
  if (isPlural(k)) pluralThroughT.add(k);
  const s = lookup(k);
  if (s == null) { missing.add(k); return k; }
  return fill(s, p);
};
const PR = new Intl.PluralRules('en');
const tp = (k, n, p) => {
  let key = k + '_' + PR.select(n);
  if (lookup(key) == null) key = k + '_other';
  const s = lookup(key);
  if (s == null) { missing.add(key); return key; }
  return fill(s, Object.assign({ n }, p));
};

// ------------------------------------------------------------------ tokens: a distinct colour per key, unknown keys throw
const TOK = (() => {
  const tok = {}, used = new Set();
  let i = 0;
  const next = () => { i++; const c = '#' + [(i * 37) % 251, (i * 91 + 13) % 241, (i * 53 + 29) % 239].map((v) => v.toString(16).padStart(2, '0')).join(''); assert.ok(!used.has(c)); used.add(c); return c; };
  Object.keys(THEME.MAP).forEach((k) => { tok[k] = next(); });
  tok.surface = '#ffffff';
  Object.keys(THEME.LISTS).forEach((k) => { tok[k] = THEME.LISTS[k].map(next); });
  tok.q = { daily: next(), weekly: next(), monthly: next(), eq5d5l: next() };
  tok.font = 'sans-serif'; tok.areaAlpha = 0.18;
  return new Proxy(tok, { get: (o, k) => { if (typeof k === 'string' && !(k in o)) throw new Error('unknown token key ' + k); return o[k]; } });
})();
const fmtDay = (d, style) => (style === 'axis' ? iso(d).slice(5) : iso(d));
const fmtNum = (v, dec) => Number(v).toFixed(dec || 0);
const ctxFor = (mode, ref) => ({ tok: TOK, t, tp, lang: 'en-GB', reduced: true, patterns: false, fmtDay, fmtNum, x: { mode, ref } });

// ------------------------------------------------------------------ generated fictional patients (both API shapes)
function rng(seed) { return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let x = Math.imul(seed ^ seed >>> 15, 1 | seed); x = x + Math.imul(x ^ x >>> 7, 61 | x) ^ x; return ((x ^ x >>> 14) >>> 0) / 4294967296; }; }
const KEYS = M.C.LARS_ITEM_KEYS, POINTS = M.C.LARS_ITEM_POINTS;
const COMBOS = [];
for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) for (let c = 0; c < 3; c++) for (let d = 0; d < 4; d++) for (let e = 0; e < 3; e++) {
  const idx = [a, b, c, d, e], items = {}; let score = 0;
  KEYS.forEach((k, j) => { items[k] = idx[j]; score += POINTS[k][idx[j]]; });
  COMBOS.push({ items, score });
}
const nearest = (target) => COMBOS.reduce((best, x) => (Math.abs(x.score - target) < Math.abs(best.score - target) ? x : best), COMBOS[0]);
const FOODS = ['vegetables_all', 'root_vegetables', 'whole_grains', 'nuts_and_seeds', 'legumes', 'berries'];
const DRINKS = ['water', 'coffee', 'tea', 'alcohol'];

/**
 * def = {seed, days (in study), adh (0..1), lars:[from, to], steps, gaps:[[fromDay, len]]}. Returns a
 * /getPatientDetail response as the portal sees it after data/api-adapter.js: today's API (ext=false) or v2 (ext=true).
 * One questionnaire per day, priority EQ-5D-5L > monthly > weekly > daily; diary and steps only inside the 730-day API window.
 */
function patientDetail(def, today, ext) {
  const R = rng(def.seed), start = today - def.days, winStart = today - M.C.DIARY_WINDOW_DAYS + 1;
  const d0 = { status: 'ok', patient_code: 'GEN' + def.seed, created_at: iso(start) + 'T09:00:00.123456+00:00', patient_status: 'active',
    lars_scores: [], eq5d5l_scores: [], daily_entries: [], daily_steps: [] };
  if (ext) Object.assign(d0, { server_today: iso(today), eq5d5l_entries: [], monthly_entries: [] });
  const eqDays = new Set(M.C.EQ5D_POINTS.filter((p) => p < def.days).map((p) => start + p + Math.floor(R() * 3)));
  for (let d = start; d < today; d++) {
    const di = d - start, gap = (def.gaps || []).some(([a, len]) => di >= a && di < a + len);
    if (def.steps && !gap && d >= winStart && R() > 0.05) d0.daily_steps.push({ date: iso(d), steps: Math.round(def.steps * (0.8 + 0.4 * R())) });
    if (gap || R() > def.adh) continue;
    const prog = di / Math.max(1, def.days);
    if (eqDays.has(d)) {
      const lv = [0, 1, 2, 3, 4].map(() => Math.min(4, Math.floor(R() * 3 + (1 - prog))));
      const vas = Math.round(55 + 30 * prog + (R() - 0.5) * 10);
      d0.eq5d5l_scores.push({ date: iso(d), score: vas });
      if (ext) d0.eq5d5l_entries.push({ date: iso(d), mobility: lv[0], self_care: lv[1], usual_activities: lv[2], pain_discomfort: lv[3], anxiety_depression: lv[4], health_vas: vas });
    } else if (di % 28 === 20) {
      if (ext) d0.monthly_entries.push({ date: iso(d), qol_score: 6, avoid_travel: 1 + Math.floor(R() * 4), avoid_social: 1 + Math.floor(R() * 4),
        embarrassed: 1 + Math.floor(R() * 4), worry_notice: 1 + Math.floor(R() * 4), depressed: 1 + Math.floor(R() * 4), control: Math.floor(R() * 11), satisfaction: Math.floor(R() * 11) });
    } else if (di % 7 === 3) {
      const target = def.lars[0] + (def.lars[1] - def.lars[0]) * prog + (R() - 0.5) * 6;
      const c = nearest(target);
      d0.lars_scores.push(ext ? Object.assign({ date: iso(d), score: c.score, calculated: false }, c.items) : { date: iso(d), score: c.score });
    } else if (d >= winStart) {
      const row = { date: iso(d), stool_count: R() < 0.08 ? 0 : 1 + Math.floor(R() * 7), bristol_scale: R() < 0.1 ? null : 1 + Math.floor(R() * 7),
        bloating: Math.floor(R() * 11), impact_score: Math.floor(R() * 11), food: {}, drink: {} };
      FOODS.forEach((k) => { row.food[k] = Math.floor(R() * 4); });
      DRINKS.forEach((k) => { row.drink[k] = Math.floor(R() * 5); });
      if (ext) Object.assign(row, { pads_used: Math.floor(R() * 3), urgency: R() < 0.4 ? 'Yes' : 'No', night_stools: R() < 0.2 ? 'Yes' : 'No',
        incomplete_evacuation: R() < 0.3 ? 'Yes' : 'No', leakage: ['None', 'None', 'Liquid', 'Solid'][Math.floor(R() * 4)] });
      d0.daily_entries.push(row);
    }
  }
  if (ext && d0.lars_scores.length > 2) Object.assign(d0.lars_scores[1], { calculated: true });   // A9: total calculated from the answers
  return d0;
}

/** Card view models, built with ILARS_METRICS the way data/patient-model.js does (the builders' input contract). */
function models(detail, rangeKey, mode, opts = NOW) {
  const caps = M.detailCaps(detail);
  const today = M.todayDay(detail.server_today, opts.nowMs);
  const startDay = M.dayFromTimestamp(detail.created_at);
  const byDay = (a, b) => a.day - b.day;
  const lars = M.larsSeries(detail.lars_scores);
  const eq = M.eqEntries(detail);
  const daily = (detail.daily_entries || []).map((r) => Object.assign({ day: M.parseDay(r.date) }, r)).sort(byDay);
  const monthly = caps.monthly ? detail.monthly_entries.map((r) => Object.assign({ day: M.parseDay(r.date) }, r)).sort(byDay) : null;
  const steps = M.dailyPoints(detail.daily_steps, 'steps');
  const act = M.activityMap({ daily: daily.map((r) => r.day), weekly: lars.map((r) => r.day), monthly: (monthly || []).map((r) => r.day), eq5d5l: eq.map((r) => r.day) }, today);
  const visits = M.eqMilestones(startDay, eq.map((e) => e.day), today).filter((m) => m.status === 'done' || m.status === 'missed').map((m) => {
    const e = m.status === 'done' ? eq.find((x) => x.day === m.day) : null;
    return { point: m.point, status: m.status, day: e ? e.day : null, levels: e ? e.levels : null, vas: e ? e.vas : null };
  });
  const range = M.rangeWindow(rangeKey, startDay, today), from = range.from, to = range.to;
  const inR = (p) => p.day >= from && p.day <= to;
  const stool = M.dailyPoints(daily, 'stool_count'), bristol = M.dailyPoints(daily, 'bristol_scale');
  const bloating = M.dailyPoints(daily, 'bloating'), impact = M.dailyPoints(daily, 'impact_score');
  const ref = mode === 'study' ? startDay : mode === 'surgery' ? startDay - 40 : null;
  return {
    today, startDay, range, act, ctx: ctxFor(mode, ref),
    cm: {
      lars: { points: lars, median: M.rollingMedianSeries(lars), firstScore: lars.length ? lars[0].score : null, preop: opts.preop == null ? null : opts.preop, from, to },
      eq: { visits },
      q: { from, to, today, act },
      stool: { from, to, stool, mean: M.rollingMeanSeries(stool, from, to), pads: caps.dailySymptoms ? M.dailyPoints(daily, 'pads_used') : null, act },
      raster: caps.dailySymptoms ? { from, to, rows: daily.filter(inR) } : null,
      bristol: { from, to, stats: M.bristolStats(bristol.filter(inR)), weekly: M.buckets(bristol, from, to, M.isoWeekStart, 7, 'count').map((b) => {
        const st = M.bristolStats(bristol.filter((p) => p.day >= b.start && p.day < b.start + 7 && inR(p)));
        return { start: b.start, n: st.n, counts: st.zones };
      }) },
      symptoms: { from, to, bloating, impact, bloatingMean: M.rollingMeanSeries(bloating, from, to), impactMean: M.rollingMeanSeries(impact, from, to) },
      diet: { from, to, rows: daily.filter(inR) },
      monthly: monthly ? { from, to, rows: monthly } : null,
      steps: { from, to, steps, mean: M.rollingMeanSeries(steps, from, to) }
    }
  };
}

const rendered = new Set();
/** Every patient builder for one model; returns {name: option}. */
function patientOptions(m, w = 900) {
  const { cm, ctx } = m;
  const o = {
    larsTrend: O.larsTrend(cm.lars, ctx, 'd'), larsItems: O.larsItems(cm.lars, ctx, 'd'), larsShare: O.larsShare(cm.lars, ctx, 'd'),
    eqProfile: O.eqProfile(cm.eq, ctx, 'd', w), eqVas: O.eqVas(cm.eq, ctx, 'd', w), eqLevels: O.eqLevels(cm.eq, ctx, 'd'),
    questionnaireCalendar: O.questionnaireCalendar(cm.q, ctx, 'd', w), questionnaireWeekly: O.questionnaireWeekly(cm.q, ctx, 'd'),
    stoolTrend: O.stoolTrend(cm.stool, ctx, 'd'), stoolCalendar: O.stoolCalendar(cm.stool, ctx, 'd', w),
    bristolTypes: O.bristolTypes(cm.bristol, ctx, 'd'), bristolZones: O.bristolZones(cm.bristol, ctx, 'd'), bristolWeekly: O.bristolWeekly(cm.bristol, ctx, 'd'),
    symptomsTrend: O.symptomsTrend(cm.symptoms, ctx, 'd'), symptomsDistribution: O.symptomsDistribution(cm.symptoms, ctx, 'd'),
    dietHeat: O.dietHeat(cm.diet, ctx, 'd', w), dietFrequency: O.dietFrequency(cm.diet, ctx, 'd'),
    stepsDaily: O.stepsDaily(cm.steps, ctx, 'd'), stepsWeekly: O.stepsWeekly(cm.steps, ctx, 'd')
  };
  if (cm.raster) o.symptomRaster = O.symptomRaster(cm.raster, ctx, 'd');
  if (cm.monthly) { o.monthlyBurden = O.monthlyBurden(cm.monthly, ctx, 'd', w); o.monthlyScores = O.monthlyScores(cm.monthly, ctx, 'd'); }
  return o;
}
function renderAll(opts) {
  const svgs = {};
  for (const [name, option] of Object.entries(opts)) { svgs[name] = render(option); rendered.add(name); }
  return svgs;
}

const emptyDetail = (ext) => patientDetail({ seed: 1, days: 0, adh: 0, lars: [30, 30] }, TODAY, ext);
const axes = (o) => [].concat(o.xAxis || [], o.yAxis || []);
const walk = (v, fn, k) => { fn(v, k); if (v && typeof v === 'object') for (const key of Object.keys(v)) walk(v[key], fn, key); };

// ------------------------------------------------------------------ patient dashboard
test('brand-new patient (day 0, nothing filled): every builder renders in both APIs and all axis modes', SSR, () => {
  for (const ext of [false, true]) for (const mode of ['date', 'study', 'surgery']) {
    const opts = patientOptions(models(emptyDetail(ext), 'all', mode, NOW));
    assert.equal(Object.keys(opts).length, ext ? 21 : 19);
    renderAll(opts);
  }
});

test('single score, single EQ-5D visit, one diary day: a real zero is a --viz-zero stub, null Bristol is skipped', SSR, () => {
  const d = emptyDetail(true);
  d.created_at = '2026-09-20T08:00:00+00:00';
  d.lars_scores = [{ date: '2026-09-22', score: 31, urgency_to_toilet: 2, repeat_bowel_opening: 1, flatus_control: 0, bowel_frequency: 2, liquid_stool_leakage: 1 }];
  d.eq5d5l_entries = [{ date: '2026-09-20', mobility: 0, self_care: 0, usual_activities: 1, pain_discomfort: 2, anxiety_depression: 1, health_vas: 60 }];
  d.eq5d5l_scores = [{ date: '2026-09-20', score: 60 }];
  d.daily_entries = [{ date: '2026-09-21', food: { water: 3 }, drink: { coffee: 1 }, bristol_scale: null, stool_count: 0, bloating: 0, impact_score: 2,
    pads_used: 0, urgency: 'No', night_stools: 'No', leakage: 'None', incomplete_evacuation: 'Yes' }];
  const m = models(d, '1m', 'date', NOW);
  assert.equal(m.cm.bristol.stats.n, 0);                                         // null Bristol is not type 1
  const opts = patientOptions(m);
  const zero = opts.stoolTrend.series[0].data.find((x) => x.value[1] === 0);
  assert.equal(zero.itemStyle.color, TOK.zero);                                  // 0 is drawn, in --viz-zero
  const svgs = renderAll(opts);
  assert.ok(svgs.stoolTrend.includes('fill="' + TOK.zero + '"'));
});

test('400-day synthetic history renders in every range × axis mode × API', SSR, () => {
  for (const ext of [true, false]) {
    const d = patientDetail({ seed: 7, days: 400, adh: 0.8, lars: [38, 18], steps: 6000, gaps: [[100, 20]] }, TODAY, ext);
    for (const rk of ['1m', '3m', '6m', '1y', 'all']) for (const mode of ['date', 'study', 'surgery']) renderAll(patientOptions(models(d, rk, mode)));
  }
});

test('Patterns toggle on (aria decals) and motion allowed: every builder still renders', SSR, () => {
  const m = models(patientDetail({ seed: 8, days: 200, adh: 0.8, lars: [32, 24], steps: 5000 }, TODAY, true), 'all', 'date');
  m.ctx = Object.assign({}, m.ctx, { patterns: true, reduced: false });
  const opts = patientOptions(m);
  assert.equal(opts.larsTrend.aria.decal.show, true);
  assert.equal(opts.larsTrend.animation, true);
  renderAll(opts);
});

test('A24: a 900-day history clips every diary card to the 730-day window; no missed days before it', SSR, () => {
  for (const ext of [true, false]) {
    const d = patientDetail({ seed: 11, days: 900, adh: 0.85, lars: [36, 22], steps: 7000 }, TODAY, ext);
    const m = models(d, 'all', 'date');
    const win = TODAY - 729;
    assert.equal(m.range.from, TODAY - 900);
    const dr = M.diaryRange(m.range, m.startDay, TODAY);
    assert.deepEqual([dr.from, dr.clipped], [win, true]);                        // the view shows "Diary: last 2 years"
    const opts = patientOptions(m);
    const xMin = (o) => [].concat(o.xAxis)[0].min;
    for (const name of ['stoolTrend', 'bristolWeekly', 'symptomsTrend', 'stepsDaily', 'stepsWeekly', 'questionnaireWeekly']) {
      assert.equal(xMin(opts[name]), (win - 0.5) * DAY, name + ' starts at the diary window');
    }
    assert.equal(xMin(opts.larsTrend), (TODAY - 900 - 0.5) * DAY);              // LARS keeps the full range
    // diet (> 26 weeks: 4-week blocks from the range start): the first block starts at the window, no "no diary" cell before it
    const cols = opts.dietHeat.xAxis.data;
    assert.equal(cols[0], win);
    const missingCols = new Set(opts.dietHeat.series[1].data.map((c) => cols[c[0]]));
    missingCols.forEach((start) => assert.ok(start + 6 >= win, 'no dashed diet cell before the window'));
    // questionnaires: weeks before the window are not "0 of 7 days"
    assert.ok(opts.questionnaireWeekly.series[0].data.every((p) => p[0] >= (M.isoWeekStart(win) - 1) * DAY));
    const a = M.adherenceInRange(m.act, m.startDay, m.range.from, m.range.to, TODAY);
    assert.equal(a.expected, 729);                                                 // window .. yesterday
    renderAll(opts);
  }
});

test('A9: a weekly score calculated from the answers says so in the tooltip', SSR, () => {
  const d = patientDetail({ seed: 5, days: 120, adh: 0.95, lars: [30, 24] }, TODAY, true);
  const m = models(d, 'all', 'date');
  const calc = m.cm.lars.points.find((p) => p.calculated);
  assert.ok(calc, 'the generated v2 history has one calculated row');
  const opt = O.larsTrend(m.cm.lars, m.ctx, 'd');
  const fmt = opt.tooltip.formatter;
  const x = calc.day * DAY;
  const html = fmt([{ seriesId: 'lars', value: [x, calc.score] }]);
  assert.ok(html.includes(t('doctor.cm.lars.calculated')));
  if (lookup('doctor.cm.lars.calculated')) assert.ok(html.includes('calculated from answers'));
  const other = m.cm.lars.points.find((p) => !p.calculated);
  assert.ok(!fmt([{ seriesId: 'lars', value: [other.day * DAY, other.score] }]).includes(t('doctor.cm.lars.calculated')));
  render(opt);
});

test('A6: EQ-5D-5L profile labels each follow-up vs day 0 and titles the row', SSR, () => {
  const ctx = ctxFor('date', null);
  const v = (point, levels) => ({ point, status: levels ? 'done' : 'missed', day: levels ? TODAY - 200 + point : null, levels, vas: levels ? 60 : null });
  const opt = O.eqProfile({ visits: [v(0, [3, 2, 3, 3, 2]), v(14, [2, 2, 3, 3, 2]), v(30, null), v(90, [3, 2, 3, 3, 2]), v(180, [2, 3, 3, 3, 2])] }, ctx, 'd', 900);
  assert.deepEqual(opt.xAxis[1].data, ['', t('doctor.cm.eq.pchc_better'), '', t('doctor.cm.eq.pchc_same'), t('doctor.cm.eq.pchc_mixed')]);
  assert.equal(opt.graphic[0].style.text, t('doctor.cm.eq.pchc_row'));
  if (lookup('doctor.cm.eq.pchc_row')) assert.equal(opt.graphic[0].style.text, 'vs day 0');
  // in-cell numbers: ink follows the level fill
  opt.series[0].data.forEach((c) => assert.equal(c.label.color, TOK.eqLevelText[c.value[2] - 1]));
  const late = O.eqProfile({ visits: [v(0, null), v(14, [1, 1, 1, 1, 1]), v(30, [1, 2, 1, 1, 1])] }, ctx, 'd', 900);
  assert.equal(late.graphic[0].style.text, t('doctor.cm.eq.pchc_row_n', { n: 14 }));   // never claims "day 0" when it was missed
  assert.equal(O.eqProfile({ visits: [v(0, [1, 1, 1, 1, 1])] }, ctx, 'd', 900).graphic, undefined);
  render(opt); render(late);
});

test('A27: questionnaire calendar — per-type pattern (daily none, weekly hatch, monthly dots, EQ ring) and the missed-day series', SSR, () => {
  const d = patientDetail({ seed: 3, days: 120, adh: 0.8, lars: [30, 25] }, TODAY, true);
  const m = models(d, '3m', 'date');
  const opt = O.questionnaireCalendar(m.cm.q, m.ctx, 'd', 900);
  const byType = {};
  opt.series[0].data.forEach((item) => { byType[['daily', 'weekly', 'monthly', 'eq5d5l'][item.value[1] - 1]] = item.itemStyle.decal; });
  assert.deepEqual(Object.keys(byType).sort(), ['eq5d5l', 'monthly', 'weekly']);
  // lead decision: a daily-diary day is a calm cell (light fill, 1 px solid edge in --viz-cal-daily), its own series
  const daily = opt.series.find((s) => s.id === 'q-daily');
  const dailyDays = [...m.cm.q.act].filter(([day, type]) => type === 'daily' && day >= M.parseDay(opt.calendar.range[0])).map(([day]) => iso(day)).sort();
  assert.ok(dailyDays.length > 0, 'the fixture has daily-diary days');
  assert.deepEqual(daily.data.map(([day]) => day).sort(), dailyDays);
  assert.equal(byType.weekly.symbol, 'rect'); assert.ok(byType.weekly.rotation);
  assert.equal(byType.monthly.symbol, 'circle');
  assert.match(byType.eq5d5l.symbol, /^path:\/\//);
  assert.deepEqual([byType.eq5d5l.dashArrayX[0][0], byType.eq5d5l.dashArrayY[0]], opt.calendar.cellSize);   // ring tile = one cell
  assert.equal(opt.calendar.left % opt.calendar.cellSize[0], 0);
  assert.equal(opt.calendar.top % opt.calendar.cellSize[1], 0);
  // missed days are their own series drawn above the cells (a calendar day border would be painted over by the
  // white gap of the neighbouring filled cells): only tracked days before today without a questionnaire
  const missed = opt.series.find((s) => s.id === 'missed');
  assert.ok(missed && missed.type === 'custom' && missed.z > (opt.series[0].z || 0), 'missed-day series above the cells');
  const filled = new Set(opt.series[0].data.map((item) => item.value[0]));
  assert.ok(missed.data.length > 0, 'the fixture has missed days');
  missed.data.forEach(([day]) => {
    assert.ok(!filled.has(day), day + ' has a questionnaire but is drawn as missed');
    assert.ok(M.parseDay(day) < TODAY, day + ' (today or later) drawn as missed');
  });
  const svg = render(opt);
  const patterns = svg.match(/<pattern[\s\S]*?<\/pattern>/g) || [];
  assert.ok(patterns.some((p) => /patternTransform="rotate\(/.test(p)), 'weekly hatch in the SVG');
  assert.ok(patterns.filter((p) => /<path d="M[^"]*A/.test(p)).length >= 2, 'monthly dots and the EQ ring in the SVG');
  const dashed = (svg.match(/<path [^>]*>/g) || []).filter((p) => p.includes('stroke="' + TOK.calMissed + '"') && /stroke-dasharray="2[, ]+2"/.test(p));
  assert.equal(dashed.length, missed.data.length, 'one dashed --viz-cal-missed-border cell per missed day');
  const edged = (svg.match(/<path [^>]*>/g) || []).filter((p) => p.includes('stroke="' + TOK.q.daily + '"') && !/stroke-dasharray/.test(p));
  assert.equal(edged.length, daily.data.length, 'one solid --viz-cal-daily edge per daily-diary day');
  assert.ok(!svg.includes('fill="' + TOK.q.daily + '"'), 'no solid --viz-cal-daily block');
  // the Weekly view draws the same looks: calm daily segments, the legend's patterns on the other types
  const wk = O.questionnaireWeekly(m.cm.q, m.ctx, 'd');
  const style = Object.fromEntries(wk.series.map((s) => [s.id, s.itemStyle]));
  assert.equal(style['qw-daily'].borderColor, TOK.q.daily); assert.notEqual(style['qw-daily'].color, TOK.q.daily);
  assert.equal(style['qw-weekly'].decal.symbol, 'rect'); assert.equal(style['qw-monthly'].decal.symbol, 'circle');
  assert.match(style['qw-eq5d5l'].decal.symbol, /^path:\/\//);
  render(wk);
});

test('tokens: axis labels use --viz-axis-label; no clone morph anywhere (A7)', SSR, () => {
  const d = patientDetail({ seed: 9, days: 300, adh: 0.8, lars: [34, 20], steps: 5000 }, TODAY, true);
  const opts = patientOptions(models(d, 'all', 'date'));
  for (const [name, o] of Object.entries(opts)) {
    axes(o).forEach((a) => { if (a.show !== false && (!a.axisLabel || a.axisLabel.show !== false)) assert.equal(a.axisLabel.color, TOK.ink3, name + ' axis label colour'); });
    if (o.calendar) { assert.equal(o.calendar.dayLabel.color, TOK.ink3); assert.equal(o.calendar.monthLabel.color, TOK.ink3); }
    walk(o, (v, k) => assert.notEqual(k, 'universalTransition', name + ' has universalTransition'));
  }
  for (const f of CHART_FILES) assert.doesNotMatch(fs.readFileSync(f, 'utf8'), /universalTransition\s*:|divideShape\s*:/);
});

test('calm look: single-colour bars are tinted with a full-colour edge; heat tables stay on --viz-seq-100…600', SSR, () => {
  const d = patientDetail({ seed: 4, days: 300, adh: 0.85, lars: [34, 20], steps: 5000 }, TODAY, true);
  const m = models(d, 'all', 'date');
  const opts = patientOptions(m);
  const weekly = opts.stoolTrend.series[0];                                      // > 92 days: weekly mean bars
  assert.equal(weekly.itemStyle.borderColor, TOK.metricDiary);
  assert.notEqual(weekly.itemStyle.color, TOK.metricDiary);
  assert.equal(weekly.emphasis.itemStyle.color, TOK.metricDiary);               // full colour on hover
  const calm = TOK.seq.slice(0, 6);
  for (const name of ['dietHeat', 'stoolCalendar', 'symptomRaster', 'monthlyBurden']) {
    opts[name].visualMap.pieces.forEach((p) => assert.ok(calm.includes(p.color), name + ' uses ' + p.color));
  }
  opts.symptomsDistribution.series.forEach((s) => assert.ok(calm.includes(s.itemStyle.color)));
  // in-cell ink: dark-step ink only on step 600
  opts.dietHeat.series[0].data.forEach((c) => assert.equal(c.label.color, c.value[2] > 6 ? TOK.seqInkDark : TOK.seqInkLight));
  opts.monthlyBurden.series[0].data.forEach((c) => assert.equal(c.label.color, c.value[2] === 4 ? TOK.seqInkDark : TOK.seqInkLight));
  renderAll(opts);
});

// ------------------------------------------------------------------ cohort overview
function cohortRows(n, ext, seed) {
  const R = rng(seed), rows = [];
  for (let i = 0; i < n; i++) {
    const days = 10 + Math.floor(R() * 330), score = R() < 0.15 ? null : Math.floor(R() * 43);
    const r = { patient_code: 'C' + i, created_at: iso(TODAY - days) + 'T10:00:00+00:00', status: ['active', 'active', 'active', 'inactive', 'dead'][i % 5],
      doctor_code: i % 2 ? 'DME001' : 'DOT002', weekly_count: Math.floor(days / 9), daily_count: Math.floor(days * 0.6), monthly_count: Math.floor(days / 30),
      last_lars_score: score, last_lars_date: score == null ? null : iso(TODAY - Math.floor(R() * 20)),
      last_eq5d5l_score: R() < 0.2 ? null : 40 + Math.floor(R() * 55), last_eq5d5l_date: iso(TODAY - Math.floor(R() * 60)) };
    if (ext) Object.assign(r, { lars_recent: [], first_lars_score: score, first_lars_date: r.last_lars_date, vas_recent: [], eq5d5l_count: 2,
      last_eq5d5l_entry_date: r.last_eq5d5l_date, last_daily_date: iso(TODAY - Math.floor(R() * 12)), last_weekly_date: null, last_monthly_date: null,
      adherence_days_with_entry: Math.floor(R() * 31), adherence_days_expected: 30, server_today: iso(TODAY) });
    rows.push(r);
  }
  return rows;
}
/** Shape of ILARS_DATA.cohortTrajectory(): 4-week blocks; block 2 has n < 5 (must not be drawn). */
const TRAJ = { blocks: [
  { block: 0, week: 0, n: 17, median: 30, q1: 25, q3: 34, none: 3, minor: 6, major: 8 },
  { block: 1, week: 4, n: 15, median: 27.5, q1: 22, q3: 32, none: 4, minor: 6, major: 5 },
  { block: 2, week: 8, n: 4, median: 25, q1: 20, q3: 30, none: 1, minor: 2, major: 1 },
  { block: 3, week: 12, n: 9, median: 24, q1: 19, q3: 29, none: 4, minor: 3, major: 2 }
], paired: null };

test('cohort builders: empty, one-patient and normal cohorts, both APIs', SSR, () => {
  const ctx = ctxFor('date', null);
  for (const ext of [false, true]) for (const rows of [[], cohortRows(1, ext, 2), cohortRows(40, ext, 3)]) {
    const all = rows.map((r) => M.summarizeListRow(r, { today: TODAY, meDoctorCode: 'DME001' }));
    const stats = M.cohortStats(all, TODAY);
    const startDays = all.map((s) => s.startDay);
    const from = startDays.length ? Math.min(...startDays) : TODAY - 30;
    const vrows = all.filter((s) => s.status === 'active' && s.vas.latest != null).map((s) => ({ label: s.code, vas: s.vas.latest }));
    const opts = {
      cohortLarsDonut: O.cohortLarsDonut(stats, ctx, 'd'), cohortLarsHistogram: O.cohortLarsHistogram(stats, ctx, 'd'),
      cohortAdherenceHistogram: O.cohortAdherenceHistogram(stats, ctx, 'd'),
      cohortAdherenceByPatient: O.cohortAdherenceByPatient(all.filter((s) => s.adherence.ratio != null).map((s) => ({ label: '<b>' + s.code, code: s.code, ratio: s.adherence.ratio })), ctx, 'd'),
      enrolmentCumulative: O.enrolmentCumulative({ series: M.enrolmentSeries(startDays), from, to: TODAY }, ctx, 'd'),
      enrolmentMonthly: O.enrolmentMonthly({ startDays, from, to: TODAY }, ctx, 'd'),
      vasStrip: O.vasStrip(vrows, ctx, 'd'), vasHistogram: O.vasHistogram(vrows, ctx, 'd'),
      cohortTrajectory: O.cohortTrajectory(ext ? TRAJ : { blocks: [] }, ctx, 'd'), cohortCategoryShare: O.cohortCategoryShare(ext ? TRAJ : { blocks: [] }, ctx, 'd')
    };
    for (const [name, o] of Object.entries(opts)) axes(o).forEach((a) => { if (a.show !== false && (!a.axisLabel || a.axisLabel.show !== false)) assert.equal(a.axisLabel.color, TOK.ink3, name); });
    renderAll(opts);
  }
});

test('A17: donut percentages are of patients with a score; "No score yet" shows no percentage', SSR, () => {
  const stats = { larsCategories: { none: 5, minor: 5, major: 4, nodata: 3 } };
  const opt = O.cohortLarsDonut(stats, ctxFor('date', null), 'd');
  const s = opt.series[0], fmt = s.label.formatter;
  const pct = (cat) => fmt({ value: stats.larsCategories[cat], data: s.data.find((x) => x.cat === cat) });
  assert.deepEqual(['none', 'minor', 'major', 'nodata'].map(pct), ['36%', '36%', '29%', '']);   // 4 of 14 = 29 %, like the KPI
  assert.equal(s.data.find((x) => x.cat === 'nodata').label.show, false);
  render(opt);
});

test('A1: LARS since registration in 4-week blocks — a label under every block, tooltip "Weeks 0–3 · 17 patients", n < 5 not drawn', SSR, () => {
  const opt = O.cohortTrajectory(TRAJ, ctxFor('date', null), 'd');
  const strip = opt.xAxis[1].axisLabel;
  assert.deepEqual(strip.customValues, [0, 1, 2, 3]);
  assert.deepEqual(strip.customValues.map(strip.formatter), ['0–3', '4–7', '8–11', '12–15']);
  const median = opt.series.find((x) => x.id === 'median').data;
  assert.equal(median[2][1], null);                                              // block with 4 patients: gap, not a point
  assert.equal(opt.series.find((x) => x.id === 'n').data[2][1], null);
  const tip = opt.tooltip.formatter([{ value: [0, 30] }]);
  const head = t('doctor.cm.ov.traj_block', { from: 0, to: 3 }) + ' · ' + tp('doctor.cm.common.n_patients', 17, { n: 17 });
  assert.ok(tip.includes(head));
  if (lookup('doctor.cm.ov.traj_block')) assert.ok(tip.includes('Weeks 0–3 · 17 patients'));
  const svg = render(opt, 900, 320);
  ['0–3', '4–7', '8–11', '12–15'].forEach((l) => assert.ok(svg.includes('>' + l + '<'), 'label ' + l + ' under its block'));
  const share = O.cohortCategoryShare(TRAJ, ctxFor('date', null), 'd');
  assert.deepEqual(share.xAxis.data, ['0–3', '4–7', '12–15']);
  render(share);
});

test('A1: the n strip, its block labels and the median points share one x per block at every card width', SSR, () => {
  const traj = { blocks: [0, 1, 2, 3, 4, 5, 6, 7].map((b) => ({ block: b, week: b * 4, n: b === 2 ? 4 : 24 - b, median: 28 - b / 2, q1: 23, q3: 33, none: 5, minor: 8, major: 9 })) };
  const ctx = ctxFor('date', null);
  for (const w of [360, 600, 900, 1300]) {
    const c = echarts.init(null, null, { renderer: 'svg', ssr: true, width: w, height: 320 });
    try {
      c.setOption(O.cohortTrajectory(traj, ctx, 'd'), true);
      const svg = c.renderToSVGString();
      const textX = (re) => new Map([...svg.matchAll(re)].map((m) => [m[2], +m[1]]));
      const labels = textX(/<text[^>]*transform="translate\(([\d.]+) [\d.]+\)"[^>]*>(\d+–\d+)<\/text>/g);
      const counts = textX(/<text[^>]*transform="translate\(([\d.]+) [\d.]+\)"[^>]*>(n \d+)<\/text>/g);
      for (const r of traj.blocks) {
        const x = c.convertToPixel({ xAxisIndex: 0 }, r.block);                         // median point / band column
        assert.ok(Math.abs(c.convertToPixel({ xAxisIndex: 1 }, r.block) - x) < 0.01, w + 'px: strip axis = main axis at block ' + r.block);
        assert.ok(Math.abs(labels.get(r.block * 4 + '–' + (r.block * 4 + 3)) - x) < 0.5, w + 'px: label under block ' + r.block);
        if (r.n >= M.C.COHORT_MIN_N) assert.ok(Math.abs(counts.get('n ' + r.n) - x) < 0.5, w + 'px: "n ' + r.n + '" over block ' + r.block);
        else assert.ok(!counts.has('n ' + r.n), 'block with n < 5 has no strip column');
      }
    } finally { c.dispose(); }
  }
});

/** Elements whose fill disappears when ECharts puts them into the emphasis (hover) state. */
function fillsLostOnEmphasis(option, w = 900, h = 300) {
  const c = echarts.init(null, null, { renderer: 'svg', ssr: true, width: w, height: h });
  try {
    c.setOption(option, true);
    const lost = [];
    c.getZr().storage.getDisplayList(true).forEach((el) => {
      const fill = el.style && el.style.fill;
      if (!fill || fill === 'none' || !(el.stateProxy || (el.states && el.states.emphasis))) return;
      el.useState('emphasis');
      if (!el.style.fill || el.style.fill === 'none') lost.push(el.type + ' ' + fill);
      el.clearStates();
    });
    return lost;
  } finally { c.dispose(); }
}

test('hover: no chart element loses its fill in the emphasis state (real space-syntax tokens such as --viz-band-neutral)', SSR, () => {
  const tok = Object.assign({}, TOK, { bandNeutral: 'rgb(118 118 128 / 0.10)', hover: 'rgb(118 118 128 / 0.06)', hairline: 'rgb(0 0 0 / 0.08)' });
  const m = models(patientDetail({ seed: 13, days: 240, adh: 0.85, lars: [34, 22], steps: 5000 }, TODAY, true), 'all', 'date');
  m.ctx = Object.assign({}, m.ctx, { tok });
  const ctx = Object.assign(ctxFor('date', null), { tok });
  const opts = Object.assign(patientOptions(m), { cohortTrajectory: O.cohortTrajectory(TRAJ, ctx, 'd'), cohortCategoryShare: O.cohortCategoryShare(TRAJ, ctx, 'd') });
  for (const [name, o] of Object.entries(opts)) assert.deepEqual(fillsLostOnEmphasis(o), [], name);
  // the check is not vacuous: the IQR band without `emphasis.disabled` loses its fill exactly as in the browser
  const broken = O.cohortTrajectory(TRAJ, ctx, 'd');
  broken.series.forEach((s) => { delete s.emphasis; });
  assert.deepEqual(fillsLostOnEmphasis(broken).length, 1);
});

test('Bristol over time: weekly stacks up to 26 weeks, then 4-week blocks (no 1 px hairlines at 1Y / All)', SSR, () => {
  const d = patientDetail({ seed: 12, days: 420, adh: 0.85, lars: [34, 22] }, TODAY, true);
  for (const [rk, size] of [['1m', 7], ['3m', 7], ['1y', 28], ['all', 28]]) {
    const m = models(d, rk, 'date');
    const o = O.bristolWeekly(m.cm.bristol, m.ctx, 'd');
    const xs = o.series[0].data.map((p) => p[0] / DAY - size / 2);                  // bar centre -> block start
    const inner = xs.slice(1, -1);                                                  // full blocks
    inner.slice(1).forEach((x, i) => assert.equal((x - inner[i]) % size, 0, rk + ': bars ' + size + ' days apart'));
    // a cut first / current block: a whole bar over its own days inside the range (base XV), never past the axis
    const { from, to } = m.cm.bristol;
    assert.ok(xs[0] + size / 2 >= from && xs[xs.length - 1] + size / 2 <= to + 1, rk + ': edge bars inside the range');
    if (size === 28) assert.ok(xs.length <= 27, rk + ': at most 27 blocks');
    const head = o.tooltip.formatter([{ dataIndex: 0, value: o.series[0].data[0], color: '#000', seriesName: 'x' }]);
    assert.ok(head.includes(t(size === 7 ? 'doctor.cm.common.week_of' : 'doctor.cm.common.block_of', { date: fmtDay(M.isoWeekStart(from), 'short') })), rk + ' tooltip head');
    o.series[0].data.forEach((p, i) => assert.equal(p[1] + o.series[1].data[i][1] + o.series[2].data[i][1] <= 101, true));
    render(o, 320, 260);
  }
});

test('donuts: one slice draws a closed ring (no pad gap); outside labels never truncate', SSR, () => {
  const ctx = ctxFor('date', null);
  const lars = (scores) => O.larsShare({ points: scores.map((s, i) => ({ day: TODAY - 7 * i, score: s })), median: [], from: TODAY - 60, to: TODAY }, ctx, 'd');
  const zones = (z) => O.bristolZones({ stats: { zones: z, normalShare: 0.5, n: 10, counts: [] } }, ctx, 'd');
  const cohort = (c) => O.cohortLarsDonut({ larsCategories: c }, ctx, 'd');
  const cases = [[lars([25, 24, 26]), 0], [lars([25, 35]), 1.5], [zones({ hard: 0, normal: 6, loose: 0 }), 0], [zones({ hard: 2, normal: 6, loose: 2 }), 1.5],
    [cohort({ none: 0, minor: 4, major: 0, nodata: 0 }), 0], [cohort({ none: 3, minor: 4, major: 2, nodata: 1 }), 1.5]];
  for (const [o, pad] of cases) {
    assert.equal(o.series[0].padAngle, pad);
    assert.equal(o.series[0].label.overflow, 'none');
    render(o, 300, 260);
  }
  // Bristol zones: the centre gives the normal share, so the normal slice has no outside label (r2 VIS-40)
  const z3 = zones({ hard: 2, normal: 6, loose: 2 }).series[0].data;
  assert.deepEqual(z3.map((d) => !(d.label && d.label.show === false)), [true, false, true]);
});

test('diet: the week that holds today is still open (no "no diary" cells); an empty past week keeps its dashed cells', SSR, () => {
  const ctx = ctxFor('date', null);
  const row = (day) => ({ day, food: { vegetables_all: 2 }, drink: { water: 3 } });
  const rows = [TODAY - 30, TODAY - 29, TODAY - 22, TODAY - 9, TODAY - 8].map(row);    // nothing in the week of TODAY - 16, nothing this week
  const o = O.dietHeat({ from: TODAY - 30, to: TODAY, today: TODAY, rows }, ctx, 'd', 900);
  const cols = o.xAxis.data, missingCols = new Set(o.series[1].data.map((c) => cols[c[0]]));
  assert.ok(!missingCols.has(M.isoWeekStart(TODAY)), 'current week not marked as missed');
  assert.ok(missingCols.has(M.isoWeekStart(TODAY - 16)), 'past empty week still marked');
  assert.equal(o.series[1].data.length, O.DIET_ROWS.length);
  render(o);
});

test('EQ visit axes fit the card: wrapped dimension names, then shorter dates, then staggered labels', SSR, () => {
  const ctx = ctxFor('date', null);
  const start = TODAY - 500;
  const visits = M.C.EQ5D_POINTS.map((p, i) => ({ point: p, status: 'done', day: start + p, levels: [1 + (i % 3), 2, 2, 3, 1], vas: 60 + i }));
  const vm = { visits };
  const plain = (s) => s.replace(/\{d\|([^}]*)\}/, '$1').split('\n');
  // wide card: "Day N" over the full date, no staggering
  const wide = O.eqProfile(vm, ctx, 'd', 900);
  assert.equal(wide.grid.left, 132);
  wide.xAxis[0].data.forEach((s, i) => assert.deepEqual(plain(s), [t('doctor.cm.eq.visit', { n: visits[i].point }), fmtDay(visits[i].day, 'short')]));
  // medium column (EQ summary in a third-width card), or visits across a new year: the date drops its year, never
  // its day, so two visits of one month never share a label (r2 VIS-39)
  const mid = O.eqLevels(vm, ctx, 'd', 388);
  const dm = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
  mid.xAxis.data.forEach((s, i) => assert.equal(plain(s)[1], dm.format(new Date(visits[i].day * DAY))));
  // Lithuanian: month names, never CLDR's "10-16"
  const lt = O.eqLevels(vm, Object.assign({}, ctx, { lang: 'lt-LT', fmtDay: (d, st) => (st === 'month' ? 'mėn.' : fmtDay(d, st)) }), 'd', 388);
  lt.xAxis.data.forEach((s, i) => assert.equal(plain(s)[1], 'mėn. ' + new Date(visits[i].day * DAY).getUTCDate()));
  // phone: narrower name column (names wrap), no date line, every other label one line lower / higher
  const phone = O.eqProfile(vm, ctx, 'd', 300);
  assert.equal(phone.grid.left, 84);
  assert.deepEqual([phone.yAxis.axisLabel.width, phone.yAxis.axisLabel.overflow], [70, 'break']);
  phone.xAxis[0].data.forEach((s, i) => assert.equal(s, (i % 2 ? '\n' : '') + t('doctor.cm.eq.visit', { n: visits[i].point })));
  phone.xAxis[1].data.forEach((s, i) => assert.ok(i % 2 ? /\n$/.test(s) || s === '' : !/\n/.test(s)));
  assert.equal(phone.grid.top, 40);
  assert.equal(O.eqVas(vm, ctx, 'd', 300).grid.left, 84);                         // VAS keeps the profile's columns
  // no option ever crowds: the default (no width) stays the wide layout
  assert.equal(O.eqLevels(vm, ctx, 'd').xAxis.data[0].includes('{d|'), true);
  [[wide, 900], [mid, 388], [phone, 300]].forEach(([o, w]) => render(o, w, 220));
  render(O.eqVas(vm, ctx, 'd', 300), 300, 220);
});

test('axis labels: a month start shows the short month; a diet column shows its start date, never a month name (r2 VIS-36)', () => {
  const ctx = Object.assign(ctxFor('date', null), { fmtDay: (d, st) => (st === 'month' ? 'MON' : fmtDay(d, st)) });
  const may1 = M.parseDay('2026-05-01'), jan1 = M.parseDay('2026-01-01');
  assert.equal(O._.axisDay(ctx, may1), 'MON');                                   // lt: "rugp.", the form the dates use
  assert.equal(O._.axisDay(ctx, may1 + 7), fmtDay(may1 + 7, 'axis'));
  assert.equal(O._.axisDay(ctx, jan1), fmtDay(jan1, 'axis'));                    // the year on 1 January
  const rows = [may1, may1 + 30, may1 + 60].map((day) => ({ day, food: { legumes: 1 }, drink: { water: 2 } }));
  const heat = O.dietHeat({ from: may1 - 140, to: TODAY, today: TODAY, rows }, ctx, 'd', 900);
  assert.equal(heat.xAxis.axisLabel.formatter(String(may1)), fmtDay(may1, 'short'));
});

test('Bristol types: the zone word under every type, on narrow cards only under types 1, 4 and 7', SSR, () => {
  const vm = { stats: { n: 20, counts: [1, 2, 4, 5, 4, 3, 1], zones: { hard: 3, normal: 13, loose: 4 }, normalShare: 0.65 } };
  const ctx = ctxFor('date', null);
  const zones = (o) => ['1', '2', '3', '4', '5', '6', '7'].map((v) => (o.xAxis.axisLabel.formatter(v).match(/\{z\|([^}]*)\}/) || [])[1] || '');
  const z = (k) => t('doctor.cm.bristol.zone_' + k);
  const wide = O.bristolTypes(vm, ctx, 'd', 620), phone = O.bristolTypes(vm, ctx, 'd', 262);
  assert.deepEqual(zones(wide), [z('hard'), z('hard'), z('normal'), z('normal'), z('normal'), z('loose'), z('loose')]);
  assert.deepEqual(zones(O.bristolTypes(vm, ctx, 'd')), zones(wide));                 // no width: the wide layout
  assert.deepEqual(zones(phone), [z('hard'), '', '', z('normal'), '', '', z('loose')]);
  render(wide, 620, 260); render(phone, 262, 260);
});

test('calendars fit the card: a phone card at 1Y shows the latest weeks instead of cutting them off', SSR, () => {
  const m = models(patientDetail({ seed: 15, days: 400, adh: 0.8, lars: [30, 25] }, TODAY, true), '1y', 'date');
  for (const w of [262, 340, 900]) {
    for (const o of [O.stoolCalendar(m.cm.stool, m.ctx, 'd', w), O.questionnaireCalendar(m.cm.q, m.ctx, 'd', w)]) {
      const cal = o.calendar, from = M.parseDay(cal.range[0]), to = M.parseDay(cal.range[1]);
      const weeks = (M.isoWeekStart(to) - M.isoWeekStart(from)) / 7 + 1;
      assert.ok(cal.left + weeks * cal.cellSize[0] <= w, w + 'px: ' + weeks + ' weeks fit');
      assert.equal(to, TODAY);
      if (w === 900) assert.equal(weeks, M.C.CALENDAR_MAX_WEEKS);
      // a partial first month too narrow for its name stays unlabelled (no "JanFeb")
      const fd = cal.range[0], mm = fd.slice(5, 7);
      const label = cal.monthLabel.formatter({ yyyy: fd.slice(0, 4), MM: mm, M: String(+mm) });
      const daysShown = new Date(Date.UTC(+fd.slice(0, 4), +mm, 0)).getUTCDate() - +fd.slice(8) + 1;
      assert.equal(label === '', daysShown * cal.cellSize[0] / 7 < 26, w + 'px first month label');
      render(o, w, 196);
    }
  }
});

test('calendars: box as tall as the calendar, day numbers in the month view, no month name after tracking ended (r2 VIS-38)', SSR, () => {
  const m = models(patientDetail({ seed: 15, days: 400, adh: 0.8, lars: [30, 25] }, TODAY, true), '6m', 'date');
  for (const [from, w] of [[TODAY - 181, 326], [TODAY - 181, 638], [TODAY - 29, 326], [TODAY - 29, 1336]]) {
    const vm = Object.assign({}, m.cm.q, { from });
    const o = O.questionnaireCalendar(vm, m.ctx, 'd', w), cal = o.calendar;
    const big = O._.calendarBig(from, TODAY), rows = big ? (M.isoWeekStart(TODAY) - M.isoWeekStart(from)) / 7 + 1 : 7;
    assert.equal(O._.calendarHeight(from, TODAY, w), cal.top + rows * cal.cellSize[1], w + 'px: the height the view gives the canvas');
    assert.equal(o.series.some((s) => s.id === 'day-n'), big, 'day numbers only in the month view');
    if (big) assert.equal(o.series.find((s) => s.id === 'day-n').data.length, TODAY - from + 1);
    render(o, w, O._.calendarHeight(from, TODAY, w) + 16);
  }
  assert.ok(O._.calendarHeight(TODAY - 181, TODAY, 326) < 120);                  // a phone's 11 px cells: no 168 px box
  // deceased 45 days ago: the month after the last tracked day has no name over its empty weeks
  const end = M.parseDay('2026-08-17');
  const dead = O.questionnaireCalendar(Object.assign({}, m.cm.q, { from: TODAY - 181, end }), m.ctx, 'd', 638).calendar;
  const label = (iso) => dead.monthLabel.formatter({ yyyy: iso.slice(0, 4), MM: iso.slice(5, 7), M: String(+iso.slice(5, 7)) });
  assert.equal(label('2026-09-01'), '');
  assert.notEqual(label('2026-08-01'), '');
  assert.notEqual(O.questionnaireCalendar(Object.assign({}, m.cm.q, { from: TODAY - 181 }), m.ctx, 'd', 638).calendar.monthLabel
    .formatter({ yyyy: '2026', MM: '09', M: '9' }), '');                         // an active patient keeps it
});

test('heat tables on narrow cards: the white cell gap shrinks with the cell, so small cells keep their colour', SSR, () => {
  assert.deepEqual([[4, 2], [8, 2], [12, 2], [8, 3], [30, 3]].map(([c, f]) => O._.cellBorder(c, f)), [0, 1, 2, 1, 3]);
  const m = models(patientDetail({ seed: 16, days: 400, adh: 0.8, lars: [30, 25] }, TODAY, true), 'all', 'date');
  const gap = (o) => o.series[0].itemStyle.borderWidth;
  assert.deepEqual([gap(O.symptomRaster(m.cm.raster, m.ctx, 'd', 262)), gap(O.symptomRaster(m.cm.raster, m.ctx, 'd', 1330))], [0, 2]);
  assert.deepEqual([gap(O.monthlyBurden(m.cm.monthly, m.ctx, 'd', 262)), gap(O.monthlyBurden(m.cm.monthly, m.ctx, 'd', 900))], [1, 3]);   // 14 months: ~6 px cells
  assert.deepEqual([gap(O.dietHeat(m.cm.diet, m.ctx, 'd', 300)), gap(O.dietHeat(m.cm.diet, m.ctx, 'd', 1330))], [0, 2]);
  render(O.symptomRaster(m.cm.raster, m.ctx, 'd', 262), 262, 120);
});

test('stool calendar without the activity map (other questionnaires unknown) still renders', SSR, () => {
  const m = models(patientDetail({ seed: 14, days: 60, adh: 0.8, lars: [30, 25] }, TODAY, false), '1m', 'date');
  const vm = Object.assign({}, m.cm.stool); delete vm.act;
  render(O.stoolCalendar(vm, m.ctx, 'd', 900));
});

// ------------------------------------------------------------------ data/patient-model.js (stage 4 QA fixes)
const VM = require(path.join(WEB, 'js/doctors/data/patient-model.js'));
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, a + ' != ' + b);

test('patient model: a diary row dated the day after today is today\'s (newest) row, never hidden (DATA-10)', () => {
  const d = patientDetail({ seed: 21, days: 60, adh: 1, lars: [30, 26] }, TODAY, true);
  const row = (date, stool, type) => ({ date, stool_count: stool, bristol_scale: type, bloating: 2, impact_score: 3, food: {}, drink: {} });
  d.daily_entries = d.daily_entries.filter((r) => r.date !== iso(TODAY)).concat([row(iso(TODAY), 4, 4), row(iso(TODAY + 1), 11, 7)]);
  const pm = VM.patientModel(d, {});
  const last = pm.stool[pm.stool.length - 1];
  assert.deepEqual([last.day, last.value], [TODAY, 11]);                         // the local-date-ahead row, shown as today
  assert.equal(pm.stool.filter((p) => p.day === TODAY).length, 1);               // one diary value per day
  assert.ok(pm.stool.every((p) => p.day <= TODAY) && pm.bristol[pm.bristol.length - 1].value === 7);
  assert.equal(pm.act.get(TODAY), 'daily');
  // no ahead row: nothing changes
  const plain = VM.patientModel(patientDetail({ seed: 21, days: 60, adh: 1, lars: [30, 26] }, TODAY, true), {});
  assert.ok(plain.daily.every((r) => !r.aheadOf));
});

test('patient model: the first-week stool baseline is shown only when it does not overlap the current 7 days (DATA-07)', () => {
  const at = (days) => {
    const d = { status: 'ok', patient_code: 'GENX', created_at: iso(TODAY - days) + 'T09:00:00+00:00', patient_status: 'active', server_today: iso(TODAY),
      lars_scores: [], eq5d5l_scores: [], eq5d5l_entries: [], monthly_entries: [], daily_steps: [],
      daily_entries: Array.from({ length: days }, (_, i) => ({ date: iso(TODAY - days + i), stool_count: 3 + (i % 4), food: {}, drink: {} })) };
    return VM.patientKpis(VM.patientModel(d, {})).stool7;
  };
  assert.equal(at(9).firstWeek, null);           // first diary week ends inside the current 7 days
  assert.equal(at(12).firstWeek, null);          // first diary day + 6 = today - 6: still one shared day
  assert.notEqual(at(13).firstWeek, null);       // first diary day + 6 = today - 7: apart
});

test('patient model: diary card rows start at the 730-day window, like their charts (DATA-09)', () => {
  const d = patientDetail({ seed: 11, days: 900, adh: 0.9, lars: [36, 22], steps: 7000 }, TODAY, true);
  const extra = { date: iso(TODAY - 730), stool_count: 9, bristol_scale: 7, bloating: 9, impact_score: 9, food: {}, drink: {} };
  d.daily_entries.push(extra);                                                   // the API sends one day more than the window
  const pm = VM.patientModel(d, {});
  const cm = VM.cardModels(pm, M.rangeWindow('all', pm.startDay, pm.today));
  const win = TODAY - 729;
  assert.equal(cm.diary.from, win);
  assert.ok(cm.diet.rows.every((r) => r.day >= win) && cm.raster.rows.every((r) => r.day >= win));
  assert.equal(cm.bristol.stats.n, M.bristolStats(pm.bristol.filter((p) => p.day >= win)).n);
  // Bristol "over time" uses the same window: its oldest week never counts the extra day (r2 DATA-09)
  const wk = cm.bristol.weekly[0];
  assert.equal(wk.start, M.isoWeekStart(win));
  assert.ok(wk.start < TODAY - 730, 'the extra day falls inside the oldest week');
  assert.equal(wk.n, M.bristolStats(pm.bristol.filter((p) => p.day >= win && p.day < wk.start + 7)).n);
  assert.equal(cm.bristol.weekly.reduce((n, w) => n + w.n, 0), cm.bristol.stats.n);
});

test('patient model: VAS figures come from the visits, and name their reference visit (r2 DATA-13, DATA-14)', () => {
  const start = TODAY - 200;
  const row = (n, vas, lv) => ({ date: iso(start + n), mobility: lv, self_care: lv, usual_activities: lv, pain_discomfort: lv, anxiety_depression: lv, health_vas: vas });
  const pmOf = (rows) => VM.patientModel({ status: 'ok', patient_code: 'GENV', created_at: iso(start) + 'T09:00:00+00:00', patient_status: 'active', server_today: iso(TODAY),
    lars_scores: [], eq5d5l_scores: [], monthly_entries: [], daily_entries: [], daily_steps: [], eq5d5l_entries: rows }, {});
  // a second EQ-5D-5L 5 days after the day-180 visit (inside its window, as the old scheduler could offer it): the
  // KPI, its delta and its date stay on the visit's own entry, as the VAS chart and the table do
  const pm = pmOf([row(0, 36, 3), row(14, 50, 2), row(30, 63, 2), row(90, 58, 2), row(180, 75, 1), row(185, 60, 2)]);
  assert.deepEqual([pm.vas.latest, pm.vas.latestDay, pm.vas.deltaFirst, pm.vas.firstPoint, pm.vas.latestPoint], [75, start + 180, 39, 0, 180]);
  assert.equal(pm.visits.filter((v) => v.point === 180)[0].vas, pm.vas.latest);
  const kp = VM.patientKpis(pm).vas;
  assert.deepEqual([kp.value, kp.day, kp.point, kp.deltaFirst, kp.firstPoint], [75, start + 180, 180, 39, 0]);
  // no day-0 EQ-5D-5L (old scheduler: only on the registration day): the reference is the day-14 visit, never "day 0"
  const g = pmOf([row(14, 50, 2), row(30, 63, 2), row(180, 75, 1)]);
  assert.deepEqual([g.vas.first, g.vas.firstPoint, g.vas.deltaFirst, g.eqBaselinePoint], [50, 14, 25, 14]);
  // a day-0 entry without a VAS: the profile baseline is day 0, the VAS reference is day 14
  const h = pmOf([row(0, null, 3), row(14, 50, 2), row(180, 75, 1)]);
  assert.deepEqual([h.eqBaselinePoint, h.vas.firstPoint], [0, 14]);
  // today's API (VAS rows only, no levels): the same visit points
  const c = VM.patientModel({ status: 'ok', patient_code: 'GENW', created_at: iso(start) + 'T09:00:00+00:00', patient_status: 'active', lars_scores: [], daily_entries: [], daily_steps: [],
    eq5d5l_scores: [{ date: iso(start + 14), score: 50 }, { date: iso(start + 180), score: 75 }, { date: iso(start + 185), score: 60 }] }, { nowMs: NOW.nowMs });
  assert.deepEqual([c.vas.latest, c.vas.firstPoint, c.vas.latestPoint, c.vas.deltaFirst, c.eqBaselinePoint], [75, 14, 180, 25, null]);
});

test('patient model: a visit past its due date is due / overdue, never "next" (DATA-05)', () => {
  const pmAt = (days, eqDays, status) => VM.patientModel({ status: 'ok', patient_code: 'GENE', created_at: iso(TODAY - days) + 'T09:00:00+00:00',
    patient_status: status || 'active', server_today: iso(TODAY), lars_scores: [], eq5d5l_scores: [], monthly_entries: [], daily_entries: [], daily_steps: [],
    eq5d5l_entries: eqDays.map((n) => ({ date: iso(TODAY - days + n), mobility: 0, self_care: 0, usual_activities: 0, pain_discomfort: 0, anxiety_depression: 0, health_vas: 70 })) }, {});
  assert.deepEqual(VM.eqVisitNotice(pmAt(19, [0])), { kind: 'due', point: 14, dueDay: TODAY - 5, overdueDays: 5 });
  assert.deepEqual(VM.eqVisitNotice(pmAt(21, [0])), { kind: 'overdue', point: 14, dueDay: TODAY - 7, overdueDays: 7 });
  assert.deepEqual(VM.eqVisitNotice(pmAt(5, [0])), { kind: 'next', point: 14, dueDay: TODAY + 9 });
  assert.equal(VM.eqVisitNotice(pmAt(19, [0], 'dead')), null);                  // no visit after death
});

test('registry chip and picker name a record the same way, whatever page came first (r2 FUNC-19)', async () => {
  // views/patient-detail.js in a bare context: only the name helpers run here (no DOM)
  const vmod = require('node:vm');
  const noop = () => {};
  const g = { console, Promise, Object, String, Array, setTimeout, document: { addEventListener: noop }, addEventListener: noop };
  g.window = g;
  const docs = { r1: { firstName: 'Jonas', lastName: 'Demaitis' } };
  g.ILARS_AUTH = { getCurrentUser: () => ({ uid: 'u1' }), db: { collection: () => ({ where: () => ({ get: () => Promise.resolve({
    forEach: (fn) => Object.keys(docs).forEach((id) => fn({ id, data: () => docs[id] })) }) }) }) } };
  vmod.createContext(g);
  const View = vmod.runInContext(fs.readFileSync(path.join(WEB, 'js/doctors/views/patient-detail.js'), 'utf8') + '\n;PatientDetailView', g);
  const v = new View({});
  const rec = { id: 'r1', is_mine: true, lin: 'DEMO-LIN-1' };
  assert.equal(v.registryName(rec), 'DEMO-LIN-1');                        // nothing read yet: the LIN
  const names = await v.registryNames();                                  // the picker's (and now the chip's) read
  assert.equal(names.r1.lastName, 'Demaitis');
  assert.equal(v.registryName(rec), 'Jonas Demaitis');                    // the chip uses the same names, no registry list needed
  g.RegistryListView = { names: { r1: { firstName: 'Ona', lastName: 'Nauja' } } };
  assert.equal(v.registryName(rec), 'Ona Nauja');                         // the registry list's live names win
  assert.equal(v.registryName(Object.assign({}, rec, { is_mine: false })), 'DEMO-LIN-1');
});

test('EQ VAS tooltip: "no questionnaire" only when known; a VAS gap is "VAS –" (DATA-01)', SSR, () => {
  const ctx = m0().ctx;
  const visits = [{ point: 0, status: 'done', day: TODAY - 40, levels: null, vas: 60 },
    { point: 14, status: 'missed', day: null, levels: null, vas: null },
    { point: 30, status: 'done', day: TODAY - 10, levels: [1, 1, 1, 1, 1], vas: null }];
  const tip = (vm, i) => O.eqVas(vm, ctx, 'd', 900).tooltip.formatter([{ dataIndex: i }]);
  assert.ok(tip({ visits }, 1).includes(t('doctor.cm.eq.missed')));                                   // v2: no entry at all
  assert.ok(!tip({ visits }, 2).includes(t('doctor.cm.eq.missed')) && tip({ visits }, 2).includes('VAS –'));   // filled, no VAS
  assert.ok(!tip({ visits, vasOnly: true }, 1).includes(t('doctor.cm.eq.missed')));                  // today's API cannot know
  const pm = VM.patientModel({ status: 'ok', patient_code: 'GENL', created_at: iso(TODAY - 40) + 'T09:00:00+00:00', patient_status: 'active',
    lars_scores: [], eq5d5l_scores: [{ date: iso(TODAY - 40), score: 60 }], daily_entries: [], daily_steps: [] }, { nowMs: NOW.nowMs });
  assert.equal(VM.cardModels(pm, M.rangeWindow('all', pm.startDay, pm.today)).eq.vasOnly, true);
});

test('percentages go through percentParts: never "0%" beside a real count, never "100%" when not all (DATA-08)', SSR, () => {
  const stats = M.bristolStats(Array.from({ length: 151 }, (_, i) => ({ day: i, value: i === 0 ? 2 : i < 140 ? 4 : 6 })));
  const vm = { from: 0, to: 150, today: 151, stats, weekly: [] };
  const types = O.bristolTypes(vm, m0().ctx, 'd');
  assert.equal(types.series[0].label.formatter({ value: 1 }), '<1%');
  assert.match(types.tooltip.formatter({ dataIndex: 1, value: 1 }), /&lt;1%/);
  const zones = O.bristolZones(vm, m0().ctx, 'd');
  assert.equal(zones.series[0].label.formatter({ value: 1 }), '<1%');
  assert.equal(zones.title.text, O._.pct(stats.normalShare));
  const rows = Array.from({ length: 200 }, (_, i) => ({ day: i, food: { berries: i === 0 ? 1 : 0 }, drink: { water: 2 } }));
  const freq = O.dietFrequency({ from: 0, to: 199, today: 200, rows }, m0().ctx, 'd');
  const berries = freq.yAxis.data.indexOf(t('app.food_berries_any'));
  assert.equal(freq.series[0].label.formatter({ dataIndex: berries }), '<1%');
  assert.equal(O._.pct(0.996), '>99%'); assert.equal(O._.pct(1), '100%'); assert.equal(O._.pct(0), '0%');
  render(types); render(zones); render(freq, 900, 420);
});
function m0() { return models(patientDetail({ seed: 2, days: 60, adh: 0.9, lars: [30, 25] }, TODAY, true), 'all', 'date'); }

test('100 % stacks end exactly at 100 % (unrounded segments, rounded text) (VIS-19)', SSR, () => {
  const d = patientDetail({ seed: 12, days: 420, adh: 0.85, lars: [34, 22] }, TODAY, true);
  for (const rk of ['3m', 'all']) {
    const m = models(d, rk, 'date');
    const b = O.bristolWeekly(m.cm.bristol, m.ctx, 'd');
    b.series[0].data.forEach((p, i) => near(b.series.reduce((s, x) => s + (x.data[i][1] || 0), 0), 100));
    const s = O.symptomsDistribution(m.cm.symptoms, m.ctx, 'd');
    [0, 1].forEach((i) => near(s.series.reduce((a, x) => a + (x.data[i] || 0), 0), 100));
  }
});

test('pd-time group: every time card shares min/max; a cut first / current week keeps a whole bar inside (DATA-12, VIS-24)', SSR, () => {
  const d = patientDetail({ seed: 4, days: 200, adh: 0.9, lars: [34, 24], steps: 6000 }, TODAY, true);   // a Thursday: part weeks at both ends
  for (const rk of ['6m', 'all']) {
    const m = models(d, rk, 'date');
    const o = patientOptions(m);
    const ax = (x) => [].concat(x.xAxis)[0];
    const st = ax(o.stoolTrend);
    for (const name of ['larsTrend', 'stepsWeekly', 'questionnaireWeekly', 'bristolWeekly', 'symptomsTrend']) {
      assert.deepEqual([st.min, st.max], [ax(o[name]).min, ax(o[name]).max], name + ' shares the bowel axis');
    }
    for (const name of ['stoolTrend', 'stepsWeekly', 'questionnaireWeekly', 'bristolWeekly']) {
      o[name].series.filter((s) => s.type === 'bar').forEach((s) => s.data.forEach((p) => {
        const x = (p && p.value ? p.value : p)[0];
        assert.ok(x > st.min && x < st.max, name + ': bar centre inside the axis (no sliver at an edge)');
      }));
    }
    renderAll(o);
  }
});

test('calendars: more than 53 weeks are cut to the last 53, and say so (DATA-04 note condition)', SSR, () => {
  const d = patientDetail({ seed: 8, days: 752, adh: 0.8, lars: [34, 24] }, TODAY, true);
  const m = models(d, 'all', 'date');
  const dr = M.diaryRange(m.range, m.startDay, TODAY);
  const cf = O.calendarFrom(dr.from, dr.to, 900);
  assert.equal(cf.clipped, true);
  for (const o of [O.questionnaireCalendar(m.cm.q, m.ctx, 'd', 900), O.stoolCalendar(m.cm.stool, m.ctx, 'd', 900)]) assert.equal(o.calendar.range[0], iso(cf.from));
  assert.equal(O.calendarFrom(TODAY - 360, TODAY, 900).clipped, false);
  assert.equal(O.calendarFrom(TODAY - 360, TODAY, 320).clipped, true);         // a narrow phone shows fewer weeks
});

test('every builder was rendered at least once', SSR, () => {
  const builders = Object.keys(O).filter((k) => typeof O[k] === 'function' && !['esc', 'base', 'xTime', 'X', 'calendarFrom', 'sparkGeometry', 'sparklineSVG'].includes(k));
  assert.deepEqual(builders.filter((k) => !rendered.has(k)), []);
});

// ------------------------------------------------------------------ sparkline (plain SVG)
test('sparkline geometry: fixed 0-42 domain, gap breaks, single point', () => {
  const g = O.sparkGeometry([{ day: 0, score: 42 }, { day: 7, score: 0 }], 96, 28);
  assert.deepEqual(g.segments, [[[3, 3], [93, 25]]]);
  assert.deepEqual(g.last, { x: 93, y: 25, score: 0 });
  const one = O.sparkGeometry([{ day: 5, score: 21 }], 96, 28);
  assert.deepEqual([one.segments.length, one.last.x], [0, 93]);
  const gap = O.sparkGeometry([{ day: 0, score: 30 }, { day: 7, score: 28 }, { day: 40, score: 22 }, { day: 47, score: 20 }], 96, 28);
  assert.equal(gap.segments.length, 2);
  assert.equal(O.sparkGeometry([], 96, 28), null);
  assert.match(O.sparklineSVG([{ day: 0, score: 33 }, { day: 7, score: 31 }], TOK), /aria-hidden="true"/);
});

// ------------------------------------------------------------------ i18n (last: collects what the tests above used)
test('i18n: every key the builders use exists in English; every plural key goes through tp()', { skip: hasCm ? false : 'locales/en.json has no doctor.cm.* yet (WP0 merge); set ILARS_I18N_EXTRA' }, () => {
  // static: string-literal keys in the chart files (also inside tooltip formatters the tests do not call)
  const src = CHART_FILES.map((f) => fs.readFileSync(f, 'utf8')).join('\n');
  const literal = new Set((src.match(/'(?:doctor|app)\.[a-z0-9_.]+[a-z0-9]'/g) || []).map((s) => s.slice(1, -1)));
  literal.forEach((k) => { if (lookup(k) == null && !isPlural(k)) missing.add(k); });
  literal.forEach((k) => { if (isPlural(k) && new RegExp('\\.t\\(\\s*\'' + k.replace(/\./g, '\\.') + '\'').test(src)) pluralThroughT.add(k); });
  assert.deepEqual([...missing].sort(), []);
  assert.deepEqual([...pluralThroughT].sort(), []);
});
