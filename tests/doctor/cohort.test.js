// node --test 'tests/doctor/*.test.js'      (from web/)
// data/cohort-model.js (iLARS Patients list + Overview view model) and data/cohort-trajectory.js ("LARS since
// registration"). Real API shapes from fixtures/adapter-fixtures.json (fictional people, as of 2026-10-01) plus
// small synthetic rows for the edge cases.
const test = require('node:test'); const assert = require('node:assert');
const path = require('node:path'); const fs = require('node:fs');

const WEB = path.resolve(__dirname, '../..');
const M = require(path.join(WEB, 'js/doctors/data/metrics.js'));
global.ILARS_METRICS = M;
const VM = require(path.join(WEB, 'js/doctors/data/cohort-model.js'));
const D = Object.assign({}, require(path.join(WEB, 'js/doctors/data/api-adapter.js')), require(path.join(WEB, 'js/doctors/data/cohort-trajectory.js')));
const F = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/adapter-fixtures.json'), 'utf8'));
const ME = 'DEMODR01';

function model(api, scope) {
  const l = D.adaptList(F[api].patients);
  const today = l.today ? M.todayDay(l.today) : M.parseDay(F.today);
  return VM.cohortModel(l.rows, { today, meDoctorCode: ME, scope });
}
const ST = (o) => Object.assign({ status: 'active', attention: false, q: '', sort: null }, o);

test('scope: "All visible" = 24 patients (19 active / 3 inactive / 2 deceased), "My patients" = 21', () => {
  const all = model('extended', 'all'), mine = model('extended', 'mine');
  assert.equal(all.scoped.length, 24); assert.equal(mine.scoped.length, 21);
  const r = VM.listRows(all.scoped, ST({ status: 'all' }), {});
  assert.deepEqual(r.counts, { active: 19, inactive: 3, dead: 2, all: 24 });
  assert.equal(r.rows.length, 24);
  assert.deepEqual(VM.listRows(mine.scoped, ST(), {}).counts, { active: 17, inactive: 3, dead: 1, all: 21 });
  assert.ok(mine.scoped.every(s => s.isMine));
  assert.equal(all.stats.status.active, 19);
  assert.equal(mine.startDays.length, 21);
});

test('default order: needs attention first (clinical, engagement, protocol), then the biggest gap', () => {
  const m = model('extended', 'mine');
  const rows = VM.listRows(m.scoped, ST(), {}).rows;
  const ranks = rows.map(s => s.attentionRank);
  assert.deepEqual(ranks, ranks.slice().sort((a, b) => a - b));
  assert.ok(rows[0].attention.length > 0);
  // the overview table = the same patients in the same order
  assert.deepEqual(m.attention.map(s => s.code), rows.filter(s => s.attention.length).map(s => s.code));
});

test('counts follow search + attention toggle, never the status filter itself', () => {
  const m = model('extended', 'all');
  const names = { DEMO24: 'Danutė Baranauskienė', DEMO02: 'Rasa Kazlauskienė' };
  const a = VM.listRows(m.scoped, ST({ attention: true }), names);
  assert.equal(a.counts.inactive, 0); assert.equal(a.counts.dead, 0);
  assert.equal(a.counts.active, a.attentionN);
  assert.ok(a.rows.every(s => s.status === 'active' && s.attention.length));
  const q = VM.listRows(m.scoped, ST({ q: 'kazlauskiene', status: 'inactive' }), names);   // accent-insensitive
  assert.equal(q.rows.length, 0); assert.equal(q.counts.active, 1); assert.equal(q.counts.all, 1);
  assert.equal(VM.listRows(m.scoped, ST({ q: 'baranausk' }), names).rows[0].code, 'DEMO24');
  assert.equal(VM.listRows(m.scoped, ST({ q: 'demo 2 4' }), names).rows[0].code, 'DEMO24');   // grouped code typed with spaces
  assert.equal(q.attentionN, a.attentionN);                                                    // chip count ignores search
});

