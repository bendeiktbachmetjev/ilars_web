/*
 * ILARS_METRICS — derived metrics for the iLARS doctor portal (classic script, no build step).
 *
 * Meaning of every number: CHARTS-METRICS.md, with the DESIGN-SPEC Appendix A changes applied here:
 * A6 (EQ-5D-5L change vs day 0), A9 (weekly rows scored from the answers), A24 (730-day diary window),
 * A30 (EQ-5D-5L overdue from 7 days). Tests: web/tests/doctor/metrics.test.js (node --test).
 *
 * Every clinical threshold lives in ONE place: the constants object C below.
 *
 * Rules that hold for every function here:
 *  - Pure: no DOM, no fetch, no Date.now(). "today" is always passed in as a day number.
 *  - Days are integers: days since 1970-01-01 in UTC ("day keys"). 'YYYY-MM-DD' strings are
 *    parsed as UTC calendar dates, so nothing ever shifts by one day in a negative-offset zone.
 *  - Missing is null, never 0. Functions skip nulls; they never turn them into zeros.
 *  - EQ-5D-5L levels are stored 0-4 by the backend and returned here as 1-5.
 */
(function (root) {
  'use strict';

  var DAY_MS = 86400000;

  // ------------------------------------------------------------------ constants (one place)
  var F = Object.freeze;            // C is read-only all the way down (lists included)
  var C = F({
    LARS_MIN: 0,
    LARS_MAX: 42,
    LARS_MINOR_FROM: 20.5,          // 0-20 none, 21-29 minor, 30-42 major (Emmertsen & Laurberg 2012)
    LARS_MAJOR_FROM: 29.5,          // half-point edges also classify medians such as 20.5 / 29.5
    LARS_MEDIAN_WINDOW_DAYS: 28,    // "4-week median"
    LARS_MEDIAN_MIN_N: 3,           // scores needed inside a 4-week window
    LARS_GAP_BREAK_DAYS: 21,        // break the line / sparkline when two scores are further apart
    LARS_RECENT_N: 12,              // sparkline length
    LARS_ITEM_KEYS: F(['urgency_to_toilet', 'repeat_bowel_opening', 'flatus_control', 'bowel_frequency', 'liquid_stool_leakage']),
    LARS_ITEM_POINTS: F({
      urgency_to_toilet: F([0, 11, 16]),
      repeat_bowel_opening: F([0, 9, 11]),
      flatus_control: F([0, 4, 7]),
      bowel_frequency: F([4, 2, 0, 5]),     // >7/day, 4-7/day, 1-3/day, <1/day
      liquid_stool_leakage: F([0, 3, 3])
    }),
    EQ5D_POINTS: F([0, 14, 30, 90, 180, 365]),   // backend questionnaire_schedule.py
    EQ5D_EARLY_DAYS: 7,                       // an entry up to 7 days before a time point counts for it
    EQ5D_OVERDUE_GRACE_DAYS: 7,               // "overdue" = due for 7+ days and still not done
    EQ5D_DIMS: F(['mobility', 'self_care', 'usual_activities', 'pain_discomfort', 'anxiety_depression']),
    VAS_MID: 7,                               // smallest change patients usually notice (cancer, 7-12)
    ADHERENCE_WINDOW_DAYS: 30,                // 30 completed UTC days before today
    ADHERENCE_MIN_EXPECTED_DAYS: 7,           // fewer expected days -> no percentage ("too early")
    ADHERENCE_GOOD_FROM: 80,                  // displayed % >= 80 -> good (common ePRO compliance target)
    ADHERENCE_POOR_BELOW: 50,                 // displayed % < 50 -> poor (half the days missing)
    ROLLING_WINDOW_DAYS: 7,
    ROLLING_MIN_N: 4,
    DIARY_WINDOW_DAYS: 730,                   // the API sends daily_entries for the last 730 days only (A24)
    DAILY_MAX_DAYS: 92,                       // daily bars up to 92 days, weekly buckets above
    RASTER_DAILY_MAX_DAYS: 60,                // symptom raster: daily columns up to 60 days
    CALENDAR_MAX_WEEKS: 53,
    DIET_WEEKLY_MAX_COLS: 26,                 // diet heat-table: weekly columns up to 26, then 4-week blocks
    LARS_ITEMS_MAX_BARS: 60,                  // LARS items view: one bar per score up to 60, then 4-week blocks
    BRISTOL_WEEKLY_MAX_BARS: 26,              // Bristol over time: weekly stacks up to 26, then 4-week blocks
    BRISTOL_MIN_N: 5,
    LOW_N_BUCKET: 3,                          // weekly bucket built from fewer days is drawn faint
    ATTN_NOT_STARTED_DAYS: 7,
    ATTN_NO_ENTRY_DAYS: 7,
    ATTN_NO_LARS_DAYS: 14,                    // proxy used only while last_activity is not in the API
    ATTN_RECENT_DAYS: 30,                     // clinical flags only for events in the last 30 days
    ATTN_VAS_DROP: 7,
    COHORT_MIN_N: 5,                          // cohort trajectory points need 5+ patients
    BY_PATIENT_MAX: 60                        // cohort "by patient" view only up to 60 patients
  });

  var PRIORITY = ['eq5d5l', 'monthly', 'weekly', 'daily'];   // which type a day shows if several
  var CATS = ['none', 'minor', 'major'];
  var SEVERITY_RANK = { clinical: 0, engagement: 1, protocol: 2 };
  var CODE_RANK = { lars_worse: 0, vas_drop: 1, no_entry: 2, no_lars: 2, not_started: 3, eq_overdue: 4 };

  // ------------------------------------------------------------------ dates
  var ISO_DAY = /^(\d{4})-(\d{2})-(\d{2})$/;

  /** 'YYYY-MM-DD' -> day key (int) | null. Never uses the local time zone. */
  function parseDay(iso) {
    if (typeof iso !== 'string') return null;
    var m = ISO_DAY.exec(iso);
    if (!m) return null;
    var y = +m[1], mo = +m[2], d = +m[3];
    var t = Date.UTC(y, mo - 1, d);
    var back = new Date(t);
    if (back.getUTCFullYear() !== y || back.getUTCMonth() !== mo - 1 || back.getUTCDate() !== d) return null;
    return Math.floor(t / DAY_MS);
  }

  /** ISO timestamp (with offset) -> UTC calendar day key. Matches backend `created_at::date` (UTC session). */
  function dayFromTimestamp(ts) {
    if (typeof ts !== 'string' || !ts) return null;
    // Python isoformat may carry 6 fractional digits; keep 3 for Date.parse everywhere.
    var norm = ts.replace(/(\.\d{3})\d+/, '$1');
    var t = Date.parse(norm);
    if (isNaN(t)) return null;
    return Math.floor(t / DAY_MS);
  }

  function dayToIso(day) {
    return new Date(day * DAY_MS).toISOString().slice(0, 10);
  }

  /** day key -> ms timestamp at UTC midnight (what ECharts gets, with option useUTC:true). */
  function dayToMs(day) { return day * DAY_MS; }

  /** server_today ('YYYY-MM-DD', extended API) wins; else the browser's current UTC date. */
  function todayDay(serverToday, nowMs) {
    var s = parseDay(serverToday);
    if (s != null) return s;
    return Math.floor((nowMs == null ? Date.now() : nowMs) / DAY_MS);
  }

  /** Monday of the ISO week that contains `day` (1970-01-01 was a Thursday). */
  function isoWeekStart(day) {
    return day - (((day + 3) % 7) + 7) % 7;
  }

  // ------------------------------------------------------------------ numbers
  function isNum(v) { return typeof v === 'number' && isFinite(v); }

  /** Round half away from zero (so -2.5 -> -3, 2.5 -> 3), with float noise removed. */
  function roundTo(v, decimals) {
    if (!isNum(v)) return null;
    var f = Math.pow(10, decimals || 0);
    var r = Math.round(Math.abs(v) * f + 1e-9) / f;
    return v < 0 ? -r : r;
  }

  function numbers(values) {
    var out = [];
    for (var i = 0; i < values.length; i++) if (isNum(values[i])) out.push(values[i]);
    return out;
  }

  function median(values) {
    var v = numbers(values).sort(function (a, b) { return a - b; });
    var n = v.length;
    if (!n) return null;
    return n % 2 ? v[(n - 1) / 2] : (v[n / 2 - 1] + v[n / 2]) / 2;
  }

  /** Quantile with linear interpolation (type 7 = numpy default = PostgreSQL percentile_cont). */
  function quantile(values, p) {
    var v = numbers(values).sort(function (a, b) { return a - b; });
    if (!v.length) return null;
    var h = (v.length - 1) * p, lo = Math.floor(h), hi = Math.ceil(h);
    return v[lo] + (h - lo) * (v[hi] - v[lo]);
  }

  function mean(values) {
    var v = numbers(values);
    if (!v.length) return null;
    var s = 0;
    for (var i = 0; i < v.length; i++) s += v[i];
    return s / v.length;
  }

  /**
   * Ratio 0..1 -> {value:int, prefix:''|'<'|'>'} for display.
   * Never shows 0% when something happened, never 100% when something was missed.
   */
  function percentParts(ratio) {
    if (!isNum(ratio)) return null;
    var p = ratio * 100;
    if (p > 0 && p < 1) return { value: 1, prefix: '<' };
    if (p > 99 && p < 100) return { value: 99, prefix: '>' };
    return { value: Math.round(p), prefix: '' };
  }

  // ------------------------------------------------------------------ LARS
  function validLars(v) {
    return isNum(v) && v >= C.LARS_MIN && v <= C.LARS_MAX ? v : null;
  }

  /** 'none' | 'minor' | 'major' | null. Works for medians with .5 too. */
  function larsCategory(score) {
    if (!isNum(score) || score < C.LARS_MIN || score > C.LARS_MAX) return null;
    if (score < C.LARS_MINOR_FROM) return 'none';
    if (score < C.LARS_MAJOR_FROM) return 'minor';
    return 'major';
  }

  function categoryIndex(cat) { return CATS.indexOf(cat); }

  /** Stored option indices (extended API) -> points per item, or null if any item is missing/invalid. */
  function larsItemPoints(row) {
    if (!row) return null;
    var out = {};
    for (var i = 0; i < C.LARS_ITEM_KEYS.length; i++) {
      var k = C.LARS_ITEM_KEYS[i];
      var idx = row[k];
      var table = C.LARS_ITEM_POINTS[k];
      if (!isNum(idx) || idx < 0 || idx >= table.length || Math.floor(idx) !== idx) return null;
      out[k] = table[idx];
    }
    return out;
  }

  /**
   * API rows [{date, score, ...items}] -> [{day, score, items|null, calculated}] sorted, invalid rows dropped.
   * A9: a v2 row without a stored total is plotted with the total calculated from the answers
   * (`score ?? points_total`) and keeps `calculated: true` (the adapter sets it; a raw row with only
   * `points_total` is treated the same way). Tooltips say "calculated from answers".
   */
  function larsSeries(rows) {
    var out = [];
    (rows || []).forEach(function (r) {
      var day = parseDay(r && r.date);
      var stored = validLars(r && r.score);
      var score = stored != null ? stored : validLars(r && r.points_total);
      if (day == null || score == null) return;
      out.push({ day: day, score: score, items: larsItemPoints(r), calculated: r.calculated === true || stored == null });
    });
    out.sort(function (a, b) { return a.day - b.day; });
    return out;
  }

  function windowScores(series, fromDay, toDay) {
    var v = [];
    for (var i = 0; i < series.length; i++) {
      if (series[i].day >= fromDay && series[i].day <= toDay) v.push(series[i].score);
    }
    return v;
  }

  /** Median of scores in [day-27, day]; null if fewer than LARS_MEDIAN_MIN_N. */
  function rollingMedianAt(series, day, windowDays, minN) {
    windowDays = windowDays || C.LARS_MEDIAN_WINDOW_DAYS;
    minN = minN || C.LARS_MEDIAN_MIN_N;
    var v = windowScores(series, day - windowDays + 1, day);
    return v.length >= minN ? median(v) : null;
  }

  /** One value per score date (the chart's "4-week median" line). */
  function rollingMedianSeries(series, windowDays, minN) {
    return series.map(function (s) {
      return { day: s.day, value: rollingMedianAt(series, s.day, windowDays, minN) };
    });
  }

  /**
   * Current 4-week window (ending on the latest score) vs the 4 weeks before it.
   * change: 'better' | 'worse' | 'same' (category based, the only interpretable signal: no MCID exists)
   */
  function larsTrend(series) {
    if (!series || !series.length) return null;
    var L = series[series.length - 1].day;
    var w = C.LARS_MEDIAN_WINDOW_DAYS;
    function stats(from, to) {
      var v = windowScores(series, from, to);
      var med = v.length >= C.LARS_MEDIAN_MIN_N ? median(v) : null;
      return { n: v.length, median: med, category: larsCategory(med), from: from, to: to };
    }
    var cur = stats(L - w + 1, L);
    var prev = stats(L - 2 * w + 1, L - w);
    var change = null, delta = null;
    if (cur.median != null && prev.median != null) {
      var a = categoryIndex(cur.category), b = categoryIndex(prev.category);
      change = a > b ? 'worse' : a < b ? 'better' : 'same';
      delta = cur.median - prev.median;
    }
    return { current: cur, previous: prev, change: change, delta: delta };
  }

  /** {first, latest, delta} over the whole series. delta null with a single score. */
  function firstLatest(series) {
    if (!series || !series.length) return null;
    var f = series[0], l = series[series.length - 1];
    return {
      first: f.score, firstDay: f.day, latest: l.score, latestDay: l.day,
      delta: series.length > 1 ? l.score - f.score : null
    };
  }

  /** Points for a line chart: inserts {day:null} breaks where two points are > maxGap days apart. */
  function withGapBreaks(points, maxGap) {
    var out = [];
    for (var i = 0; i < points.length; i++) {
      if (i > 0 && points[i].day - points[i - 1].day > maxGap) out.push({ day: null, gap: true });
      out.push(points[i]);
    }
    return out;
  }

  // ------------------------------------------------------------------ EQ-5D-5L
  function eqLevel(stored) {
    return isNum(stored) && stored >= 0 && stored <= 4 && Math.floor(stored) === stored ? stored + 1 : null;
  }

  /**
   * Detail response -> [{day, vas|null, levels:[5]|null}] sorted.
   * Extended API: eq5d5l_entries (all rows, stored 0-4). Current API: eq5d5l_scores (VAS only).
   */
  function eqEntries(detail) {
    var out = [];
    if (detail && Array.isArray(detail.eq5d5l_entries)) {
      detail.eq5d5l_entries.forEach(function (r) {
        var day = parseDay(r.date);
        if (day == null) return;
        var levels = C.EQ5D_DIMS.map(function (k) { return eqLevel(r[k]); });
        var vas = isNum(r.health_vas) && r.health_vas >= 0 && r.health_vas <= 100 ? r.health_vas : null;
        out.push({ day: day, vas: vas, levels: levels.indexOf(null) === -1 ? levels : null });
      });
    } else if (detail && Array.isArray(detail.eq5d5l_scores)) {
      detail.eq5d5l_scores.forEach(function (r) {
        var day = parseDay(r.date);
        if (day == null || !isNum(r.score)) return;
        out.push({ day: day, vas: r.score, levels: null });
      });
    }
    out.sort(function (a, b) { return a.day - b.day; });
    return out;
  }

  /** levels [1..5]x5 -> '21332' */
  function eqProfileCode(levels) {
    return levels && levels.length === 5 && levels.every(isNum) ? levels.join('') : null;
  }

  /** Unweighted level sum score 5..25 (label it "unweighted"). */
  function eqLevelSum(levels) {
    if (!levels || levels.length !== 5 || !levels.every(isNum)) return null;
    return levels.reduce(function (a, b) { return a + b; }, 0);
  }

  /** Paretian Classification of Health Change between two profiles. */
  function pchc(prevLevels, levels) {
    if (!prevLevels || !levels || prevLevels.length !== 5 || levels.length !== 5) return null;
    var better = 0, worse = 0;
    for (var i = 0; i < 5; i++) {
      if (!isNum(prevLevels[i]) || !isNum(levels[i])) return null;
      if (levels[i] < prevLevels[i]) better++;
      else if (levels[i] > prevLevels[i]) worse++;
    }
    if (better && worse) return 'mixed';
    if (better) return 'better';
    if (worse) return 'worse';
    return 'same';
  }

  /**
   * A6: every follow-up visit is compared with the BASELINE profile (the day-0 visit), not with the
   * previous visit. visits = [{point, levels|null}] in visit order. The baseline is the first visit with
   * levels; `point` says which visit that is (0 normally; another day when the day-0 visit was missed,
   * so the label can say "vs day 14" instead of claiming day 0).
   * -> {point|null, pchc:[pchc|null per visit]} (null for the baseline itself and for visits without levels)
   */
  function eqVsBaseline(visits) {
    var base = null;
    (visits || []).forEach(function (v) { if (!base && v && v.levels) base = v; });
    return {
      point: base ? base.point : null,
      pchc: (visits || []).map(function (v) { return base && v && v !== base && v.levels ? pchc(base.levels, v.levels) : null; })
    };
  }

  /**
   * Status of every EQ-5D-5L time point for reporting.
   * Window of time point p: [start+p-7, start+next(p)-7-1]; the last one never closes.
   * The first entry inside the window is that visit. Same coverage rule as the backend scheduler.
   * status: 'done' | 'missed' | 'due' | 'overdue' | 'upcoming'
   */
  function eqMilestones(startDay, eqDays, today) {
    var days = (eqDays || []).filter(isNum).slice().sort(function (a, b) { return a - b; });
    var P = C.EQ5D_POINTS;
    return P.map(function (p, i) {
      var dueDay = startDay + p;
      var winStart = dueDay - C.EQ5D_EARLY_DAYS;
      var winEnd = i + 1 < P.length ? startDay + P[i + 1] - C.EQ5D_EARLY_DAYS - 1 : Infinity;
      var hits = days.filter(function (d) { return d >= winStart && d <= winEnd; });
      var m = { point: p, dueDay: dueDay, winStart: winStart, winEnd: winEnd };
      if (hits.length) {
        m.status = 'done'; m.day = hits[0]; m.lateDays = hits[0] - dueDay; m.extra = hits.length - 1;
      } else if (today < dueDay) {
        m.status = 'upcoming';
      } else if (today > winEnd) {
        m.status = 'missed';
      } else {
        m.overdueDays = today - dueDay;
        m.status = m.overdueDays >= C.EQ5D_OVERDUE_GRACE_DAYS ? 'overdue' : 'due';
      }
      return m;
    });
  }

  /** {done, arrived, next:{point,dueDay}|null, open:{point,dueDay,overdueDays,status}|null} */
  function eqMilestoneSummary(milestones, today) {
    var done = 0, arrived = 0, next = null, open = null;
    milestones.forEach(function (m) {
      if (m.dueDay <= today) arrived++;
      if (m.status === 'done') done++;
      if ((m.status === 'due' || m.status === 'overdue') && !open) open = m;
      if (m.status === 'upcoming' && !next) next = { point: m.point, dueDay: m.dueDay };
    });
    return { done: done, arrived: arrived, next: next, open: open };
  }

  /**
   * List-level overdue check with only the date of the latest EQ-5D (current API field
   * last_eq5d5l_date). Identical to the scheduler: only the latest time point that has arrived counts.
   */
  function eqOverdueFromLast(startDay, lastEqDay, today) {
    if (!isNum(startDay) || !isNum(today)) return null;
    var dsi = today - startDay, p = null;
    for (var i = 0; i < C.EQ5D_POINTS.length; i++) if (C.EQ5D_POINTS[i] <= dsi) p = C.EQ5D_POINTS[i];
    if (p == null) return null;
    if (isNum(lastEqDay) && lastEqDay >= startDay + p - C.EQ5D_EARLY_DAYS) return null;
    var overdue = today - (startDay + p);
    return overdue >= C.EQ5D_OVERDUE_GRACE_DAYS ? { point: p, days: overdue } : null;
  }

  /** VAS points [{day, score}] -> first/previous/latest and deltas. */
  function vasChange(points) {
    var v = (points || []).filter(function (p) { return isNum(p.score); });
    if (!v.length) return null;
    var first = v[0], latest = v[v.length - 1], prev = v.length > 1 ? v[v.length - 2] : null;
    var dFirst = v.length > 1 ? latest.score - first.score : null;
    return {
      first: first.score, firstDay: first.day,
      latest: latest.score, latestDay: latest.day,
      previous: prev ? prev.score : null, previousDay: prev ? prev.day : null,
      deltaFirst: dFirst,
      deltaPrevious: prev ? latest.score - prev.score : null,
      beyondMid: dFirst != null && Math.abs(dFirst) >= C.VAS_MID
    };
  }

  // ------------------------------------------------------------------ activity / adherence
  /**
   * {daily:[day], weekly:[day], monthly:[day], eq5d5l:[day]} -> Map(day -> highest-priority type).
   * Future dates (web app local date ahead of UTC) are moved to today.
   */
  function activityMap(sources, today) {
    var map = new Map();
    for (var p = PRIORITY.length - 1; p >= 0; p--) {           // lowest priority first, higher overwrites
      var type = PRIORITY[p];
      (sources[type] || []).forEach(function (d) {
        if (!isNum(d)) return;
        if (isNum(today) && d > today) d = today;
        map.set(d, type);
      });
    }
    return map;
  }

  /** Adherence window (same as the backend SQL): 30 completed UTC days before today, never before day 0. */
  function adherenceWindow(startDay, today) {
    var from = Math.max(startDay, today - C.ADHERENCE_WINDOW_DAYS);
    var to = today - 1;
    return { from: from, to: to, expected: Math.max(0, to - from + 1) };
  }

  function adherenceResult(done, expected, approx) {
    if (!isNum(expected) || expected < C.ADHERENCE_MIN_EXPECTED_DAYS) {
      return { ratio: null, done: done, expected: expected, approx: !!approx, reason: 'too_early' };
    }
    return { ratio: Math.min(1, done / expected), done: done, expected: expected, approx: !!approx, reason: null };
  }

  /** Exact adherence from per-day activity (patient detail). */
  function adherence30(actMap, startDay, today) {
    var w = adherenceWindow(startDay, today), done = 0;
    for (var d = w.from; d <= w.to; d++) if (actMap.has(d)) done++;
    return adherenceResult(done, w.expected, false);
  }

  /**
   * Days with any questionnaire inside [from, to] (chart range), clipped to [day 0, yesterday] and to the
   * diary window (A24): before it the daily diary is unknown, so those days are neither done nor missed.
   */
  function adherenceInRange(actMap, startDay, from, to, today) {
    var a = Math.max(from, diaryWindowStart(startDay, today)), b = Math.min(to, today - 1), done = 0;
    for (var d = a; d <= b; d++) if (actMap.has(d)) done++;
    var expected = Math.max(0, b - a + 1);
    return { done: done, expected: expected, ratio: expected ? done / expected : null };
  }

  /** Current API (counts only): approximate adherence since registration. Always approx:true. */
  function adherenceFromCounts(counts, startDay, today) {
    var expected = Math.max(0, today - startDay);           // completed days since day 0
    var done = (counts.weekly || 0) + (counts.daily || 0) + (counts.monthly || 0) + (counts.eq5d5l || 0);
    return adherenceResult(Math.min(done, expected), expected, true);
  }

  /** Last activity {day, type} from the activity map (detail). */
  function lastActivity(actMap) {
    var best = null;
    actMap.forEach(function (type, day) { if (best == null || day > best.day) best = { day: day, type: type }; });
    return best;
  }

  // ------------------------------------------------------------------ daily diary / steps
  /** daily_entries -> [{day, value}] for one field or getter; null/undefined values are skipped. */
  function dailyPoints(rows, getter) {
    var get = typeof getter === 'function' ? getter : function (r) { return r[getter]; };
    var out = [];
    (rows || []).forEach(function (r) {
      var day = parseDay(r && r.date);
      if (day == null) return;
      var v = get(r);
      if (v === null || v === undefined || (typeof v === 'number' && !isFinite(v))) return;
      out.push({ day: day, value: v });
    });
    out.sort(function (a, b) { return a.day - b.day; });
    return out;
  }

  /** Mean over [d-6, d] for EVERY calendar day in [from, to]; null when fewer than minN values. */
  function rollingMeanSeries(points, from, to, windowDays, minN) {
    windowDays = windowDays || C.ROLLING_WINDOW_DAYS;
    minN = minN || C.ROLLING_MIN_N;
    var byDay = new Map();
    points.forEach(function (p) { if (isNum(p.value)) byDay.set(p.day, p.value); });
    var out = [];
    for (var d = from; d <= to; d++) {
      var s = 0, n = 0;
      for (var k = d - windowDays + 1; k <= d; k++) if (byDay.has(k)) { s += byDay.get(k); n++; }
      out.push({ day: d, value: n >= minN ? s / n : null, n: n });
    }
    return out;
  }

  /**
   * Group points into buckets. bucketStart(day) returns the bucket key (e.g. isoWeekStart).
   * Every bucket overlapping [from, to] is returned, empty ones with n:0 and value:null.
   * agg: 'mean' (default) | 'sum' | 'count'
   */
  function buckets(points, from, to, bucketStart, bucketDays, agg) {
    var map = new Map();
    for (var k = bucketStart(from); k <= to; k += bucketDays) map.set(k, []);
    points.forEach(function (p) {
      if (p.day < from || p.day > to) return;
      var key = bucketStart(p.day);
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(p.value);
    });
    var out = [];
    map.forEach(function (vals, key) {
      var n = vals.length, value = null;
      if (n) value = agg === 'sum' ? vals.reduce(function (a, b) { return a + b; }, 0)
        : agg === 'count' ? n : mean(vals);
      out.push({ start: key, n: n, value: value });
    });
    out.sort(function (a, b) { return a.start - b.start; });
    return out;
  }

  /** Relative-axis bucketing: 7-day blocks counted from a reference day (day 0 / surgery). */
  function blockStartFn(refDay, size) {
    return function (day) { return refDay + Math.floor((day - refDay) / size) * size; };
  }

  /** Bristol distribution over points [{day, value:1..7}]. */
  function bristolStats(points) {
    var counts = [0, 0, 0, 0, 0, 0, 0], n = 0;
    points.forEach(function (p) {
      if (isNum(p.value) && p.value >= 1 && p.value <= 7) { counts[p.value - 1]++; n++; }
    });
    var zones = { hard: counts[0] + counts[1], normal: counts[2] + counts[3] + counts[4], loose: counts[5] + counts[6] };
    return { counts: counts, n: n, zones: zones, normalShare: n ? zones.normal / n : null, enough: n >= C.BRISTOL_MIN_N };
  }

  function bristolZone(type) { return type <= 2 ? 'hard' : type <= 5 ? 'normal' : 'loose'; }

  /** Diet item over diary rows in range: unit-free frequency + per-day mean in the item's own unit. */
  function dietItemStats(rows, group, key) {
    var n = 0, days = 0, sum = 0, max = 0;
    (rows || []).forEach(function (r) {
      var v = r && r[group] ? r[group][key] : null;
      if (!isNum(v)) return;
      n++; sum += v; if (v > 0) days++; if (v > max) max = v;
    });
    return { n: n, daysConsumed: days, share: n ? days / n : null, meanPerDay: n ? sum / n : null, max: n ? max : null };
  }

  // ------------------------------------------------------------------ list rows / cohort
  function normalizeStatus(s) { return s === 'dead' ? 'dead' : s === 'inactive' ? 'inactive' : 'active'; }

  /**
   * Field names of the extended API live ONLY here. If the API contract renames a field,
   * change this map and nothing else.
   */
  var EXT = Object.freeze({
    serverToday: 'server_today',
    larsRecent: 'lars_recent',                     // [{date, score}] last 12 scored weekly entries
    firstLarsScore: 'first_lars_score', firstLarsDate: 'first_lars_date',
    vasRecent: 'vas_recent',                       // [{date, score}] all EQ-5D rows with a VAS
    eqCount: 'eq5d5l_count',
    lastEqAnyDate: 'last_eq5d5l_entry_date',       // any EQ-5D row, also without VAS
    lastWeeklyDate: 'last_weekly_date', lastDailyDate: 'last_daily_date', lastMonthlyDate: 'last_monthly_date',
    adhDone: 'adherence_days_with_entry', adhExpected: 'adherence_days_expected'
  });

  function has(obj, key) { return obj != null && Object.prototype.hasOwnProperty.call(obj, key); }

  /** Which extended fields a /getPatients row carries. Key PRESENT (even null) = new backend. */
  function listRowCaps(row) {
    return {
      larsRecent: has(row, EXT.larsRecent),
      firstLars: has(row, EXT.firstLarsScore),
      vasRecent: has(row, EXT.vasRecent),
      lastActivity: has(row, EXT.lastDailyDate) && has(row, EXT.lastMonthlyDate) && has(row, EXT.lastWeeklyDate),
      adherence: has(row, EXT.adhDone) && has(row, EXT.adhExpected),
      eqCount: has(row, EXT.eqCount)
    };
  }

  /** Which extended fields a /getPatientDetail response carries. */
  function detailCaps(detail) {
    var lars0 = detail && detail.lars_scores && detail.lars_scores[0];
    var daily0 = detail && detail.daily_entries && detail.daily_entries[0];
    return {
      larsItems: !!lars0 && has(lars0, 'urgency_to_toilet'),
      eqDims: !!detail && Array.isArray(detail.eq5d5l_entries),
      dailySymptoms: !!daily0 && has(daily0, 'urgency'),
      monthly: !!detail && Array.isArray(detail.monthly_entries),
      serverToday: has(detail, EXT.serverToday)
    };
  }

  function seriesFromPairs(rows) {
    return (rows || []).map(function (r) { return { day: parseDay(r.date), score: r.score }; })
      .filter(function (p) { return p.day != null && isNum(p.score); })
      .sort(function (a, b) { return a.day - b.day; });
  }

  /**
   * One /getPatients row -> the model every list cell, KPI and attention rule reads.
   * ctx = {today, meDoctorCode}
   */
  function summarizeListRow(row, ctx) {
    var today = ctx.today;
    var caps = listRowCaps(row);
    var startDay = dayFromTimestamp(row.created_at);
    var status = normalizeStatus(row.status);
    var counts = {
      weekly: row.weekly_count || 0, daily: row.daily_count || 0, monthly: row.monthly_count || 0,
      eq5d5l: caps.eqCount ? (row[EXT.eqCount] || 0) : null
    };

    var lars = { latest: validLars(row.last_lars_score), latestDay: parseDay(row.last_lars_date) };
    lars.category = larsCategory(lars.latest);
    lars.first = caps.firstLars ? validLars(row[EXT.firstLarsScore]) : null;
    lars.firstDay = caps.firstLars ? parseDay(row[EXT.firstLarsDate]) : null;
    lars.delta = (lars.first != null && lars.latest != null && lars.firstDay != null && lars.firstDay !== lars.latestDay)
      ? lars.latest - lars.first : null;
    lars.recent = caps.larsRecent ? seriesFromPairs(row[EXT.larsRecent]) : null;
    lars.trend = lars.recent && lars.recent.length ? larsTrend(lars.recent) : null;

    var vasLatest = isNum(row.last_eq5d5l_score) ? row.last_eq5d5l_score : null;
    var vas = { latest: vasLatest, latestDay: parseDay(row.last_eq5d5l_date), change: null };
    if (caps.vasRecent) vas.change = vasChange(seriesFromPairs(row[EXT.vasRecent]));

    var lastDay = null;
    if (caps.lastActivity) {
      [row[EXT.lastDailyDate], row[EXT.lastWeeklyDate], row[EXT.lastMonthlyDate],
        caps.eqCount ? row[EXT.lastEqAnyDate] : row.last_eq5d5l_date].forEach(function (s) {
        var d = parseDay(s);
        if (d != null && (lastDay == null || d > lastDay)) lastDay = d;
      });
      if (lastDay != null && lastDay > today) lastDay = today;
    }
    var lastEqDay = caps.eqCount ? parseDay(row[EXT.lastEqAnyDate]) : vas.latestDay;

    var adherence;
    if (caps.adherence) adherence = adherenceResult(row[EXT.adhDone] || 0, row[EXT.adhExpected] || 0, false);
    else if (startDay != null) adherence = adherenceFromCounts(counts, startDay, today);
    else adherence = adherenceResult(0, 0, true);

    var s = {
      code: row.patient_code, startDay: startDay, dayInStudy: startDay == null ? null : today - startDay,
      status: status, doctorCode: row.doctor_code || null,
      isMine: !!(ctx.meDoctorCode && row.doctor_code && row.doctor_code === ctx.meDoctorCode),
      counts: counts, lars: lars, vas: vas, lastActivityDay: lastDay, lastEqDay: lastEqDay,
      adherence: adherence, caps: caps
    };
    s.attention = attentionReasons(s, today);
    s.attentionRank = attentionRank(s.attention);
    return s;
  }

  /**
   * "Needs attention" reasons for ACTIVE patients. Returns [{code, severity, ...params}].
   * Codes: lars_worse, vas_drop (clinical) · not_started, no_entry, no_lars (engagement) · eq_overdue (protocol)
   */
  function attentionReasons(s, today) {
    if (s.status !== 'active' || s.startDay == null) return [];
    var R = [];
    var started = s.caps.lastActivity
      ? s.lastActivityDay != null
      : (s.counts.weekly + s.counts.daily + s.counts.monthly > 0) || s.vas.latestDay != null || s.lars.latestDay != null;

    if (!started) {
      if (s.dayInStudy >= C.ATTN_NOT_STARTED_DAYS) R.push({ code: 'not_started', severity: 'engagement', days: s.dayInStudy });
      return R;                                   // nothing else is meaningful before the first entry
    }

    var t = s.lars.trend;
    if (t && t.change === 'worse' && s.lars.latestDay != null && today - s.lars.latestDay <= C.ATTN_RECENT_DAYS) {
      R.push({ code: 'lars_worse', severity: 'clinical', from: t.previous.category, to: t.current.category,
        median: t.current.median });
    }
    var vc = s.vas.change;
    if (vc && vc.deltaPrevious != null && vc.deltaPrevious <= -C.ATTN_VAS_DROP && today - vc.latestDay <= C.ATTN_RECENT_DAYS) {
      R.push({ code: 'vas_drop', severity: 'clinical', delta: vc.deltaPrevious, latest: vc.latest });
    }

    if (s.caps.lastActivity) {
      var gap = today - s.lastActivityDay;
      if (gap >= C.ATTN_NO_ENTRY_DAYS) R.push({ code: 'no_entry', severity: 'engagement', days: gap });
    } else if (s.lars.latestDay == null) {
      if (s.dayInStudy >= C.ATTN_NO_LARS_DAYS) R.push({ code: 'no_lars', severity: 'engagement', days: null });
    } else if (today - s.lars.latestDay >= C.ATTN_NO_LARS_DAYS) {
      R.push({ code: 'no_lars', severity: 'engagement', days: today - s.lars.latestDay });
    }

    var engaged = !R.some(function (r) { return r.severity === 'engagement'; });
    if (engaged) {                                // an overdue EQ-5D is a consequence of a gap; don't repeat it
      var od = eqOverdueFromLast(s.startDay, s.lastEqDay, today);
      if (od) R.push({ code: 'eq_overdue', severity: 'protocol', point: od.point, days: od.days });
    }
    R.sort(function (a, b) { return CODE_RANK[a.code] - CODE_RANK[b.code]; });
    return R;
  }

  /** 0 clinical · 1 engagement · 2 protocol · 3 none (sort ascending). */
  function attentionRank(reasons) {
    var r = 3;
    (reasons || []).forEach(function (x) { r = Math.min(r, SEVERITY_RANK[x.severity]); });
    return r;
  }

  /** Default list order: attention first (by rank, then by the biggest gap), then newest registration. */
  function compareDefault(a, b) {
    if (a.attentionRank !== b.attentionRank) return a.attentionRank - b.attentionRank;
    var ga = gapOf(a), gb = gapOf(b);
    if (ga !== gb) return gb - ga;
    return (b.startDay == null ? -Infinity : b.startDay) - (a.startDay == null ? -Infinity : a.startDay);
  }
  function gapOf(s) {
    var g = 0;
    (s.attention || []).forEach(function (r) { if (isNum(r.days) && r.days > g) g = r.days; });
    return g;
  }

  /** Generic comparator: nulls ALWAYS last, whatever the direction. dir = 1 | -1 */
  function compareNullsLast(a, b, dir) {
    var an = a == null || (typeof a === 'number' && isNaN(a)), bn = b == null || (typeof b === 'number' && isNaN(b));
    if (an && bn) return 0;
    if (an) return 1;
    if (bn) return -1;
    if (typeof a === 'string') return dir * a.localeCompare(b);
    return dir * (a - b);
  }

  /** Case- and accent-insensitive search key (Lithuanian ą č ę ė į š ų ū ž -> a c e e i s u u z). */
  function searchKey(s) {
    return String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  }

  /** Cohort figures for one scope (array of summaries). */
  function cohortStats(summaries, today) {
    var st = { active: 0, inactive: 0, dead: 0, total: summaries.length, new30: 0 };
    var cat = { none: 0, minor: 0, major: 0, nodata: 0 };
    var attention = 0, reasonCounts = {}, adh = [], adhApprox = false, larsScores = [], vas = [];
    summaries.forEach(function (s) {
      st[s.status]++;
      if (s.startDay != null && s.startDay >= today - 29) st.new30++;
      if (s.status !== 'active') return;
      if (s.lars.category) { cat[s.lars.category]++; larsScores.push(s.lars.latest); } else cat.nodata++;
      if (s.attention.length) attention++;
      s.attention.forEach(function (r) { reasonCounts[r.code] = (reasonCounts[r.code] || 0) + 1; });
      if (s.adherence.ratio != null) { adh.push(s.adherence.ratio); if (s.adherence.approx) adhApprox = true; }
      if (s.vas.latest != null) vas.push(s.vas.latest);
    });
    var withScore = cat.none + cat.minor + cat.major;
    return {
      status: st, larsCategories: cat, attention: attention, reasonCounts: reasonCounts,
      adherenceMedian: median(adh), adherenceN: adh.length, adherenceApprox: adhApprox, adherenceValues: adh,
      majorShare: withScore ? cat.major / withScore : null, withScore: withScore,
      larsScores: larsScores, vasValues: vas, vasMedian: median(vas)
    };
  }

  /** Latest-LARS histogram: 14 bins whose edges sit on the category limits (20|21, 29|30). */
  var LARS_BIN_STARTS = [0, 3, 6, 9, 12, 15, 18, 21, 24, 27, 30, 33, 36, 39];
  function larsHistogram(scores) {
    var bins = LARS_BIN_STARTS.map(function (lo, i) {
      var hi = i + 1 < LARS_BIN_STARTS.length ? LARS_BIN_STARTS[i + 1] - 1 : 42;
      return { lo: lo, hi: hi, n: 0, category: larsCategory(lo) };
    });
    numbers(scores).forEach(function (v) {
      for (var i = bins.length - 1; i >= 0; i--) if (v >= bins[i].lo) { bins[i].n++; break; }
    });
    return bins;
  }

  /** 'good' | 'partial' | 'poor' | null, judged on the DISPLAYED percent (what the doctor reads). */
  function adherenceLevel(ratio) {
    var pp = percentParts(ratio);
    if (!pp) return null;
    var p = pp.prefix === '>' ? 99.5 : pp.prefix === '<' ? 0.5 : pp.value;
    return p >= C.ADHERENCE_GOOD_FROM ? 'good' : p < C.ADHERENCE_POOR_BELOW ? 'poor' : 'partial';
  }

  /** Adherence histogram: 10 bins of 10 % by the DISPLAYED percent (0-9 ... 90-100); edges sit on 50 and 80. */
  function adherenceHistogram(ratios) {
    var bins = [];
    for (var i = 0; i < 10; i++) bins.push({ lo: i * 10, hi: i === 9 ? 100 : i * 10 + 9, n: 0, level: adherenceLevel((i * 10 + 5) / 100) });
    numbers(ratios).forEach(function (r) {
      var p = percentParts(r).value;
      bins[Math.min(9, Math.floor(p / 10))].n++;
    });
    return bins;
  }

  /** Cumulative enrolment: [{day, total}] one point per registration day. */
  function enrolmentSeries(startDays) {
    var counts = new Map();
    numbers(startDays).forEach(function (d) { counts.set(d, (counts.get(d) || 0) + 1); });
    var days = Array.from(counts.keys()).sort(function (a, b) { return a - b; }), total = 0;
    return days.map(function (d) { total += counts.get(d); return { day: d, total: total }; });
  }

  // ------------------------------------------------------------------ time range / axis
  var RANGE_DAYS = { '1m': 30, '3m': 91, '6m': 182, '1y': 365 };

  /** Range key -> {from, to, days}. 'all' starts on day 0. Never starts before day 0. */
  function rangeWindow(key, startDay, today) {
    var from = key === 'all' || !RANGE_DAYS[key] ? startDay : Math.max(startDay, today - RANGE_DAYS[key] + 1);
    return { from: from, to: today, days: today - from + 1 };
  }

  /**
   * A24: first day of the daily-diary window (the API sends daily_entries for the last 730 days only).
   * Diary-based cards start here; LARS, EQ-5D-5L and monthly cards keep the full range.
   */
  function diaryWindowStart(startDay, today) {
    return Math.max(startDay, today - C.DIARY_WINDOW_DAYS + 1);
  }

  /** Range of a diary-based card: {from, to, days, clipped}; clipped = show the "Diary: last 2 years" note. */
  function diaryRange(range, startDay, today) {
    var from = Math.max(range.from, diaryWindowStart(startDay, today));
    return { from: from, to: range.to, days: range.to - from + 1, clipped: from > range.from };
  }

  /** Default range for a patient: All up to 182 days in study, else 6M. */
  function defaultRange(startDay, today) {
    return today - startDay <= 182 ? 'all' : '6m';
  }

  /** Time zero for "since surgery": stoma closure if there was a stoma, else operation date. */
  function surgeryRefDay(reg) {
    if (!reg) return null;
    var closure = parseDay(reg.ileostomy_closure_date);
    if (reg.ileostomy === 1 && closure != null) return { day: closure, kind: 'closure' };
    if (reg.ileostomy === 1) return null;                       // stoma not closed / unknown: no time zero
    var op = parseDay(reg.operation_date);
    if (op == null) op = parseDay(reg.index_operation_date);
    return op == null ? null : { day: op, kind: 'surgery' };
  }

  // ------------------------------------------------------------------ export
  var API = {
    C: C, PRIORITY: PRIORITY, EXT: EXT,
    parseDay: parseDay, dayFromTimestamp: dayFromTimestamp, dayToIso: dayToIso, dayToMs: dayToMs,
    todayDay: todayDay, isoWeekStart: isoWeekStart,
    roundTo: roundTo, median: median, quantile: quantile, mean: mean, percentParts: percentParts,
    larsCategory: larsCategory, larsItemPoints: larsItemPoints, larsSeries: larsSeries,
    rollingMedianAt: rollingMedianAt, rollingMedianSeries: rollingMedianSeries, larsTrend: larsTrend,
    firstLatest: firstLatest, withGapBreaks: withGapBreaks,
    eqLevel: eqLevel, eqEntries: eqEntries, eqProfileCode: eqProfileCode, eqLevelSum: eqLevelSum, pchc: pchc, eqVsBaseline: eqVsBaseline,
    eqMilestones: eqMilestones, eqMilestoneSummary: eqMilestoneSummary, eqOverdueFromLast: eqOverdueFromLast,
    vasChange: vasChange,
    activityMap: activityMap, adherenceWindow: adherenceWindow, adherence30: adherence30,
    adherenceInRange: adherenceInRange, adherenceFromCounts: adherenceFromCounts, lastActivity: lastActivity,
    dailyPoints: dailyPoints, rollingMeanSeries: rollingMeanSeries, buckets: buckets, blockStartFn: blockStartFn,
    bristolStats: bristolStats, bristolZone: bristolZone, dietItemStats: dietItemStats,
    normalizeStatus: normalizeStatus, listRowCaps: listRowCaps, detailCaps: detailCaps,
    summarizeListRow: summarizeListRow, attentionReasons: attentionReasons, attentionRank: attentionRank,
    compareDefault: compareDefault, compareNullsLast: compareNullsLast, searchKey: searchKey,
    cohortStats: cohortStats, larsHistogram: larsHistogram, adherenceHistogram: adherenceHistogram, adherenceLevel: adherenceLevel,
    enrolmentSeries: enrolmentSeries, rangeWindow: rangeWindow, defaultRange: defaultRange,
    diaryWindowStart: diaryWindowStart, diaryRange: diaryRange, surgeryRefDay: surgeryRefDay
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else root.ILARS_METRICS = API;
})(typeof window !== 'undefined' ? window : this);
