/*
 * charts/sparkline.js — LARS sparkline for the patient list (96×28) and the KPI hero tile (120×32).
 * Plain SVG string, no ECharts (CHARTS-METRICS §6.4). Adds to ILARS_CHART_OPTIONS.
 */
(function (root) {
  'use strict';
  var O = root.ILARS_CHART_OPTIONS || (typeof require === 'function' ? require('./base.js') : null);
  var C = O._.C;

  /**
   * series [{day, score}] -> geometry in a w×h box. y domain FIXED 0..42 (rows stay comparable).
   * Segments break where two scores are > LARS_GAP_BREAK_DAYS apart. One point -> dot only (right edge).
   */
  function sparkGeometry(series, w, h, pad) {
    pad = pad == null ? 3 : pad;
    if (!series || !series.length) return null;
    var d0 = series[0].day, d1 = series[series.length - 1].day;
    var r1 = function (v) { return Math.round(v * 10) / 10; };
    var px = function (d) { return d1 === d0 ? w - pad : r1(pad + (d - d0) / (d1 - d0) * (w - 2 * pad)); };
    var py = function (s) { return r1(pad + (1 - s / C.LARS_MAX) * (h - 2 * pad)); };
    var segs = [], cur = [];
    series.forEach(function (p, i) {
      if (i > 0 && p.day - series[i - 1].day > C.LARS_GAP_BREAK_DAYS) { if (cur.length) segs.push(cur); cur = []; }
      cur.push([px(p.day), py(p.score)]);
    });
    if (cur.length) segs.push(cur);
    var last = series[series.length - 1];
    return { segments: segs.filter(function (s) { return s.length > 1; }), last: { x: px(last.day), y: py(last.score), score: last.score },
      guides: [py(C.LARS_MINOR_FROM), py(C.LARS_MAJOR_FROM)] };
  }

  /** SVG string; aria-hidden (the cell carries an sr-only sentence). Colours from tokens. */
  function sparklineSVG(series, tok, w, h) {
    w = w || 96; h = h || 28;
    var g = sparkGeometry(series, w, h);
    if (!g) return '';
    var s = '<svg class="spark" width="' + w + '" height="' + h + '" viewBox="0 0 ' + w + ' ' + h + '" aria-hidden="true" focusable="false">';
    g.guides.forEach(function (y) { s += '<line x1="0" x2="' + w + '" y1="' + y + '" y2="' + y + '" stroke="' + tok.sparkGuide + '" stroke-width="1"/>'; });
    g.segments.forEach(function (seg) {
      s += '<polyline points="' + seg.map(function (p) { return p.join(','); }).join(' ') + '" fill="none" stroke="' + tok.spark +
        '" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round"/>';
    });
    s += '<circle cx="' + g.last.x + '" cy="' + g.last.y + '" r="3" fill="' + tok.sparkLast + '" stroke="' + tok.surface + '" stroke-width="1.5"/></svg>';
    return s;
  }

  O.sparkGeometry = sparkGeometry;
  O.sparklineSVG = sparklineSVG;
  if (typeof module !== 'undefined' && module.exports) module.exports = O;
})(typeof window !== 'undefined' ? window : this);
