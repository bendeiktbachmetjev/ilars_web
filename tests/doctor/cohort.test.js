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