test('header sorts: click cycle and nulls last in both directions', () => {
  assert.deepEqual(VM.nextSort(null, 'lars'), { key: 'lars', dir: 'desc' });
  assert.deepEqual(VM.nextSort({ key: 'lars', dir: 'desc' }, 'lars'), { key: 'lars', dir: 'asc' });
  assert.equal(VM.nextSort({ key: 'lars', dir: 'asc' }, 'lars'), null);
  assert.deepEqual(VM.nextSort({ key: 'lars', dir: 'asc' }, 'vas'), { key: 'vas', dir: 'asc' });
  assert.deepEqual(VM.nextSort({ key: 'day', dir: 'asc' }, 'day'), { key: 'day', dir: 'desc' });
  assert.equal(VM.nextSort({ key: 'day', dir: 'desc' }, 'day'), null);
  const m = model('extended', 'mine');
  for (const dir of ['asc', 'desc']) {
    const rows = VM.listRows(m.scoped, ST({ sort: { key: 'lars', dir } }), {}).rows;
    const v = rows.map(s => s.lars.latest), firstNull = v.indexOf(null);
    assert.ok(firstNull > 0 && v.slice(firstNull).every(x => x == null), 'nulls last (' + dir + ')');
    const nn = v.slice(0, firstNull);
    assert.deepEqual(nn, nn.slice().sort((a, b) => dir === 'asc' ? a - b : b - a));
  }
  const nm = { DEMO01: 'Algis', DEMO02: 'Zita' };
  const byName = VM.listRows(m.scoped, ST({ sort: { key: 'patient', dir: 'asc' } }), nm).rows;
  assert.deepEqual(byName.slice(0, 3).map(s => s.code), ['DEMO01', 'DEMO02', 'DEMO03']);   // names A→Z, then bare codes A→Z
  const desc = VM.listRows(m.scoped, ST({ sort: { key: 'patient', dir: 'desc' } }), nm).rows;
  assert.deepEqual(desc.slice(0, 2).map(s => s.code), ['DEMO02', 'DEMO01']);               // names first in both directions
});

test('stored state is validated', () => {
  assert.equal(VM.validSort({ key: 'doctor', dir: 'asc' }), null);     // the Doctor column (and its sort) is gone (A23)
  assert.equal(VM.validSort({ key: 'lars', dir: 'up' }), null);
  assert.deepEqual(VM.validSort({ key: 'vas', dir: 'desc', x: 1 }), { key: 'vas', dir: 'desc' });
  assert.equal(VM.validStatus('deceased'), 'active'); assert.equal(VM.validStatus('dead'), 'dead');
});

test('hero KPI reasons: most frequent first, ties in clinical order', () => {
  assert.deepEqual(VM.topReasons({ no_entry: 2, vas_drop: 1, eq_overdue: 1 }), [{ code: 'no_entry', n: 2 }, { code: 'vas_drop', n: 1 }]);
  assert.deepEqual(VM.topReasons({ eq_overdue: 1, lars_worse: 1 }, 1), [{ code: 'lars_worse', n: 1 }]);
  assert.deepEqual(VM.topReasons({}), []);
  const m = model('extended', 'mine');
  const top = VM.topReasons(m.stats.reasonCounts);
  assert.ok(top.length >= 1 && top.length <= 2);
});

test("today's API: same counts, approximate adherence, no extended reasons", () => {
  const m = model('current', 'all');
  assert.deepEqual(VM.listRows(m.scoped, ST({ status: 'all' }), {}).counts, { active: 19, inactive: 3, dead: 2, all: 24 });
  m.scoped.forEach(s => s.attention.forEach(a => assert.ok(['no_lars', 'not_started', 'eq_overdue'].includes(a.code), a.code)));
  assert.ok(m.scoped.filter(s => s.adherence.ratio != null).every(s => s.adherence.approx));
});

// ---------------------------------------------------------------- cohort trajectory
const row = (created, hist) => ({ created_at: created + 'T08:00:00Z', lars_history: hist.map(([d, s]) => ({ date: d, score: s })) });

