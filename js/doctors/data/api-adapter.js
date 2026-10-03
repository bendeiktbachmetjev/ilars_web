/* data/api-adapter.js — the ONLY place that knows the wire names of API v2 (design/API-CONTRACT.md).
   It turns either backend (today's production, or v2) into the internal shape that the reference
   metrics.js / view-models.js read (their ILARS_METRICS.EXT names). Views never branch on the API version.
   Detection = key presence only (API-CONTRACT §7.1). Pure; no DOM. Namespace ILARS_DATA.
   Target: web/js/doctors/data/api-adapter.js (+ node tests). */
(function (root) {
  'use strict';
  var D = root.ILARS_DATA = root.ILARS_DATA || {};
  function has(o, k) { return o != null && Object.prototype.hasOwnProperty.call(o, k); }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  /** GET /getPatients response -> {today, v2, rows[]}; rows carry the internal EXT keys when v2. */
  D.adaptList = function (resp) {
    var v2 = has(resp, 'as_of_date');
    var rows = (resp.patients || []).map(function (p) {
      var r = clone(p);
      if (!has(p, 'adherence_30d')) return r;                       // today's backend: leave untouched
      // VAS series for vasChange(): first, previous, latest (deduplicated by date)
      var vas = [[p.first_eq5d5l_date, p.first_eq5d5l_score], [p.prev_eq5d5l_date, p.prev_eq5d5l_score], [p.last_eq5d5l_date, p.last_eq5d5l_score]]
        .filter(function (x) { return x[0] && x[1] != null; });
      var seen = {};
      r.vas_recent = vas.filter(function (x) { if (seen[x[0]]) return false; seen[x[0]] = 1; return true; })
        .sort(function (a, b) { return a[0] < b[0] ? -1 : 1; }).map(function (x) { return { date: x[0], score: x[1] }; });
      var ld = p.last_dates || {};
      r.last_daily_date = ld.daily || null; r.last_weekly_date = ld.weekly || null; r.last_monthly_date = ld.monthly || null;
      r.last_eq5d5l_entry_date = ld.eq5d5l || null;
      r.adherence_days_with_entry = (p.adherence_30d || {}).days_with_entry || 0;
      r.adherence_days_expected = (p.adherence_30d || {}).days_expected || 0;
      if (resp.as_of_date) r.server_today = resp.as_of_date;
      return r;
    });
    return { v2: v2, today: resp.as_of_date || null, rows: rows, larsHistory: rows.some(function (r) { return has(r, 'lars_history'); }) };
  };

  /** GET /getPatientDetail response -> internal detail (same keys today's portal reads + v2 extras in internal form). */
  var YES = function (b) { return b == null ? null : (b ? 'Yes' : 'No'); };
  var LEAK = { none: 'None', liquid: 'Liquid', solid: 'Solid' };
  D.adaptDetail = function (resp) {
    var d = clone(resp);
    if (has(resp, 'as_of_date')) d.server_today = resp.as_of_date;
    // weekly: every row, score ?? points_total, item answers as stored option indices
    if (Array.isArray(resp.weekly_entries)) {
      d.lars_scores = resp.weekly_entries.map(function (w) {
        var row = { date: w.date, score: w.score != null ? w.score : w.points_total, calculated: w.score == null };
        var a = w.answers || {};
        ['flatus_control', 'liquid_stool_leakage', 'bowel_frequency', 'repeat_bowel_opening', 'urgency_to_toilet'].forEach(function (k) { row[k] = a[k]; });
        return row;
      }).filter(function (r) { return r.score != null; });
    }
    // EQ-5D-5L: v2 levels are already 1-5; metrics.js expects stored 0-4 (+1 itself)
    if (Array.isArray(resp.eq5d5l_entries)) {
      d.eq5d5l_entries = resp.eq5d5l_entries.map(function (e) {
        var lv = e.levels || {}, row = { date: e.date, health_vas: e.vas };
        ['mobility', 'self_care', 'usual_activities', 'pain_discomfort', 'anxiety_depression'].forEach(function (k) { row[k] = lv[k] == null ? null : lv[k] - 1; });
        return row;
      });
    }
    // diary v2 fields: bool -> 'Yes'/'No', enum -> 'None'/'Liquid'/'Solid'; absent in legacy (never 0)
    (d.daily_entries || []).forEach(function (r) {
      if (!has(r, 'pads_used')) return;
      r.urgency = YES(r.urgency); r.night_stools = YES(r.night_stools); r.incomplete_evacuation = YES(r.incomplete_evacuation);
      r.leakage = r.leakage == null ? null : (LEAK[r.leakage] || null);
    });
    return d;
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = D;
})(typeof window !== 'undefined' ? window : this);
