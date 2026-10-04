/* data/cohort-model.js — view model of the iLARS Patients list and Overview (CHARTS-METRICS §5–§6,
   DESIGN-SPEC §4.2–§4.3). Pure: no DOM, no fetch, no Date.now(). Uses ILARS_METRICS (every threshold lives in
   its frozen config C). Adds to ILARS_VIEW_MODELS (data/patient-model.js adds the patient models to the same
   namespace; this file loads after it and merges, never replaces). Tests: web/tests/doctor/cohort.test.js. */
(function (root) {
  'use strict';
  var M = root.ILARS_METRICS || (typeof require === 'function' ? require('./metrics.js') : null);

  var STATUSES = ['active', 'inactive', 'dead', 'all'];
  var SORT_KEYS = ['patient', 'day', 'lars', 'vas', 'adherence', 'last'];
  // hero KPI: equal counts are listed in the clinical order of the reasons (CHARTS-METRICS §4)
  var REASON_ORDER = ['lars_worse', 'vas_drop', 'no_entry', 'no_lars', 'not_started', 'eq_overdue'];

  /**
   * rows = adapted /getPatients?status=all rows; ctx = {today, meDoctorCode, scope: 'mine' | 'all'}.
   * all/scoped = M.summarizeListRow() summaries; stats = M.cohortStats(scoped);
   * attention = active patients in scope with ≥ 1 reason, in the default order; startDays of the scope.
   */
  function cohortModel(rows, ctx) {
    var all = (rows || []).map(function (r) { return M.summarizeListRow(r, ctx); });
    var scoped = ctx.scope === 'mine' ? all.filter(function (s) { return s.isMine; }) : all;
    var stats = M.cohortStats(scoped, ctx.today);
    var attention = scoped.filter(function (s) { return s.status === 'active' && s.attention.length; }).sort(M.compareDefault);
    return { all: all, scoped: scoped, stats: stats, attention: attention,
      startDays: scoped.map(function (s) { return s.startDay; }).filter(function (d) { return d != null; }) };
  }

  /** A stored list state is trusted only as far as it is valid (sessionStorage outlives code changes). */
  function validStatus(v) { return STATUSES.indexOf(v) > -1 ? v : 'active'; }
  function validSort(s) {
    return s && SORT_KEYS.indexOf(s.key) > -1 && (s.dir === 'asc' || s.dir === 'desc') ? { key: s.key, dir: s.dir } : null;
  }

  /** Header click cycle (DESIGN-SPEC §3.7, CHARTS-METRICS §6.2): first click = the column's natural order
      (LARS high → low, everything else low → high / A → Z), second click = reversed, third = default order. */
  function nextSort(cur, key) {
    var first = key === 'lars' ? 'desc' : 'asc';
    if (!cur || cur.key !== key) return { key: key, dir: first };
    if (cur.dir === first) return { key: key, dir: first === 'asc' ? 'desc' : 'asc' };
    return null;
  }

  /** Comparator for a header sort; nulls always last (M.compareNullsLast). names = {code: "First Last"}.
      Patient: stored names A→Z first, then the bare codes, in both directions. */
  function sorter(sort, names) {
    if (!sort) return M.compareDefault;
    names = names || {};
    var dir = sort.dir === 'asc' ? 1 : -1;
    if (sort.key === 'patient') {
      return function (a, b) {
        var na = names[a.code], nb = names[b.code];
        if (na && !nb) return -1;
        if (nb && !na) return 1;
        return dir * (na ? na.localeCompare(nb) : String(a.code).localeCompare(String(b.code))) || M.compareDefault(a, b);
      };
    }
    var get = {
      day: function (x) { return x.status === 'dead' ? null : x.dayInStudy; },   // deceased: no day count, sorted last
      lars: function (x) { return x.lars.latest; },
      vas: function (x) { return x.vas.latest; },
      adherence: function (x) { return x.status === 'dead' ? null : x.adherence.ratio; },   // "Not tracked": sorted last
      last: function (x) { return x.lastActivityDay; }
    }[sort.key];
    return function (a, b) { return M.compareNullsLast(get(a), get(b), dir) || M.compareDefault(a, b); };
  }

  /** Name or code contains the query (case- and accent-insensitive; spaces of a grouped code are ignored). */
  function matches(s, q, names) {
    var k = M.searchKey(q);
    if (!k) return true;
    var code = M.searchKey(s.code);
    return M.searchKey(names[s.code] || '').indexOf(k) > -1 || code.indexOf(k) > -1 || code.indexOf(k.replace(/\s+/g, '')) > -1;
  }

  /**
   * The list for one state. scoped = cohortModel().scoped; st = {status, attention, q, sort}.
   * counts (per status + all) follow scope + search + attention toggle — everything except the status itself.
   * attentionN = active patients with a reason in the scope (the chip count; independent of search).
   */
  function listRows(scoped, st, names) {
    names = names || {};
    var counts = { active: 0, inactive: 0, dead: 0, all: 0 };
    var pre = scoped.filter(function (s) {
      if (st.attention && !(s.status === 'active' && s.attention.length)) return false;
      return matches(s, st.q, names);
    });
    pre.forEach(function (s) { counts[s.status]++; });
    counts.all = pre.length;
    var rows = pre.filter(function (s) { return st.status === 'all' || s.status === st.status; });
    rows.sort(sorter(st.sort, names));
    return { rows: rows, counts: counts,
      attentionN: scoped.filter(function (s) { return s.status === 'active' && s.attention.length; }).length };
  }

  /** The k most frequent attention reasons: [{code, n}] (hero KPI meta "2 with no entry · 1 VAS drop"). */
  function topReasons(reasonCounts, k) {
    return Object.keys(reasonCounts || {}).filter(function (c) { return reasonCounts[c] > 0; })
      .sort(function (a, b) { return reasonCounts[b] - reasonCounts[a] || REASON_ORDER.indexOf(a) - REASON_ORDER.indexOf(b); })
      .slice(0, k == null ? 2 : k).map(function (c) { return { code: c, n: reasonCounts[c] }; });
  }

  var API = { cohortModel: cohortModel, listRows: listRows, nextSort: nextSort, sorter: sorter, validSort: validSort,
    validStatus: validStatus, topReasons: topReasons };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else root.ILARS_VIEW_MODELS = Object.assign(root.ILARS_VIEW_MODELS || {}, API);
})(typeof window !== 'undefined' ? window : this);
