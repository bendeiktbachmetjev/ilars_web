// Tests for js/doctors/data/metrics.js (fictional data only). Run from web/: node --test tests/doctor/*.test.js
// Run under several time zones too (dates must never shift):
//   for z in UTC America/Chicago Pacific/Honolulu Asia/Tokyo Europe/Vilnius; do TZ=$z node --test tests/doctor/*.test.js; done
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const M = require('../../js/doctors/data/metrics.js');

const D = (s) => M.parseDay(s);
const near = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} != ${b}`);

// ------------------------------------------------------------------ dates
test('parseDay: UTC calendar day keys, strict format', () => {
  assert.equal(D('1970-01-01'), 0);
  assert.equal(D('1970-01-02'), 1);
  assert.equal(D('2026-09-28'), 20724);
  assert.equal(D('2026-02-30'), null);       // impossible date
  assert.equal(D('2026-9-28'), null);        // not zero-padded
  assert.equal(D('2026-09-28T00:00:00Z'), null);
  assert.equal(D(null), null);
  assert.equal(M.dayToIso(20724), '2026-09-28');
});

test('dayFromTimestamp = backend created_at::date (UTC), 6-digit fractions accepted', () => {
  assert.equal(M.dayFromTimestamp('2025-11-11T08:42:17.123456+00:00'), D('2025-11-11'));
  assert.equal(M.dayFromTimestamp('2025-11-11T08:42:17+00:00'), D('2025-11-11'));
  assert.equal(M.dayFromTimestamp('2025-11-11T23:59:59.999999+00:00'), D('2025-11-11'));
  assert.equal(M.dayFromTimestamp('2025-11-11T01:30:00+02:00'), D('2025-11-10'));
  assert.equal(M.dayFromTimestamp('garbage'), null);
});

test('formatting a day key with timeZone UTC never shows the previous day', () => {
  const f = new Intl.DateTimeFormat('en', { timeZone: 'UTC', day: 'numeric', month: 'short', year: 'numeric' });
  assert.equal(f.format(new Date(M.dayToMs(D('2026-09-28')))), 'Sep 28, 2026');
  // the bug this prevents: new Date('2026-09-28') formatted in local time (America/Chicago -> Sep 27)
});

test('todayDay: server_today wins, else browser UTC date', () => {
  assert.equal(M.todayDay('2026-10-03'), D('2026-10-03'));
  assert.equal(M.todayDay(undefined, Date.UTC(2026, 9, 3, 23, 59)), D('2026-10-03'));
  assert.equal(M.todayDay('bad', Date.UTC(2026, 9, 4, 0, 1)), D('2026-10-04'));
});

test('isoWeekStart: Monday of the ISO week', () => {
  assert.equal(M.isoWeekStart(D('2026-09-28')), D('2026-09-28')); // Monday
  assert.equal(M.isoWeekStart(D('2026-10-01')), D('2026-09-28')); // Thursday
  assert.equal(M.isoWeekStart(D('2026-10-04')), D('2026-09-28')); // Sunday
  assert.equal(M.isoWeekStart(0), D('1969-12-29'));
});

// ------------------------------------------------------------------ numbers
test('roundTo: half away from zero, float noise removed', () => {
  assert.equal(M.roundTo(2.5, 0), 3);
  assert.equal(M.roundTo(-2.5, 0), -3);
  assert.equal(M.roundTo(1.005, 2), 1.01);
  assert.equal(M.roundTo(22.45, 1), 22.5);
  assert.equal(M.roundTo(null, 1), null);
});

test('median / quantile (type 7) / mean skip nulls', () => {
  assert.equal(M.median([]), null);
  assert.equal(M.median([5]), 5);
  assert.equal(M.median([1, 3]), 2);
  assert.equal(M.median([3, 1, 2]), 2);
  assert.equal(M.median([1, null, 3, undefined]), 2);
  assert.equal(M.quantile([1, 2, 3, 4], 0.25), 1.75);
  assert.equal(M.quantile([1, 2, 3, 4], 0.5), 2.5);
  assert.equal(M.quantile([1, 2, 3, 4], 0.75), 3.25);
  assert.equal(M.mean([2, null, 4]), 3);
  assert.equal(M.mean([]), null);
});

test('percentParts: never 0% when something happened, never 100% when something was missed', () => {
  assert.deepEqual(M.percentParts(0), { value: 0, prefix: '' });
  assert.deepEqual(M.percentParts(0.004), { value: 1, prefix: '<' });
  assert.deepEqual(M.percentParts(0.775), { value: 78, prefix: '' });
  assert.deepEqual(M.percentParts(0.995), { value: 99, prefix: '>' });
  assert.deepEqual(M.percentParts(29 / 30), { value: 97, prefix: '' });
  assert.deepEqual(M.percentParts(1), { value: 100, prefix: '' });
  assert.equal(M.percentParts(null), null);
});

// ------------------------------------------------------------------ LARS
test('larsCategory: 0-20 none, 21-29 minor, 30-42 major; half points for medians', () => {
  const cases = [[0, 'none'], [20, 'none'], [20.5, 'minor'], [21, 'minor'], [29, 'minor'], [29.5, 'major'],
    [30, 'major'], [42, 'major'], [43, null], [-1, null], [null, null], ['30', null]];
  for (const [v, c] of cases) assert.equal(M.larsCategory(v), c, `score ${v}`);
});

test('larsItemPoints: option indices -> published LARS points', () => {
  const p = M.larsItemPoints({ urgency_to_toilet: 2, repeat_bowel_opening: 1, flatus_control: 0, bowel_frequency: 0, liquid_stool_leakage: 1 });
  assert.deepEqual(p, { urgency_to_toilet: 16, repeat_bowel_opening: 9, flatus_control: 0, bowel_frequency: 4, liquid_stool_leakage: 3 });
  // untouched form (all index 0) scores 4: ">7 times per day" is option 0
  const z = M.larsItemPoints({ urgency_to_toilet: 0, repeat_bowel_opening: 0, flatus_control: 0, bowel_frequency: 0, liquid_stool_leakage: 0 });
  assert.equal(Object.values(z).reduce((a, b) => a + b, 0), 4);
  assert.equal(M.larsItemPoints({ urgency_to_toilet: 0, repeat_bowel_opening: 0, flatus_control: 0, bowel_frequency: 4, liquid_stool_leakage: 0 }), null);
  assert.equal(M.larsItemPoints({ date: '2026-01-01', score: 20 }), null);          // current API: no items
});

test('larsSeries: sorts, drops invalid rows', () => {
  const s = M.larsSeries([{ date: '2026-01-15', score: 30 }, { date: '2026-01-01', score: 36 },
    { date: 'x', score: 3 }, { date: '2026-01-08', score: 99 }]);
  assert.deepEqual(s.map((r) => r.score), [36, 30]);
  assert.equal(s[0].items, null);
  assert.equal(s[0].calculated, false);
});

test('larsSeries (A9): a v2 row without a stored total keeps the total from the answers, flagged calculated', () => {
  const items = { urgency_to_toilet: 2, repeat_bowel_opening: 1, flatus_control: 0, bowel_frequency: 0, liquid_stool_leakage: 1 };
  const s = M.larsSeries([
    Object.assign({ date: '2026-01-08', score: 32, calculated: true }, items),          // adapter output: score = points_total
    Object.assign({ date: '2026-01-01', score: null, points_total: 32 }, items),         // raw row, only points_total
    { date: '2026-01-15', score: 30 },                                                   // stored total
    { date: '2026-01-22', score: null, points_total: null }                              // nothing to plot
  ]);
  assert.deepEqual(s.map((r) => [M.dayToIso(r.day), r.score, r.calculated]),
    [['2026-01-01', 32, true], ['2026-01-08', 32, true], ['2026-01-15', 30, false]]);
  assert.equal(Object.values(s[0].items).reduce((a, b) => a + b, 0), 32);              // the points add up to the plotted total
});

const weekly = (start, scores) => scores.map((score, i) => ({ day: start + 7 * i, score, items: null }));

test('rollingMedianSeries: 4-week window [d-27, d], at least 3 scores', () => {
  const s = weekly(0, [36, 30, 33, 24, 27]);
  assert.deepEqual(M.rollingMedianSeries(s).map((p) => p.value), [null, null, 33, 31.5, 28.5]);
});

test('larsTrend: category of current vs previous 4-week median', () => {
  // previous window = days L-55..L-28, current = L-27..L ; L = 49
  const worse = weekly(0, [24, 22, 26, 25, 31, 33, 30, 32]);   // days 0..49
  const t = M.larsTrend(worse);
  assert.equal(t.previous.median, 24.5);
  assert.equal(t.current.median, 31.5);
  assert.equal(t.change, 'worse');
  assert.equal(t.delta, 7);
  assert.equal(M.larsTrend(weekly(0, [24, 22, 31, 33, 30, 32])).change, null);   // previous window has 2 scores
  assert.equal(M.larsTrend(weekly(0, [35, 31, 33, 32, 24, 22, 21, 20])).change, 'better');
  assert.equal(M.larsTrend(weekly(0, [22, 25, 23, 24, 27, 28, 26, 29])).change, 'same');
  assert.equal(M.larsTrend([]), null);
});

test('firstLatest and gap breaks', () => {
  assert.deepEqual(M.firstLatest(weekly(0, [39])), { first: 39, firstDay: 0, latest: 39, latestDay: 0, delta: null });
  assert.equal(M.firstLatest(weekly(0, [39, 30, 22])).delta, -17);
  const g = M.withGapBreaks([{ day: 0 }, { day: 7 }, { day: 35 }], 21);
  assert.deepEqual(g.map((p) => p.day), [0, 7, null, 35]);
});

// ------------------------------------------------------------------ EQ-5D-5L
test('eqLevel: stored 0-4 -> level 1-5', () => {
  assert.equal(M.eqLevel(0), 1);
  assert.equal(M.eqLevel(4), 5);
  for (const bad of [5, -1, 2.5, null, '1']) assert.equal(M.eqLevel(bad), null);
});

test('eqEntries: extended rows keep null-VAS visits; current API is VAS only', () => {
  const ext = M.eqEntries({ eq5d5l_entries: [
    { date: '2026-05-15', mobility: 1, self_care: 0, usual_activities: 2, pain_discomfort: 2, anxiety_depression: 1, health_vas: null },
    { date: '2026-05-01', mobility: 2, self_care: 1, usual_activities: 3, pain_discomfort: 3, anxiety_depression: 2, health_vas: 55 }] });
  assert.equal(ext.length, 2);
  assert.equal(ext[0].day, D('2026-05-01'));
  assert.deepEqual(ext[1].levels, [2, 1, 3, 3, 2]);
  assert.equal(ext[1].vas, null);
  assert.equal(M.eqProfileCode(ext[1].levels), '21332');
  assert.equal(M.eqLevelSum(ext[1].levels), 11);
  const cur = M.eqEntries({ eq5d5l_scores: [{ date: '2026-05-01', score: 55 }] });
  assert.deepEqual(cur, [{ day: D('2026-05-01'), vas: 55, levels: null }]);
});

test('pchc: better / worse / mixed / same', () => {
  assert.equal(M.pchc([2, 1, 3, 3, 2], [1, 1, 3, 2, 2]), 'better');
  assert.equal(M.pchc([1, 1, 1, 1, 1], [1, 2, 1, 1, 1]), 'worse');
  assert.equal(M.pchc([2, 1, 3, 3, 2], [1, 2, 3, 3, 2]), 'mixed');
  assert.equal(M.pchc([2, 1, 3, 3, 2], [2, 1, 3, 3, 2]), 'same');
  assert.equal(M.pchc(null, [1, 1, 1, 1, 1]), null);
});

test('eqVsBaseline (A6): every follow-up compared with day 0, not with the previous visit', () => {
  const visits = [
    { point: 0, levels: [3, 2, 3, 3, 2] },
    { point: 14, levels: [2, 2, 3, 3, 2] },   // better than day 0
    { point: 30, levels: null },               // missed
    { point: 90, levels: [3, 2, 3, 3, 2] },   // same as day 0 (worse than day 14: previous-visit logic would say "worse")
    { point: 180, levels: [2, 3, 3, 3, 2] }   // mixed vs day 0
  ];
  assert.deepEqual(M.eqVsBaseline(visits), { point: 0, pchc: [null, 'better', null, 'same', 'mixed'] });
  // day-0 visit missed: the first visit with levels is the baseline and says which day it is
  assert.deepEqual(M.eqVsBaseline([{ point: 0, levels: null }, { point: 14, levels: [1, 1, 1, 1, 1] }, { point: 30, levels: [1, 2, 1, 1, 1] }]),
    { point: 14, pchc: [null, null, 'worse'] });
  assert.deepEqual(M.eqVsBaseline([]), { point: null, pchc: [] });
});

test('eqMilestones: windows [p-7, next-7-1], first entry in window is the visit', () => {
  const ms = M.eqMilestones(1000, [1000, 1016, 1086], 1100);
  assert.deepEqual(ms.map((m) => m.status), ['done', 'done', 'missed', 'done', 'upcoming', 'upcoming']);
  assert.equal(ms[1].lateDays, 2);
  assert.equal(ms[3].lateDays, -4);                     // filled 4 days early, counts for day 90
  const sum = M.eqMilestoneSummary(ms, 1100);
  assert.deepEqual([sum.done, sum.arrived, sum.next.point, sum.next.dueDay, sum.open], [3, 4, 180, 1180, null]);
});

test('eqMilestones: scheduler doc examples C and D', () => {
  // C: first app use on day 40 -> one EQ-5D covers 0/14/30 for scheduling; reported as the day-30 visit
  assert.deepEqual(M.eqMilestones(0, [40], 41).slice(0, 4).map((m) => m.status), ['missed', 'missed', 'done', 'upcoming']);
  // D: back on day 86 -> counts for the day-90 time point
  const d = M.eqMilestones(0, [0, 14, 86], 95);
  assert.deepEqual(d.slice(0, 4).map((m) => m.status), ['done', 'done', 'missed', 'done']);
});

test('eqMilestones: due becomes overdue after 7 days', () => {
  assert.equal(M.eqMilestones(0, [0], 20)[1].status, 'due');
  assert.equal(M.eqMilestones(0, [0], 21)[1].status, 'overdue');
  assert.equal(M.eqMilestones(0, [0], 21)[1].overdueDays, 7);
});

test('eqOverdueFromLast: same rule as the backend scheduler (latest arrived time point only)', () => {
  assert.equal(M.eqOverdueFromLast(0, null, 6), null);
  assert.deepEqual(M.eqOverdueFromLast(0, null, 7), { point: 0, days: 7 });
  assert.equal(M.eqOverdueFromLast(0, 10, 25), null);           // day-10 entry covers day 14 (>= 14-7)
  assert.deepEqual(M.eqOverdueFromLast(0, 10, 37), { point: 30, days: 7 });
  assert.equal(M.eqOverdueFromLast(0, 85, 95), null);
  assert.equal(M.eqOverdueFromLast(0, 360, 500), null);          // after day 365 nothing more is due
});

test('vasChange: first / previous / latest; MID 7', () => {
  const v = M.vasChange([{ day: 0, score: 55 }, { day: 14, score: 61 }, { day: 30, score: 74 }]);
  assert.deepEqual([v.first, v.previous, v.latest, v.deltaFirst, v.deltaPrevious, v.beyondMid], [55, 61, 74, 19, 13, true]);
  const w = M.vasChange([{ day: 0, score: 70 }, { day: 14, score: 66 }]);
  assert.equal(w.deltaFirst, -4);
  assert.equal(w.beyondMid, false);
  assert.equal(M.vasChange([{ day: 0, score: 70 }]).deltaPrevious, null);
});

// ------------------------------------------------------------------ adherence
test('activityMap: one type per day by priority EQ-5D > monthly > weekly > daily; future -> today', () => {
  const m = M.activityMap({ daily: [5, 6, 101], weekly: [5], eq5d5l: [6], monthly: [] }, 100);
  assert.equal(m.get(5), 'weekly');
  assert.equal(m.get(6), 'eq5d5l');
  assert.equal(m.get(100), 'daily');
  assert.equal(m.has(101), false);
});

test('adherence window = 30 completed UTC days before today, never before day 0 (same as backend SQL)', () => {
  assert.deepEqual(M.adherenceWindow(0, 100), { from: 70, to: 99, expected: 30 });
  assert.deepEqual(M.adherenceWindow(100, 100), { from: 100, to: 99, expected: 0 });   // created today: 0/0
  const days = []; for (let d = 70; d <= 99; d++) if (![71, 75, 80, 88, 93].includes(d)) days.push(d);
  const a = M.adherence30(M.activityMap({ daily: days.concat([100]) }, 100), 0, 100);
  assert.deepEqual([a.done, a.expected], [25, 30]);
  near(a.ratio, 25 / 30);
  const early = M.adherence30(M.activityMap({ daily: [96, 97] }, 100), 95, 100);
  assert.deepEqual([early.ratio, early.reason, early.expected], [null, 'too_early', 5]);
  // backend EDGE06: created D-10, daily D-10..D-1 + weekly on D-3 -> 10/10
  const e6 = []; for (let d = 90; d <= 99; d++) e6.push(d);
  const r6 = M.adherence30(M.activityMap({ daily: e6, weekly: [97] }, 100), 90, 100);
  assert.deepEqual([r6.done, r6.expected, r6.ratio], [10, 10, 1]);
});

test('adherenceFromCounts (current API): approximate, since day 0, clamped', () => {
  const a = M.adherenceFromCounts({ weekly: 10, daily: 50, monthly: 2 }, 0, 80);
  assert.equal(a.approx, true);
  near(a.ratio, 62 / 80);
  assert.equal(M.adherenceFromCounts({ weekly: 20, daily: 90, monthly: 3 }, 0, 80).ratio, 1);
  assert.equal(M.adherenceFromCounts({ weekly: 0, daily: 3, monthly: 0 }, 0, 4).ratio, null);
});

test('adherenceInRange: clipped to day 0 .. yesterday', () => {
  const m = M.activityMap({ daily: [10, 11, 12, 20] }, 30);
  assert.deepEqual(M.adherenceInRange(m, 10, 0, 30, 30), { done: 4, expected: 20, ratio: 0.2 });
});

test('diary window (A24): 730 days; days before it are unknown, not missed', () => {
  assert.equal(M.C.DIARY_WINDOW_DAYS, 730);
  // 900 days in study: diary cards start at today - 729
  assert.equal(M.diaryWindowStart(0, 900), 171);
  assert.equal(M.diaryWindowStart(500, 900), 500);                      // younger than 2 years: day 0
  assert.deepEqual(M.diaryRange(M.rangeWindow('all', 0, 900), 0, 900), { from: 171, to: 900, days: 730, clipped: true });
  assert.deepEqual(M.diaryRange(M.rangeWindow('6m', 0, 900), 0, 900), { from: 719, to: 900, days: 182, clipped: false });
  assert.equal(M.diaryRange(M.rangeWindow('1y', 600, 900), 600, 900).clipped, false);
  // weekly LARS exists before the window, the daily diary only inside it
  const weeklyDays = []; for (let d = 0; d < 900; d += 7) weeklyDays.push(d);
  const dailyDays = []; for (let d = 171; d < 900; d++) dailyDays.push(d);
  const act = M.activityMap({ daily: dailyDays, weekly: weeklyDays }, 900);
  const a = M.adherenceInRange(act, 0, 0, 900, 900);
  assert.deepEqual([a.done, a.expected, a.ratio], [729, 729, 1]);          // the 171 early days are not counted as missed
});

test('one config object: every threshold the clinicians asked about is in ILARS_METRICS.C', () => {
  const C = M.C;
  assert.ok(Object.isFrozen(C));
  // read-only all the way down: no caller can change a list (time points, item keys, item points) at run time
  [C.LARS_ITEM_KEYS, C.LARS_ITEM_POINTS, C.EQ5D_POINTS, C.EQ5D_DIMS].concat(Object.values(C.LARS_ITEM_POINTS))
    .forEach((v) => assert.ok(Object.isFrozen(v)));
  assert.throws(() => { 'use strict'; C.EQ5D_POINTS.push(730); }, TypeError);
  assert.deepEqual([C.LARS_MINOR_FROM, C.LARS_MAJOR_FROM, C.LARS_MEDIAN_WINDOW_DAYS, C.LARS_MEDIAN_MIN_N], [20.5, 29.5, 28, 3]);
  assert.deepEqual([C.ATTN_NOT_STARTED_DAYS, C.ATTN_NO_ENTRY_DAYS, C.ATTN_NO_LARS_DAYS, C.ATTN_RECENT_DAYS, C.ATTN_VAS_DROP], [7, 7, 14, 30, 7]);
  assert.deepEqual([C.EQ5D_OVERDUE_GRACE_DAYS, C.VAS_MID], [7, 7]);
  assert.deepEqual([C.ADHERENCE_GOOD_FROM, C.ADHERENCE_POOR_BELOW, C.ADHERENCE_WINDOW_DAYS, C.ADHERENCE_MIN_EXPECTED_DAYS], [80, 50, 30, 7]);
  assert.deepEqual([C.COHORT_MIN_N, C.DIARY_WINDOW_DAYS], [5, 730]);
});

// ------------------------------------------------------------------ daily diary
test('rollingMeanSeries: every calendar day, null below 4 values, missing is not zero', () => {
  const pts = [1, 2, 3, null, 5, 6, 7].map((v, i) => ({ day: i, value: v })).filter((p) => p.value != null);
  const r = M.rollingMeanSeries(pts, 0, 6);
  assert.equal(r.length, 7);
  assert.equal(r[2].value, null);                       // 3 values
  assert.equal(r[4].value, (1 + 2 + 3 + 5) / 4);
  assert.equal(r[6].value, (1 + 2 + 3 + 5 + 6 + 7) / 6);
});

test('buckets: ISO weeks, empty weeks kept with value null', () => {
  const from = D('2026-09-01'), to = D('2026-09-21');
  const pts = [{ day: D('2026-09-01'), value: 4 }, { day: D('2026-09-03'), value: 6 }, { day: D('2026-09-15'), value: 3 }];
  const b = M.buckets(pts, from, to, M.isoWeekStart, 7);
  assert.deepEqual(b.map((x) => [M.dayToIso(x.start), x.n, x.value]),
    [['2026-08-31', 2, 5], ['2026-09-07', 0, null], ['2026-09-14', 1, 3], ['2026-09-21', 0, null]]);
});

test('bristolStats: nulls skipped, zones 1-2 / 3-5 / 6-7', () => {
  const pts = [1, 4, 4, 5, 7, null, 3].map((v, i) => ({ day: i, value: v }));
  const b = M.bristolStats(pts);
  assert.deepEqual(b.counts, [1, 0, 1, 2, 1, 0, 1]);
  assert.deepEqual(b.zones, { hard: 1, normal: 4, loose: 1 });
  assert.equal(b.n, 6);
  near(b.normalShare, 4 / 6);
  assert.equal(b.enough, true);
  assert.equal(M.bristolStats(pts.slice(0, 4)).enough, false);
});

test('dietItemStats: unit-free frequency + mean in its own unit', () => {
  const rows = [{ drink: { coffee: 2 } }, { drink: { coffee: 0 } }, { drink: { coffee: 3 } }, { drink: {} }];
  assert.deepEqual(M.dietItemStats(rows, 'drink', 'coffee'), { n: 3, daysConsumed: 2, share: 2 / 3, meanPerDay: 5 / 3, max: 3 });
});

// ------------------------------------------------------------------ list rows & attention
const TODAY = D('2026-10-03');
const iso = (k) => M.dayToIso(TODAY - k);
const ts = (k) => iso(k) + 'T09:00:00.123456+00:00';
const legacyRow = (o) => Object.assign({
  patient_code: 'P1', created_at: ts(60), status: 'active', doctor_code: 'D1',
  weekly_count: 8, daily_count: 40, monthly_count: 2,
  last_lars_score: 24, last_lars_date: iso(3), last_eq5d5l_score: 70, last_eq5d5l_date: iso(5)
}, o);
const sum = (row) => M.summarizeListRow(row, { today: TODAY, meDoctorCode: 'D1' });
const codes = (s) => s.attention.map((r) => r.code);

test('current API row: derived fields and approximate adherence', () => {
  const s = sum(legacyRow({}));
  assert.equal(s.dayInStudy, 60);
  assert.equal(s.isMine, true);
  assert.equal(s.lars.category, 'minor');
  assert.equal(s.lars.delta, null);                    // first score not in the current API
  assert.equal(s.lars.recent, null);
  assert.equal(s.adherence.approx, true);
  near(s.adherence.ratio, 50 / 60);
  assert.deepEqual(codes(s), []);
  assert.equal(s.attentionRank, 3);
});

test('attention (current API): not started after 7 days, no LARS for 14+ days, EQ-5D overdue', () => {
  const blank = { weekly_count: 0, daily_count: 0, monthly_count: 0, last_lars_score: null, last_lars_date: null,
    last_eq5d5l_score: null, last_eq5d5l_date: null };
  assert.deepEqual(codes(sum(legacyRow(Object.assign({ created_at: ts(9) }, blank)))), ['not_started']);
  assert.deepEqual(codes(sum(legacyRow(Object.assign({ created_at: ts(5) }, blank)))), []);
  const gap = sum(legacyRow({ last_lars_date: iso(16), last_eq5d5l_date: iso(40) }));
  assert.deepEqual(codes(gap), ['no_lars']);          // EQ overdue is not repeated next to a gap
  assert.equal(gap.attention[0].days, 16);
  const eq = sum(legacyRow({ created_at: ts(37), last_eq5d5l_date: iso(37) }));
  assert.deepEqual(eq.attention, [{ code: 'eq_overdue', severity: 'protocol', point: 30, days: 7 }]);
  assert.deepEqual(codes(sum(legacyRow({ status: 'inactive', created_at: ts(9), weekly_count: 0, daily_count: 0, monthly_count: 0 }))), []);
  assert.deepEqual(codes(sum(legacyRow({ status: 'dead', last_lars_date: iso(90) }))), []);
});

const extRow = (o) => legacyRow(Object.assign({
  lars_recent: [32, 26, 20, 24].map((score, i) => ({ date: iso(39 - [0, 14, 21, 34][i]), score })),
  first_lars_score: 32, first_lars_date: iso(39),
  vas_recent: [{ date: iso(40), score: 55 }, { date: iso(10), score: 70 }],
  eq5d5l_count: 3, last_eq5d5l_entry_date: iso(10),
  last_weekly_date: iso(5), last_daily_date: iso(-1), last_monthly_date: iso(38),
  adherence_days_with_entry: 16, adherence_days_expected: 30
}, o));

test('extended API row: exact adherence, first-score delta, last activity clamps future dates', () => {
  const s = sum(extRow({ last_lars_score: 24, last_lars_date: iso(5) }));
  assert.equal(s.caps.larsRecent, true);
  assert.equal(s.adherence.approx, false);
  near(s.adherence.ratio, 16 / 30);
  assert.equal(s.lars.delta, -8);
  assert.equal(s.lastActivityDay, TODAY);              // web entry dated tomorrow counts as today
  assert.equal(s.vas.change.deltaPrevious, 15);
});

test('attention (extended API): LARS category worse, VAS drop, no entry for 7+ days', () => {
  const recent = [24, 22, 26, 25, 31, 33, 30, 32].map((score, i) => ({ date: iso(52 - 7 * i + 0), score }));
  const s = sum(extRow({
    lars_recent: recent, last_lars_score: 32, last_lars_date: iso(3),
    vas_recent: [{ date: iso(100), score: 70 }, { date: iso(20), score: 58 }], last_eq5d5l_score: 58, last_eq5d5l_date: iso(20),
    last_eq5d5l_entry_date: iso(20), last_daily_date: iso(1)
  }));
  assert.deepEqual(codes(s), ['lars_worse', 'vas_drop']);
  assert.deepEqual([s.attention[0].from, s.attention[0].to], ['minor', 'major']);
  assert.equal(s.attention[1].delta, -12);
  assert.equal(s.attentionRank, 0);
  const idle = sum(extRow({ last_daily_date: iso(9), last_weekly_date: iso(12), last_monthly_date: iso(30),
    last_eq5d5l_entry_date: iso(60) }));
  assert.deepEqual(codes(idle), ['no_entry']);
  assert.equal(idle.attention[0].days, 9);
  const never = sum(extRow({ created_at: ts(8), last_daily_date: null, last_weekly_date: null, last_monthly_date: null,
    last_eq5d5l_entry_date: null, lars_recent: [], vas_recent: [], weekly_count: 0, daily_count: 0, monthly_count: 0,
    last_lars_score: null, last_lars_date: null, last_eq5d5l_score: null, last_eq5d5l_date: null, eq5d5l_count: 0 }));
  assert.deepEqual(codes(never), ['not_started']);
});

test('default list order: clinical > engagement > protocol > none, then biggest gap, then newest', () => {
  const a = { attentionRank: 3, attention: [], startDay: 10 };
  const b = { attentionRank: 1, attention: [{ days: 9 }], startDay: 5 };
  const c = { attentionRank: 1, attention: [{ days: 20 }], startDay: 1 };
  const d = { attentionRank: 0, attention: [{}], startDay: 2 };
  const e = { attentionRank: 3, attention: [], startDay: 30 };
  assert.deepEqual([a, b, c, d, e].sort(M.compareDefault).map((x) => x.startDay), [2, 1, 5, 30, 10]);
});

test('compareNullsLast and searchKey', () => {
  const v = [3, null, 1, undefined, 2];
  assert.deepEqual(v.slice().sort((x, y) => M.compareNullsLast(x, y, 1)), [1, 2, 3, null, undefined]);
  assert.deepEqual(v.slice().sort((x, y) => M.compareNullsLast(x, y, -1)).slice(0, 3), [3, 2, 1]);
  assert.equal(M.searchKey('Kazlauskienė'), 'kazlauskiene');
  assert.equal(M.searchKey(' ŽILINSKAS '), 'zilinskas');
  assert.equal(M.searchKey('Ąžuolas Čiurlionis'), 'azuolas ciurlionis');
});

// ------------------------------------------------------------------ cohort
test('cohortStats: active-only figures, all-status counts', () => {
  const rows = [
    legacyRow({ patient_code: 'A', last_lars_score: 34 }),
    legacyRow({ patient_code: 'B', last_lars_score: 12 }),
    legacyRow({ patient_code: 'C', last_lars_score: null, last_lars_date: null, created_at: ts(10) }),
    legacyRow({ patient_code: 'D', status: 'dead', last_lars_score: 40 }),
    legacyRow({ patient_code: 'E', status: 'inactive' })
  ].map(sum);
  const c = M.cohortStats(rows, TODAY);
  assert.deepEqual(c.status, { active: 3, inactive: 1, dead: 1, total: 5, new30: 1 });
  assert.deepEqual(c.larsCategories, { none: 1, minor: 0, major: 1, nodata: 1 });
  assert.equal(c.majorShare, 0.5);
  assert.equal(c.withScore, 2);
});

test('larsHistogram bins sit on category limits; adherence bins use displayed percent', () => {
  const h = M.larsHistogram([20, 21, 29, 30, 42, 0]);
  const at = (lo) => h.find((b) => b.lo === lo);
  assert.equal(at(18).n, 1); assert.equal(at(18).category, 'none');
  assert.equal(at(21).n, 1); assert.equal(at(21).category, 'minor');
  assert.equal(at(27).n, 1);
  assert.equal(at(30).n, 1); assert.equal(at(30).category, 'major');
  assert.equal(at(39).n, 1); assert.equal(at(39).hi, 42);
  assert.equal(at(0).n, 1);
  const a = M.adherenceHistogram([0.795, 0.19, 0.199, 1, 0, 0.495]);
  assert.deepEqual(a.map((b) => b.n), [1, 1, 1, 0, 0, 1, 0, 0, 1, 1]);   // 0.495 displays 50% -> 50-59
  assert.deepEqual(a.map((b) => b.level), ['poor', 'poor', 'poor', 'poor', 'poor', 'partial', 'partial', 'partial', 'good', 'good']);
});

test('adherenceLevel: thresholds on the displayed percent (80 good, below 50 poor)', () => {
  assert.equal(M.adherenceLevel(0.795), 'good');       // shows 80%
  assert.equal(M.adherenceLevel(0.794), 'partial');    // shows 79%
  assert.equal(M.adherenceLevel(0.495), 'partial');    // shows 50%
  assert.equal(M.adherenceLevel(0.494), 'poor');       // shows 49%
  assert.equal(M.adherenceLevel(0.004), 'poor');       // shows <1%
  assert.equal(M.adherenceLevel(null), null);
});

test('enrolmentSeries: cumulative by registration day', () => {
  assert.deepEqual(M.enrolmentSeries([5, 3, 5, 9]), [{ day: 3, total: 1 }, { day: 5, total: 3 }, { day: 9, total: 4 }]);
});

// ------------------------------------------------------------------ range & axis
test('rangeWindow / defaultRange', () => {
  assert.deepEqual(M.rangeWindow('3m', 0, 200), { from: 110, to: 200, days: 91 });
  assert.deepEqual(M.rangeWindow('all', 7, 200), { from: 7, to: 200, days: 194 });
  assert.deepEqual(M.rangeWindow('1y', 100, 200), { from: 100, to: 200, days: 101 });
  assert.equal(M.defaultRange(0, 182), 'all');
  assert.equal(M.defaultRange(0, 183), '6m');
});

test('surgeryRefDay: stoma closure if diverted, else operation date', () => {
  assert.deepEqual(M.surgeryRefDay({ ileostomy: 1, ileostomy_closure_date: '2026-03-01', operation_date: '2025-12-01' }),
    { day: D('2026-03-01'), kind: 'closure' });
  assert.equal(M.surgeryRefDay({ ileostomy: 1, ileostomy_closure_date: null, operation_date: '2025-12-01' }), null);
  assert.deepEqual(M.surgeryRefDay({ ileostomy: 0, operation_date: '2025-12-01' }), { day: D('2025-12-01'), kind: 'surgery' });
  assert.deepEqual(M.surgeryRefDay({ ileostomy: null, operation_date: null, index_operation_date: '2025-11-20' }),
    { day: D('2025-11-20'), kind: 'surgery' });
  assert.equal(M.surgeryRefDay(null), null);
});

test('caps detection: key present (even null) means extended backend', () => {
  assert.equal(M.listRowCaps(legacyRow({})).larsRecent, false);
  assert.equal(M.listRowCaps(extRow({ lars_recent: [] })).larsRecent, true);
  const d = M.detailCaps({ lars_scores: [{ date: '2026-01-01', score: 3, urgency_to_toilet: 0 }], eq5d5l_entries: [], daily_entries: [] });
  assert.deepEqual(d, { larsItems: true, eqDims: true, dailySymptoms: false, monthly: false, serverToday: false });
});