test('trajectory: one median per patient per 4-week block; blocks with < 5 patients dropped', () => {
  const rows = [];
  for (let i = 0; i < 5; i++) rows.push(row('2026-01-01', [['2026-01-02', 30], ['2026-01-20', 34 + i]]));
  rows.push(row('2026-01-01', [['2026-02-26', 20]]));          // day 56 = block 2 with 1 patient → dropped
  const t = D.cohortTrajectory(rows, M);
  assert.equal(t.blocks.length, 1);
  const b = t.blocks[0];
  assert.equal(b.block, 0); assert.equal(b.week, 0); assert.equal(b.n, 5);
  assert.deepEqual([b.median, b.q1, b.q3], [33, 32.5, 33.5]);  // patient medians 32, 32.5, 33, 33.5, 34
  assert.equal(b.minor + b.major + b.none, 5);
  assert.equal(t.paired, null);
});

test('trajectory: scores before registration and rows without history are ignored; paired needs both ends', () => {
  const rows = [undefined, { created_at: null, lars_history: [] }, { created_at: '2026-01-01T00:00:00Z' }];
  for (let i = 0; i < 6; i++) rows.push(row('2026-01-01', [['2025-12-20', 42], ['2026-01-05', 30], ['2026-04-01', 30 - i]]));   // day 90 = block 3
  for (let i = 0; i < 3; i++) rows.push(row('2026-01-01', [['2026-04-01', 10]]));                                               // no block 0: not paired
  const t = D.cohortTrajectory(rows, M);
  assert.deepEqual(t.blocks.map(b => [b.block, b.n]), [[0, 6], [3, 9]]);
  assert.equal(t.blocks[0].median, 30);                          // the 42 before registration is not counted
  assert.deepEqual(t.paired, { k: 6, delta: -2.5 });
});

test('trajectory from the fixtures: every block n ≥ 5, labels 0–3, 4–7, …; current API → nothing', () => {
  const l = D.adaptList(F.extended.patients);
  const t = D.cohortTrajectory(l.rows, M);
  t.blocks.forEach(b => { assert.ok(b.n >= M.C.COHORT_MIN_N); assert.equal(b.week, b.block * 4); assert.ok(b.q1 <= b.median && b.median <= b.q3); });
  assert.deepEqual(t.blocks.slice(0, 2).map(b => b.week), [0, 4]);
  assert.ok(t.paired && t.paired.k >= 5);
  assert.deepEqual(D.cohortTrajectory(D.adaptList(F.current.patients).rows, M), { blocks: [], paired: null });
});

// charts/cohort.js (WP2 stage 2): on phones every block keeps a label without overlap — the first week of the block
// ("12" for 12–15) once a block gets < 40 px; the n strip then shows the bare count. Pure option checks (no ECharts).
test('trajectory chart: narrow plots label every block with its first week; wide plots keep "0–3"', () => {
  const THEME = require(path.join(WEB, 'js/doctors/charts/theme.js'));
  const O = require(path.join(WEB, 'js/doctors/charts/base.js'));
  require(path.join(WEB, 'js/doctors/charts/cohort.js'));
  const tok = {}; Object.keys(THEME.MAP).forEach((k) => { tok[k] = '#777'; }); Object.keys(THEME.LISTS).forEach((k) => { tok[k] = THEME.LISTS[k].map(() => '#777'); });
  const ctx = { tok, t: (k) => k, tp: (k, n) => k + n, lang: 'en-GB', reduced: true, patterns: false, fmtDay: String, fmtNum: String, x: { mode: 'date', ref: null } };
  const traj = { blocks: [0, 1, 2, 3, 4, 5, 6, 7].map((b) => ({ block: b, week: b * 4, n: 17 - b, median: 28, q1: 24, q3: 32, none: 4, minor: 6, major: 7 - b })), paired: null };
  const labels = (opt) => opt.xAxis[1].axisLabel.customValues.map(opt.xAxis[1].axisLabel.formatter);
  assert.deepEqual(labels(O.cohortTrajectory(traj, ctx, 'd')), ['0–3', '4–7', '8–11', '12–15', '16–19', '20–23', '24–27', '28–31']);
  assert.deepEqual(labels(O.cohortTrajectory(traj, ctx, 'd', 1000)), ['0–3', '4–7', '8–11', '12–15', '16–19', '20–23', '24–27', '28–31']);
  const narrow = O.cohortTrajectory(traj, ctx, 'd', 310);
  assert.deepEqual(labels(narrow), ['0', '4', '8', '12', '16', '20', '24', '28']);
  assert.deepEqual(O.cohortCategoryShare(traj, ctx, 'd', 1000).xAxis.data.slice(0, 2), ['0–3', '4–7']);
  assert.deepEqual(O.cohortCategoryShare(traj, ctx, 'd', 310).xAxis.data, ['0', '4', '8', '12', '16', '20', '24', '28']);
});

