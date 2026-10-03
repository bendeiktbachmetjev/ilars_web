/* data/cohort-trajectory.js — "LARS since registration" (iLARS Overview), built in the browser from
   GET /getPatients?status=all&include=lars_history (API-CONTRACT §4: there is no /getCohortSummary).
   Same maths as CHARTS-METRICS §2.3, on 4-WEEK BLOCKS (DESIGN-SPEC §4.3, Appendix A1):
   - per patient one median per block (block = 28 days since registration);
   - per block the cohort median, q1 and q3 (type-7 quantiles = ILARS_METRICS.quantile) and category counts;
   - blocks with fewer than C.COHORT_MIN_N (5) patients are dropped;
   - paired change = only patients with a value in block 0 AND in a block >= 3 (12+ weeks later), so patients
     who leave early cannot bend the result (no survivorship bias). Shown only when k >= COHORT_MIN_N.
   Pure; no DOM. Namespace ILARS_DATA. Tests: web/tests/doctor/{adapter,cohort}.test.js. */
(function (root) {
  'use strict';
  var D = root.ILARS_DATA = root.ILARS_DATA || {};
  var BLOCK = 28;

  /** rows = adapted list rows (with lars_history); M = ILARS_METRICS.
      Returns {blocks:[{block, week, n, median, q1, q3, none, minor, major}], paired: {k, delta} | null} */
  D.cohortTrajectory = function (rows, M) {
    var minN = M.C.COHORT_MIN_N;
    var perBlock = {};                  // block -> [patient medians]
    var firstLast = [];                 // [{first, last}]
    (rows || []).forEach(function (r) {
      if (!r) return;
      var day0 = M.dayFromTimestamp(r.created_at);
      if (day0 == null || !Array.isArray(r.lars_history)) return;
      var byBlock = {};
      r.lars_history.forEach(function (h) {
        var d = M.parseDay(h && h.date); if (d == null || d < day0 || h.score == null) return;
        var b = Math.floor((d - day0) / BLOCK);
        (byBlock[b] = byBlock[b] || []).push(h.score);
      });
      var keys = Object.keys(byBlock).map(Number).sort(function (a, b) { return a - b; });
      keys.forEach(function (b) { (perBlock[b] = perBlock[b] || []).push(M.median(byBlock[b])); });
      if (byBlock[0] && keys.length && keys[keys.length - 1] >= 3) {
        firstLast.push({ first: M.median(byBlock[0]), last: M.median(byBlock[keys[keys.length - 1]]) });
      }
    });
    var blocks = Object.keys(perBlock).map(Number).sort(function (a, b) { return a - b; }).map(function (b) {
      var v = perBlock[b], c = { none: 0, minor: 0, major: 0 };
      v.forEach(function (x) { c[M.larsCategory(x)]++; });
      return { block: b, week: b * 4, n: v.length, median: M.median(v), q1: M.quantile(v, 0.25), q3: M.quantile(v, 0.75), none: c.none, minor: c.minor, major: c.major };
    }).filter(function (r) { return r.n >= minN; });
    var paired = firstLast.length >= minN
      ? { k: firstLast.length, delta: M.median(firstLast.map(function (p) { return p.last - p.first; })) }
      : null;
    return { blocks: blocks, paired: paired };
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = D;
})(typeof window !== 'undefined' ? window : this);
