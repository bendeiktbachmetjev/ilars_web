// node --test 'tests/doctor/*.test.js'      (from web/; Node 22+ takes globs, not a bare directory)
// Proves data/api-adapter.js turns BOTH backends (today's production API and API v2) into what metrics.js and the
// view models read. Fixtures: fixtures/adapter-fixtures.json — real API shapes, fictional people (DESIGN-SPEC §6.2).
//
// Dependencies are resolved from web/ first. While a file does not exist there yet (metrics.js, cohort-trajectory.js
// and the view models arrive with WP2–WP4), the design reference copy is used from $ILARS_DESIGN_DIR.
const test = require('node:test'); const assert = require('node:assert');
const path = require('node:path'); const fs = require('node:fs');

const WEB = path.resolve(__dirname, '../..');
const DESIGN = process.env.ILARS_DESIGN_DIR || '';
function need(webRel, designRel) {
  const a = path.join(WEB, webRel);
  if (fs.existsSync(a)) return require(a);
  const b = designRel && path.join(DESIGN, designRel);
  if (b && fs.existsSync(b)) return require(b);
  return null;
}

const F = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/adapter-fixtures.json'), 'utf8'));
const M = need('js/doctors/data/metrics.js', 'charts-metrics/metrics.js');
global.ILARS_METRICS = M;
const VM = need('js/doctors/data/patient-model.js', 'charts-metrics/view-models.js');
const D = Object.assign({}, require(path.join(WEB, 'js/doctors/data/api-adapter.js')),
  need('js/doctors/data/cohort-trajectory.js', 'golden/js/doctors/data/cohort-trajectory.js') || {});
const skipM = M ? false : 'metrics.js not found (web/ or $ILARS_DESIGN_DIR)';

test('v2 list: every extended capability is detected and values match the contract', { skip: skipM }, () => {
  const l = D.adaptList(F.extended.patients);
  assert.equal(l.v2, true); assert.equal(l.today, F.today); assert.equal(l.larsHistory, true);
  const r = l.rows.find(x => x.patient_code === 'DEMO01');
  assert.deepEqual(M.listRowCaps(r), { larsRecent: true, firstLars: true, vasRecent: true, lastActivity: true, adherence: true, eqCount: true });
  const raw = F.extended.patients.patients.find(x => x.patient_code === 'DEMO01');
  assert.equal(r.adherence_days_with_entry, raw.adherence_30d.days_with_entry);
  assert.equal(r.last_eq5d5l_entry_date, raw.last_dates.eq5d5l);
  assert.equal(r.vas_recent[r.vas_recent.length - 1].score, raw.last_eq5d5l_score);
  const s = M.summarizeListRow(r, { today: M.todayDay(l.today), meDoctorCode: 'DEMODR01' });
  assert.equal(s.adherence.approx, false);
  assert.equal(s.lars.recent.length, 12);
});
test('current list: untouched, capabilities off, adherence approximate', { skip: skipM }, () => {
  const l = D.adaptList(F.current.patients);
  assert.equal(l.v2, false); assert.equal(l.today, null);
  const r = l.rows.find(x => x.patient_code === 'DEMO01');
  assert.deepEqual(r, F.current.patients.patients.find(x => x.patient_code === 'DEMO01'));
  const s = M.summarizeListRow(r, { today: M.parseDay(F.today), meDoctorCode: 'DEMODR01' });
  assert.equal(s.adherence.approx, true); assert.equal(s.lars.recent, null);
});
test('v2 detail: items, EQ levels (1-5 -> stored 0-4), diary enums, monthly', { skip: skipM || (VM ? false : 'view models not found') }, () => {
  const d = D.adaptDetail(F.extended.detail.DEMO01);
  const caps = M.detailCaps(d);
  assert.deepEqual(caps, { larsItems: true, eqDims: true, dailySymptoms: true, monthly: true, serverToday: true });
  const pm = VM.patientModel(d, {});
  assert.equal(pm.lars.length, F.extended.detail.DEMO01.weekly_entries.length);
  pm.lars.forEach(p => assert.equal(Object.values(p.items).reduce((a, b) => a + b, 0), p.score));   // points add up to the score
  const lv = F.extended.detail.DEMO01.eq5d5l_entries[0].levels;
  assert.deepEqual(pm.eq[0].levels, [lv.mobility, lv.self_care, lv.usual_activities, lv.pain_discomfort, lv.anxiety_depression]);
  assert.ok(['Yes', 'No'].includes(d.daily_entries[0].urgency)); assert.ok(['None', 'Liquid', 'Solid'].includes(d.daily_entries[0].leakage));
});
test('v2 detail: a weekly row without a stored total is kept as "calculated" (DEMO06)', () => {
  const d = D.adaptDetail(F.extended.detail.DEMO06);
  const calc = d.lars_scores.filter(r => r.calculated);
  assert.equal(calc.length, 1);                                         // today's portal drops this row silently
  assert.equal(d.lars_scores.length, F.extended.detail.DEMO06.weekly_entries.length);
  assert.equal(F.current.detail.DEMO06.lars_scores.length, d.lars_scores.length - 1);
});
test('current detail: no v2 capability, diary fields absent (never 0)', { skip: skipM }, () => {
  const d = D.adaptDetail(F.current.detail.DEMO01);
  assert.deepEqual(M.detailCaps(d), { larsItems: false, eqDims: false, dailySymptoms: false, monthly: false, serverToday: false });
  assert.equal('urgency' in d.daily_entries[0], false);
});
test('cohort trajectory: 4-week blocks, n >= 5, paired change only with both ends', { skip: skipM || (D.cohortTrajectory ? false : 'cohort-trajectory.js not found') }, () => {
  const l = D.adaptList(F.extended.patients);
  const t = D.cohortTrajectory(l.rows, M);
  assert.ok(t.blocks.length > 3);
  t.blocks.forEach(b => { assert.ok(b.n >= 5); assert.ok(b.q1 <= b.median && b.median <= b.q3); assert.equal(b.none + b.minor + b.major, b.n); assert.equal(b.week, b.block * 4); });
  assert.ok(t.paired && t.paired.k >= 5);
  assert.equal(D.cohortTrajectory(D.adaptList(F.current.patients).rows, M).blocks.length, 0);   // today's API: no history
});