// ---------------------------------------------------------------- stage 4 QA fixes
test('Day column: a deceased patient has no day count and sorts last in both directions (DATA-02)', () => {
  for (const api of ['extended', 'current']) {
    const m = model(api, 'all');
    const dead = m.scoped.filter(s => s.status === 'dead');
    // DEMO21 registered 26 Dec 2025: "Day 279" on 1 Oct 2026 kept counting past the death on 17 Aug 2026 (day 234)
    assert.deepEqual(dead.map(s => [s.code, M.dayToIso(s.startDay), s.dayInStudy]), [['DEMO21', '2025-12-26', 279], ['DEMO22', '2025-10-17', 349]]);
    for (const dir of ['asc', 'desc']) {
      const rows = VM.listRows(m.scoped, ST({ status: 'all', sort: { key: 'day', dir } }), {}).rows;
      assert.deepEqual(rows.slice(-2).map(s => s.status), ['dead', 'dead'], api + ' ' + dir + ': deceased last');
      const days = rows.slice(0, -2).map(s => s.dayInStudy);
      assert.deepEqual(days, days.slice().sort((a, b) => dir === 'asc' ? a - b : b - a), api + ' ' + dir + ': the others in day order');
    }
  }
});

// charts/cohort.js: real-looking tokens (the calm style mixes the colour into the surface)
function chartCtx() {
  const THEME = require(path.join(WEB, 'js/doctors/charts/theme.js'));
  const O = require(path.join(WEB, 'js/doctors/charts/base.js'));
  require(path.join(WEB, 'js/doctors/charts/cohort.js'));
  const tok = {}; Object.keys(THEME.MAP).forEach((k) => { tok[k] = '#777777'; }); Object.keys(THEME.LISTS).forEach((k) => { tok[k] = THEME.LISTS[k].map(() => '#777777'); });
  Object.assign(tok, { surface: '#ffffff', larsNone: '#249c74', larsMinor: '#d8961b', larsMajor: '#b33832' });
  const mf = new Intl.DateTimeFormat('en-GB', { month: 'short', timeZone: 'UTC' });
  const fmtDay = (d) => { const x = new Date(d * 86400000); return x.getUTCMonth() === 0 && x.getUTCDate() === 1 ? String(x.getUTCFullYear()) : mf.format(x); };
  return { O, ctx: { tok, t: (k) => k, tp: (k, n) => k + n, lang: 'en-GB', reduced: true, patterns: false, fmtDay, fmtNum: String, x: { mode: 'date', ref: null } } };
}

test('overview histograms label every bin, short enough to fit, last bin included (VIS-12)', () => {
  const { O, ctx } = chartCtx();
  const lars = O.cohortLarsHistogram({ larsScores: [1, 13, 40] }, ctx, 'd');
  const adh = O.cohortAdherenceHistogram({ adherenceValues: [0.05, 0.95, 1] }, ctx, 'd');
  const vas = O.vasHistogram([{ vas: 95 }, { vas: 100 }, { vas: 40 }], ctx, 'd');
  assert.deepEqual(lars.xAxis.data, ['0', '3', '6', '9', '12', '15', '18', '21', '24', '27', '30', '33', '36', '39+']);
  assert.deepEqual(adh.xAxis.data, ['0', '10', '20', '30', '40', '50', '60', '70', '80', '90+']);
  assert.deepEqual(vas.xAxis.data, adh.xAxis.data);
  for (const o of [lars, adh, vas]) {
    assert.equal(o.xAxis.axisLabel.interval, 0);                 // every label drawn …
    assert.ok(!o.xAxis.axisLabel.hideOverlap);                   // … none dropped by the overlap pass
    assert.ok(o.xAxis.data.every((l) => l.length <= 3));
  }
  assert.equal(adh.series[0].data[9].value, 2);                  // 95 % and 100 % sit in the labelled "90+" bin
  assert.equal(vas.series[0].data[9], 2);
  assert.ok(adh.tooltip.formatter({ dataIndex: 9 }).includes('90–100%'));   // the tooltip keeps the full range
});

