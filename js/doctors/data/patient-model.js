/*
 * data/patient-model.js — one /getPatientDetail response (adapted by ILARS_DATA.adaptDetail) -> the view models of
 * the patient dashboard: range-independent patient model, KPI tiles, and range-dependent card models.
 * Pure (no DOM, no Date.now() unless no "today" is given). Uses ILARS_METRICS. Namespace ILARS_VIEW_MODELS
 * (shared with data/cohort-model.js: each file adds its own functions).
 * Source: design/charts-metrics/view-models.js (CHARTS-METRICS §7) + DESIGN-SPEC Appendix A:
 *   A6  EQ-5D-5L change words compare every visit with DAY 0 (ILARS_METRICS.eqVsBaseline), not the previous visit;
 *   A18 every weekly LARS point keeps the stored answer index per item (`answers`) for the table twin;
 *   A24 card models carry `today` and the clipped diary range (`diary`) for the "Diary: last 2 years" note.
 */
(function (root) {
  'use strict';
  var M = root.ILARS_METRICS || (typeof require === 'function' ? require('./metrics.js') : null);
  var C = M.C;

  /** Stored answer index per LARS item (0-2, frequency 0-3), keyed by day; null when the row has no items. */
  function answersByDay(rows) {
    var out = new Map();
    (rows || []).forEach(function (r) {
      var day = M.parseDay(r && r.date);
      if (day == null || out.has(day)) return;
      var a = {}, ok = true;
      C.LARS_ITEM_KEYS.forEach(function (k) { if (typeof r[k] !== 'number') ok = false; else a[k] = r[k]; });
      out.set(day, ok ? a : null);
    });
    return out;
  }

  /**
   * One adapted /getPatientDetail response -> everything the dashboard needs, range-independent.
   * opts = {nowMs?, registryRow?, deathDay?} (registryRow = the linked LT registry record, if any; deathDay = day
   * of the change to "dead" from the status history, when it is known)
   * trackEnd = first day that is no longer expected (exclusive end of "missed" days): today; for a deceased
   * patient the day of the status change, or — when the history is not known — the day after the last entry.
   */
  function patientModel(detail, opts) {
    opts = opts || {};
    var caps = M.detailCaps(detail);
    var today = M.todayDay(detail.server_today, opts.nowMs);
    var startDay = M.dayFromTimestamp(detail.created_at);
    if (startDay == null) startDay = today;

    var lars = M.larsSeries(detail.lars_scores);
    var ans = answersByDay(detail.lars_scores);
    lars.forEach(function (p) { p.answers = ans.get(p.day) || null; });
    var eq = M.eqEntries(detail);
    // A diary row dated the day after today is today's row (the web app saves the patient's local date, which runs
    // ahead of UTC after local midnight; API-CONTRACT §3.2), as in the activity map and the list. It is the newest
    // entry, so it is the one shown for today (one diary value per day).
    var daily = (detail.daily_entries || []).map(function (r) {
      var day = M.parseDay(r.date);
      return day === today + 1 ? Object.assign({}, r, { day: today, date: M.dayToIso(today), aheadOf: r.date }) : Object.assign({ day: day }, r);
    }).filter(function (r) { return r.day != null; });
    if (daily.some(function (r) { return r.aheadOf; })) daily = daily.filter(function (r) { return r.aheadOf || r.day !== today; });
    daily.sort(function (a, b) { return a.day - b.day; });
    var monthly = caps.monthly ? detail.monthly_entries.map(function (r) { return Object.assign({ day: M.parseDay(r.date) }, r); })
      .filter(function (r) { return r.day != null; }).sort(function (a, b) { return a.day - b.day; }) : null;
    var steps = M.dailyPoints(detail.daily_steps, 'steps');

    var act = M.activityMap({
      daily: daily.map(function (r) { return r.day; }),
      weekly: lars.map(function (r) { return r.day; }),
      monthly: monthly ? monthly.map(function (r) { return r.day; }) : [],
      eq5d5l: eq.map(function (r) { return r.day; })
    }, today);

    // EQ-5D-5L visits = time points that arrived and are done or missed
    var milestones = M.eqMilestones(startDay, eq.map(function (e) { return e.day; }), today);
    var visits = [];
    milestones.forEach(function (m) {
      if (m.status !== 'done' && m.status !== 'missed') return;
      var e = m.status === 'done' ? eq.filter(function (x) { return x.day === m.day; })[0] : null;
      visits.push({ point: m.point, status: m.status, day: e ? e.day : null, levels: e ? e.levels : null, vas: e ? e.vas : null,
        lateDays: m.lateDays == null ? null : m.lateDays, pchc: null });
    });
    // A6: change words compare with the baseline visit (day 0, or the first done visit when day 0 was missed)
    var vs = M.eqVsBaseline(visits);
    visits.forEach(function (v, i) { v.pchc = vs.pchc[i]; });
    // VAS figures come from the visits (the first entry of each visit window), like the VAS chart and the table:
    // a second EQ-5D-5L inside one window never moves the KPI or the takeaway to another entry. firstPoint names
    // the reference visit ("than day 14" when the day-0 visit has no VAS), latestPoint the visit shown.
    var vasVisits = visits.filter(function (v) { return v.vas != null; });
    var vas = M.vasChange(vasVisits.map(function (v) { return { day: v.day, score: v.vas }; }));
    if (vas) { vas.firstPoint = vasVisits[0].point; vas.latestPoint = vasVisits[vasVisits.length - 1].point; }

    // the registry API sends ileostomy as 0/1; coerce so a "1" string or a boolean still selects stoma closure
    var reg = opts.registryRow ? Object.assign({}, opts.registryRow, { ileostomy: +opts.registryRow.ileostomy }) : null;
    var status = M.normalizeStatus(detail.patient_status), last = M.lastActivity(act);
    var deathDay = status === 'dead' && opts.deathDay != null ? Math.max(startDay, Math.min(today, opts.deathDay)) : null;
    var trackEnd = status !== 'dead' ? today : deathDay != null ? deathDay : Math.min(today, last ? last.day + 1 : startDay);
    return {
      today: today, startDay: startDay, caps: caps, status: status, deathDay: deathDay, trackEnd: trackEnd,
      lars: lars, larsMedian: M.rollingMedianSeries(lars), larsFirst: M.firstLatest(lars), larsTrend: M.larsTrend(lars),
      preop: reg && reg.lars_baseline != null ? reg.lars_baseline : null,
      surgery: M.surgeryRefDay(reg),
      eq: eq, milestones: milestones, milestoneSummary: M.eqMilestoneSummary(milestones, today),
      visits: visits, eqBaselinePoint: vs.point,
      vas: vas,
      daily: daily, monthly: monthly, steps: steps, act: act,
      stool: M.dailyPoints(daily, 'stool_count'),
      bristol: M.dailyPoints(daily, 'bristol_scale'),
      bloating: M.dailyPoints(daily, 'bloating'),
      impact: M.dailyPoints(daily, 'impact_score'),
      pads: caps.dailySymptoms ? M.dailyPoints(daily, 'pads_used') : null
    };
  }

  /**
   * The one EQ-5D-5L visit the page talks about (EQ card note, "Coming up"): a visit past its due date first —
   * {kind: 'due'|'overdue', point, dueDay, overdueDays} — else the next upcoming one {kind: 'next', point, dueDay};
   * null when every visit is done, and for a deceased patient (no visit after death).
   */
  function eqVisitNotice(pm) {
    var s = pm.milestoneSummary;
    if (pm.status === 'dead') return null;
    if (s.open) return { kind: s.open.status === 'overdue' ? 'overdue' : 'due', point: s.open.point, dueDay: s.open.dueDay, overdueDays: s.open.overdueDays };
    return s.next ? { kind: 'next', point: s.next.point, dueDay: s.next.dueDay } : null;
  }

  /** Range-dependent slices for the chart cards. range = M.rangeWindow(key, startDay, today) */
  function cardModels(pm, range) {
    var from = range.from, to = range.to, today = pm.today, diary = M.diaryRange(range, pm.startDay, today);
    // A24: diary rows only inside the 730-day window, like the charts (the API may send one day more)
    var inD = function (p) { return p.day >= diary.from && p.day <= to; };
    var dailyIn = pm.daily.filter(inD);
    // Bristol "over time": the same diary window as its Types and Zones views (the oldest week never counts the
    // extra day the API sends before the window)
    var bweeks = M.buckets(pm.bristol, diary.from, to, M.isoWeekStart, 7, 'count').map(function (b) {
      var pts = pm.bristol.filter(function (p) { return p.day >= b.start && p.day < b.start + 7 && inD(p); });
      var st = M.bristolStats(pts);
      return { start: b.start, n: st.n, counts: st.zones };
    });
    return {
      diary: diary,
      lars: { points: pm.lars, median: pm.larsMedian, firstScore: pm.larsFirst ? pm.larsFirst.first : null, preop: pm.preop, from: from, to: to },
      eq: { visits: pm.visits, vasOnly: !pm.caps.eqDims },
      q: { from: from, to: to, today: today, end: pm.trackEnd, act: pm.act, adherence: M.adherenceInRange(pm.act, pm.startDay, from, Math.min(to, pm.trackEnd - 1), today) },
      stool: { from: from, to: to, today: today, end: pm.trackEnd, stool: pm.stool, mean: M.rollingMeanSeries(pm.stool, from, to), pads: pm.pads, act: pm.act },
      raster: pm.caps.dailySymptoms ? { from: from, to: to, today: today, rows: dailyIn } : null,
      bristol: { from: from, to: to, today: today, stats: M.bristolStats(pm.bristol.filter(inD)), weekly: bweeks },
      symptoms: { from: from, to: to, today: today, bloating: pm.bloating, impact: pm.impact,
        bloatingMean: M.rollingMeanSeries(pm.bloating, from, to), impactMean: M.rollingMeanSeries(pm.impact, from, to) },
      diet: { from: from, to: to, today: today, end: pm.trackEnd, rows: dailyIn },
      monthly: pm.monthly ? { from: from, to: to, rows: pm.monthly } : null,
      steps: { from: from, to: to, today: today, steps: pm.steps, mean: M.rollingMeanSeries(pm.steps, from, to) }
    };
  }

  /**
   * Patient KPI tiles (range-independent). Each tile: {hidden?, value, ...}; the view builds the text.
   * currentLars.calculated / median4w.calculated: the figure uses a weekly row without a stored total (A9, the total
   * is calculated from the answers), so the tile says so, like the LARS table and tooltip. The patient list counts
   * stored totals only, so without this note the two pages would show different figures with no reason given.
   */
  function patientKpis(pm) {
    var today = pm.today, tiles = {};
    var fl = pm.larsFirst;
    tiles.currentLars = fl ? { value: fl.latest, day: fl.latestDay, category: M.larsCategory(fl.latest), delta: fl.delta, firstDay: fl.firstDay,
      n: pm.lars.length, spark: pm.lars.slice(-C.LARS_RECENT_N), calculated: !!pm.lars[pm.lars.length - 1].calculated } : { value: null, empty: true };
    var tr = pm.larsTrend;
    tiles.median4w = tr && tr.current.median != null
      ? { value: tr.current.median, category: tr.current.category, previous: tr.previous.median, previousCategory: tr.previous.category, change: tr.change, delta: tr.delta,
        calculated: pm.lars.some(function (p) { return p.calculated && p.day >= tr.current.from && p.day <= tr.current.to; }) }
      : { hidden: true };
    tiles.vas = pm.vas ? { value: pm.vas.latest, day: pm.vas.latestDay, point: pm.vas.latestPoint, deltaFirst: pm.vas.deltaFirst, firstPoint: pm.vas.firstPoint,
      beyondMid: pm.vas.beyondMid } : { hidden: true };
    var adh = M.adherence30(pm.act, pm.startDay, today);
    tiles.adherence = { ratio: adh.ratio, done: adh.done, expected: adh.expected, reason: adh.reason, monthlyKnown: pm.caps.monthly };
    var la = M.lastActivity(pm.act);
    tiles.lastEntry = la ? { day: la.day, type: la.type, daysAgo: today - la.day, warn: pm.status === 'active' && today - la.day >= C.ATTN_NO_ENTRY_DAYS }
      : { empty: true };
    tiles.eqVisits = { done: pm.milestoneSummary.done, arrived: pm.milestoneSummary.arrived, next: pm.milestoneSummary.next, open: pm.milestoneSummary.open };

    // secondary strip
    var stool7 = pm.stool.filter(function (p) { return p.day >= today - 6 && p.day <= today; });
    var firstWeek = pm.stool.length ? pm.stool.filter(function (p) { return p.day <= pm.stool[0].day + 6; }) : [];
    // the first-week baseline is shown only when it does not overlap the current 7 days (§7.2: never the current week)
    var firstApart = pm.stool.length && pm.stool[0].day + 6 < today - 6;
    tiles.stool7 = stool7.length >= C.ROLLING_MIN_N ? {
      value: M.mean(stool7.map(function (p) { return p.value; })),
      firstWeek: firstWeek.length >= C.ROLLING_MIN_N && firstApart ? M.mean(firstWeek.map(function (p) { return p.value; })) : null
    } : { hidden: true };
    var br = M.bristolStats(pm.bristol.filter(function (p) { return p.day >= today - 29; }));
    tiles.bristol30 = br.n >= 7 ? { ratio: br.normalShare, n: br.n } : { hidden: true };
    var s7 = pm.steps.filter(function (p) { return p.day >= today - 7 && p.day <= today - 1; });
    var p7 = pm.steps.filter(function (p) { return p.day >= today - 14 && p.day <= today - 8; });
    tiles.steps7 = s7.length >= C.ROLLING_MIN_N ? {
      value: M.mean(s7.map(function (p) { return p.value; })),
      prevRatio: p7.length >= C.ROLLING_MIN_N ? M.mean(s7.map(function (p) { return p.value; })) / M.mean(p7.map(function (p) { return p.value; })) - 1 : null
    } : { hidden: true };
    return tiles;
  }

  var API = { patientModel: patientModel, cardModels: cardModels, patientKpis: patientKpis, eqVisitNotice: eqVisitNotice };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else root.ILARS_VIEW_MODELS = Object.assign(root.ILARS_VIEW_MODELS || {}, API);
})(typeof window !== 'undefined' ? window : this);
