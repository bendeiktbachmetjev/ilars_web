/*
 * ILARS_CHART_THEME — reads the CSS tokens (css/doctor/tokens.css) into the `tok` object every chart
 * builder uses (CHARTS-METRICS §1.6, §9). Call readTokens() on every render (cheap) so a future dark
 * theme needs no chart changes.
 */
(function (root) {
  'use strict';
  // JS key -> CSS custom property (names owned by the colour lead)
  var MAP = {
    surface: '--viz-surface', hairline: '--viz-tooltip-border', ink: '--viz-tooltip-text', ink2: '--viz-tooltip-text-secondary',
    ink3: '--viz-axis-label', grid: '--viz-grid', axis: '--viz-axis', crosshair: '--viz-crosshair', refLine: '--viz-ref-line',
    hover: '--color-row-hover', empty: '--viz-empty', emptyBorder: '--viz-empty-border', zero: '--viz-zero', calMissed: '--viz-cal-missed-border',
    otherQ: '--viz-other-questionnaire', pointRing: '--viz-point-ring', bandNeutral: '--viz-band-neutral',
    seqInkLight: '--viz-seq-ink-light', seqInkDark: '--viz-seq-ink-dark', onDark: '--viz-seq-ink-dark',
    larsNone: '--color-lars-none', larsMinor: '--color-lars-minor', larsMajor: '--color-lars-major', larsUnknown: '--color-lars-unknown',
    larsNoneInk: '--color-lars-none-ink', larsMinorInk: '--color-lars-minor-ink', larsMajorInk: '--color-lars-major-ink',
    larsNoneWash: '--viz-band-lars-none', larsMinorWash: '--viz-band-lars-minor', larsMajorWash: '--viz-band-lars-major',
    metricLars: '--viz-metric-lars', metricEq: '--viz-metric-eq5d', metricMonthly: '--viz-metric-monthly',
    metricDiary: '--viz-metric-diary', metricSteps: '--viz-metric-steps',
    spark: '--viz-sparkline', sparkLast: '--viz-sparkline-last', sparkGuide: '--viz-sparkline-guide',
    deltaBetter: '--color-delta-better', deltaWorse: '--color-delta-worse', deltaNeutral: '--color-delta-neutral',
    adhGood: '--color-adherence-good', adhPartial: '--color-adherence-partial', adhPoor: '--color-adherence-poor', adhTrack: '--color-adherence-track'
  };
  var LISTS = {
    chart: ['--viz-1', '--viz-2', '--viz-3', '--viz-4', '--viz-5', '--viz-6', '--viz-7', '--viz-8'],
    seq: ['--viz-seq-100', '--viz-seq-200', '--viz-seq-300', '--viz-seq-400', '--viz-seq-500', '--viz-seq-600', '--viz-seq-700', '--viz-seq-800', '--viz-seq-900'],
    eqLevel: ['--viz-eq-1', '--viz-eq-2', '--viz-eq-3', '--viz-eq-4', '--viz-eq-5'],
    eqLevelText: ['--viz-eq-1-ink', '--viz-eq-2-ink', '--viz-eq-3-ink', '--viz-eq-4-ink', '--viz-eq-5-ink'],
    bristol: ['--viz-bristol-1', '--viz-bristol-2', '--viz-bristol-3', '--viz-bristol-4', '--viz-bristol-5', '--viz-bristol-6', '--viz-bristol-7'],
    bristolZone: ['--viz-bristol-hard-zone', '--viz-bristol-normal-zone', '--viz-bristol-loose-zone']
  };
  function readTokens(el) {
    var cs = getComputedStyle(el || document.documentElement);
    var v = function (n) { return cs.getPropertyValue(n).trim(); };
    var tok = {};
    Object.keys(MAP).forEach(function (k) { tok[k] = v(MAP[k]); });
    Object.keys(LISTS).forEach(function (k) { tok[k] = LISTS[k].map(v); });
    // dailyFill / dailyBorder: the calm daily-diary cell (light fill + 1 px edge, charts/patient.js dailyCell)
    tok.q = { daily: v('--viz-cal-daily'), dailyFill: v('--viz-cal-daily-fill'), dailyBorder: v('--viz-cal-daily-border'),
      weekly: v('--viz-cal-weekly'), monthly: v('--viz-cal-monthly'), eq5d5l: v('--viz-cal-eq5d') };
    tok.font = v('--font-ui') || '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';   // system fonts only
    tok.areaAlpha = parseFloat(v('--viz-area-alpha')) || 0.18;
    var missing = Object.keys(MAP).filter(function (k) { return !tok[k]; });
    if (missing.length && root.console) root.console.warn('[charts] missing colour tokens: ' + missing.join(', '));
    return tok;
  }
  var API = { MAP: MAP, LISTS: LISTS, readTokens: readTokens };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else root.ILARS_CHART_THEME = API;
})(typeof window !== 'undefined' ? window : this);