test('LARS since registration > Categories: calm tint + 1 px category edge, empty segments without an edge (VIS-07)', () => {
  const { O, ctx } = chartCtx();
  const traj = { blocks: [0, 1].map((b) => ({ block: b, week: b * 4, n: 10, median: 28, q1: 24, q3: 32, none: 4, minor: 6 - b * 6, major: b * 6 })), paired: null };
  const o = O.cohortCategoryShare(traj, ctx, 'd', 1000);
  const full = { 'cs-none': '#249c74', 'cs-minor': '#d8961b', 'cs-major': '#b33832' };
  o.series.forEach((s) => {
    assert.equal(s.itemStyle.borderColor, full[s.id]);
    assert.equal(s.itemStyle.borderWidth, 1);
    assert.notEqual(s.itemStyle.color, full[s.id], s.id + ': tinted fill, not the solid colour');
    assert.equal(s.emphasis.itemStyle.color, full[s.id]);
  });
  const minor = o.series.find((s) => s.id === 'cs-minor'), major = o.series.find((s) => s.id === 'cs-major');
  assert.deepEqual([minor.data[0], minor.data[1]], [60, { value: 0, itemStyle: { borderWidth: 0 } }]);
  assert.deepEqual(major.data[0], { value: 0, itemStyle: { borderWidth: 0 } });
  const tip = o.tooltip.formatter([0, 1, 2].map((i) => ({ dataIndex: 1, seriesIndex: i, value: [40, 0, 60][i], seriesName: 'x', color: 'tint' })));
  assert.ok(tip.includes('background:#b33832') && !tip.includes('background:tint'), 'tooltip keys in the full category colour');
});

test('Registrations > Total: the axis always names its last month; January (the year) kept; labels get room (VIS-30)', () => {
  const { O, ctx } = chartCtx();
  const P = M.parseDay;
  const iso = (o) => o.xAxis.axisLabel.customValues.map((v) => new Date(v).toISOString().slice(0, 10));
  const vm = (from, to) => ({ series: M.enrolmentSeries([P(from), P(to)]), from: P(from), to: P(to) });
  const v = vm('2025-10-28', '2026-10-01');                      // the demo cohort on 1 Oct 2026
  const wide = O.enrolmentCumulative(v, ctx, 'd', 421);           // 1440 px card: every month
  assert.equal(iso(wide).length, 12);
  assert.deepEqual([iso(wide)[0], iso(wide)[11]], ['2025-11-01', '2026-10-01']);
  const narrow = O.enrolmentCumulative(v, ctx, 'd', 288);         // 1024 px card: every 2nd month, "Sept" makes room for "Oct"
  assert.deepEqual(iso(narrow), ['2025-11-01', '2026-01-01', '2026-03-01', '2026-05-01', '2026-07-01', '2026-10-01']);
  assert.equal(narrow.xAxis.axisLabel.hideOverlap, false);
  const mid = O.enrolmentCumulative(vm('2025-10-28', '2026-10-15'), ctx, 'd', 288);
  assert.equal(iso(mid).slice(-1)[0], '2026-10-01');              // mid-month "today": the last month start is labelled
  assert.equal(O.enrolmentCumulative(v, ctx, 'd').xAxis.axisLabel.customValues, undefined);           // no width: ECharts' ticks
  assert.equal(O.enrolmentCumulative(vm('2026-09-20', '2026-10-01'), ctx, 'd', 288).xAxis.axisLabel.customValues, undefined);   // < 2 month starts
});

// ---------------------------------------------------------------- stage 4 QA round 2
test('Adherence column: deceased ("Not tracked") and "Too early" rows sort last in both directions (DATA-15)', () => {
  for (const api of ['extended', 'current']) {
    const m = model(api, 'all');
    for (const dir of ['asc', 'desc']) {
      const rows = VM.listRows(m.scoped, ST({ status: 'all', sort: { key: 'adherence', dir } }), {}).rows;
      const shown = (s) => s.status !== 'dead' && s.adherence.ratio != null;    // the cell shows a percentage
      const firstBlank = rows.findIndex((s) => !shown(s));
      assert.ok(firstBlank > 0, api + ' ' + dir + ': some rows have a percentage');
      assert.ok(rows.slice(firstBlank).every((s) => !shown(s)), api + ' ' + dir + ': no percentage after the first blank cell');
      assert.ok(rows.slice(firstBlank).some((s) => s.status === 'dead'), api + ' ' + dir + ': the deceased are among the last rows');
      const v = rows.slice(0, firstBlank).map((s) => s.adherence.ratio);
      assert.deepEqual(v, v.slice().sort((a, b) => dir === 'asc' ? a - b : b - a), api + ' ' + dir + ': percentages in order');
    }
  }
});

test('LARS category donut: shares go through percentParts ("<1%", ">99%"), base = patients with a score (DATA-08)', () => {
  const { O, ctx } = chartCtx();
  const o = O.cohortLarsDonut({ larsCategories: { none: 0, minor: 149, major: 1, nodata: 3 } }, ctx, 'd');
  const s = o.series[0], f = (cat, value) => s.label.formatter({ data: { cat }, value });
  assert.equal(f('major', 1), '<1%');                             // Math.round gave "1%" (and "0%" from 200 scored on)
  assert.equal(f('minor', 149), '>99%');                          // Math.round gave "99%"
  assert.equal(f('nodata', 3), '');                               // no share for "No score yet"
  assert.ok(o.tooltip.formatter({ data: { cat: 'major' }, value: 1, color: '#b33832', name: 'Major' }).includes('&lt;1%'));
  const even = O.cohortLarsDonut({ larsCategories: { none: 1, minor: 1, major: 2, nodata: 0 } }, ctx, 'd');
  assert.equal(even.series[0].label.formatter({ data: { cat: 'major' }, value: 2 }), '50%');
});

test('LARS since registration > Categories: every stack ends exactly on 100 %, only the tooltip rounds (VIS-19)', () => {
  const { O, ctx } = chartCtx();
  // the demo cohort's blocks (QA: rounded stacks summed to 99 and 101)
  const counts = [[3, 5, 9], [4, 9, 9], [3, 4, 6], [3, 4, 4], [3, 4, 4], [2, 3, 4], [2, 3, 3], [1, 2, 2]];
  const traj = { blocks: counts.map(([none, minor, major], b) => ({ block: b, week: b * 4, n: none + minor + major, median: 28, q1: 24, q3: 32, none, minor, major })), paired: null };
  const o = O.cohortCategoryShare(traj, ctx, 'd', 1000);
  const val = (x) => (typeof x === 'object' ? x.value : x);
  counts.forEach((_, i) => {
    const sum = o.series.reduce((a, s) => a + val(s.data[i]), 0);
    assert.ok(Math.abs(sum - 100) < 1e-9, 'block ' + i + ' sums to ' + sum);
  });
  assert.ok(counts.some((_, i) => o.series.some((s) => val(s.data[i]) % 1 !== 0)), 'the data is not rounded');
  const tip = o.tooltip.formatter([0, 1, 2].map((i) => ({ dataIndex: 0, seriesIndex: i, value: val(o.series[i].data[0]), seriesName: 's' + i, color: 'x' })));
  assert.ok(tip.includes('18%') && tip.includes('29%') && tip.includes('53%'), tip);   // 3/17, 5/17, 9/17 rounded for reading
});
