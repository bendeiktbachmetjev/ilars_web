/*
 * charts/cohort.js — every iLARS overview chart (CHARTS-METRICS §5, DESIGN-SPEC §4.3 + Appendix A).
 * One file on purpose (§6.2). Adds to ILARS_CHART_OPTIONS. Shared pieces and the calm-look rules: charts/base.js.
 * Folded-in design-lead changes (formerly golden charts/overrides.js): LARS since registration in 4-week blocks
 * with a label under every block (A1), donut percentages of patients WITH a score (A17), no clone morphs (A7).
 */
(function (root) {
  'use strict';
  var O = root.ILARS_CHART_OPTIONS || (typeof require === 'function' ? require('./base.js') : null);
  var _ = O._, M = _.M, C = _.C, DAY = _.DAY;
  var base = O.base, esc = O.esc, xTime = O.xTime;
  var grid = _.grid, yValue = _.yValue, axisLabel = _.axisLabel;
  var tipRow = _.tipRow, tipHead = _.tipHead, tipValue = _.tipValue, legendHidden = _.legendHidden;

  function categoryAxis(ctx, data, o) {
    return Object.assign({ type: 'category', data: data, axisLine: { lineStyle: { color: ctx.tok.axis } }, axisTick: { show: false },
      axisLabel: axisLabel(ctx, { fontSize: 10, interval: 0, hideOverlap: true }) }, o);
  }
  function countLabel(ctx) {
    return { show: true, position: 'top', color: ctx.tok.ink2, fontSize: 11, formatter: function (p) { return p.value || ''; } };
  }
  /** "Weeks 0–3 · 17 patients" */
  function blockHead(ctx, r) {
    return ctx.t('doctor.cm.ov.traj_block', { from: r.week, to: r.week + 3 }) + ' · ' + ctx.tp('doctor.cm.common.n_patients', r.n, { n: r.n });
  }
  function blockLabel(i) { return (i * 4) + '–' + (i * 4 + 3); }   // short form of doctor.cm.ov.traj_block

  // ------------------------------------------------------------------ LARS category now
  /**
   * Donut of active patients by the category of their latest score. vm = cohortStats(). A17: every percentage
   * is of patients WITH a score (as the KPI "Major LARS now" and the counts list); the grey "No score yet"
   * slice shows its count only.
   */
  function cohortLarsDonut(vm, ctx, description) {
    var T = ctx.tok, o = base(ctx, description), c = vm.larsCategories;
    var n = c.none + c.minor + c.major + c.nodata, scored = c.none + c.minor + c.major;
    var pct = function (p) { return p.data.cat === 'nodata' || !scored ? '' : Math.round(p.value / scored * 100) + '%'; };
    var slices = ['none', 'minor', 'major', 'nodata'].filter(function (k) { return c[k] > 0; });
    var ring = _.donut(T, slices.length);
    ring.label.formatter = pct;
    return Object.assign(o, {
      title: { text: String(n), subtext: ctx.tp('doctor.cm.common.n_patients', n, { n: '' }).trim(), left: 'center', top: '40%', itemGap: 2,
        textStyle: { fontSize: 26, fontWeight: 600, color: T.ink, fontFamily: T.font }, subtextStyle: { color: T.ink3, fontSize: 12 } },
      tooltip: Object.assign(o.tooltip, { trigger: 'item', formatter: function (p) {
        return tipRow(p.color, pct(p), p.name, 'rect') + tipHead(ctx.tp('doctor.cm.common.n_patients', p.value, { n: p.value })); } }),
      series: [Object.assign(ring, { id: 'larsCat',
        data: slices.map(function (k) {
          var d = { name: _.catLabel(ctx, k), value: c[k], cat: k, itemStyle: { color: T[_.CAT_TOK[k]] } };
          if (k === 'nodata') { d.label = { show: false }; d.labelLine = { show: false }; }
          return d;
        }) })]
    });
  }

  /** Latest-score histogram: 14 bins on the category limits, calm bars in the bin's category colour. */
  function cohortLarsHistogram(vm, ctx, description) {
    var T = ctx.tok, o = base(ctx, description);
    var bins = M.larsHistogram(vm.larsScores);
    return Object.assign(o, {
      grid: grid({ left: 28, right: 8, top: 18, bottom: 40 }),
      tooltip: Object.assign(o.tooltip, { trigger: 'item', formatter: function (p) {
        var b = bins[p.dataIndex];
        return tipValue(ctx.tp('doctor.cm.common.n_patients', b.n, { n: b.n })) + esc('LARS ' + b.lo + '–' + b.hi + ' · ' + _.catLabel(ctx, b.category)); } }),
      xAxis: categoryAxis(ctx, bins.map(function (b) { return b.lo + '–' + b.hi; }),
        { name: ctx.t('doctor.cm.ov.hist_axis'), nameLocation: 'middle', nameGap: 26, nameTextStyle: { color: T.ink3 } }),
      yAxis: yValue(ctx, { minInterval: 1 }),
      series: [{ id: 'larsCat', type: 'bar', barMaxWidth: 24, barCategoryGap: '12%', label: countLabel(ctx),
        data: bins.map(function (b) { return _.calmItem(T, T[_.CAT_TOK[b.category]], b.n, [4, 4, 0, 0]); }) }]
    });
  }

  // ------------------------------------------------------------------ adherence
  /** 10 bins of the displayed percent (edges on 50 / 80), calm bars in the bin's adherence-level colour. */
  function cohortAdherenceHistogram(vm, ctx, description) {
    var T = ctx.tok, o = base(ctx, description);
    var bins = M.adherenceHistogram(vm.adherenceValues);
    return Object.assign(o, {
      grid: grid({ left: 28, right: 8, top: 18, bottom: 28 }),
      tooltip: Object.assign(o.tooltip, { trigger: 'item', formatter: function (p) {
        var b = bins[p.dataIndex];
        return tipValue(ctx.tp('doctor.cm.common.n_patients', b.n, { n: b.n })) + esc(b.lo + '–' + b.hi + '%'); } }),
      xAxis: categoryAxis(ctx, bins.map(function (b) { return b.lo + '–' + b.hi; }), { name: '%', nameLocation: 'end', nameTextStyle: { color: T.ink3 } }),
      yAxis: yValue(ctx, { minInterval: 1 }),
      series: [{ id: 'adh', type: 'bar', barMaxWidth: 28, label: countLabel(ctx),
        data: bins.map(function (b) { return _.calmItem(T, T[_.ADH_TOK[b.level]], b.n, [4, 4, 0, 0]); }) }]
    });
  }

  /** rows = [{label, code, ratio}] sorted lowest first (≤ BY_PATIENT_MAX). Labels are names/codes: escaped, truncated. */
  function cohortAdherenceByPatient(rows, ctx, description) {
    var T = ctx.tok, o = base(ctx, description);
    return Object.assign(o, {
      grid: grid({ left: 150, right: 44, top: 4, bottom: 24 }),
      tooltip: Object.assign(o.tooltip, { trigger: 'item', formatter: function (p) {
        return tipValue(p.value + '%') + esc(rows[p.dataIndex].label); } }),
      xAxis: yValue(ctx, { min: 0, max: 100, interval: 25, axisLabel: axisLabel(ctx, { formatter: '{value}%' }) }),
      yAxis: { type: 'category', inverse: true, data: rows.map(function (r) { return r.label; }), axisLine: { show: false }, axisTick: { show: false },
        axisLabel: axisLabel(ctx, { width: 140, overflow: 'truncate' }) },
      series: [{ id: 'adh-pt', type: 'bar', barMaxWidth: 12, cursor: 'pointer',
        label: { show: true, position: 'right', color: T.ink2, fontSize: 11, formatter: '{c}%' },
        data: rows.map(function (r) {
          return _.calmItem(T, T[_.ADH_TOK[M.adherenceLevel(r.ratio)]], M.percentParts(r.ratio).value, [0, 3, 3, 0]);
        }) }]
    });
  }

  // ------------------------------------------------------------------ LARS since registration (v2 only)
  /**
   * traj = ILARS_DATA.cohortTrajectory(): {blocks:[{block, week, n, median, q1, q3, none, minor, major}]} — 4-week
   * blocks since registration, one median per patient per block, blocks with n < COHORT_MIN_N not drawn.
   * Median line + middle-half band (q1–q3) over the category bands; an "n" strip under the axis with a label
   * under EVERY block ("0–3", "4–7", … pinned with customValues: the axis starts at −0.4, so automatic ticks
   * never land on a block); tooltip "Weeks 0–3 · 17 patients". No headline number, no per-patient lines.
   * The strip is a custom series, not a bar series: bars widen their value axis, which would shift every
   * strip column and label away from its median point above. The band series never enter the emphasis
   * state: zrender cannot lighten the space-syntax --viz-band-neutral and would drop the fill on hover.
   */
  function cohortTrajectory(traj, ctx, description) {
    var T = ctx.tok, o = base(ctx, description);
    var b = (traj.blocks || []).filter(function (r) { return r.n >= C.COHORT_MIN_N; });
    var maxB = b.length ? b[b.length - 1].block : 0;
    var byB = {}; b.forEach(function (r) { byB[r.block] = r; });
    var xs = []; for (var i = 0; i <= maxB; i++) xs.push(i);
    var col = function (f) { return xs.map(function (j) { return [j, byB[j] ? f(byB[j]) : null]; }); };
    return Object.assign(o, {
      grid: [{ left: 32, right: 82, top: 12, bottom: 84 }, { left: 32, right: 82, height: 22, bottom: 44 }],
      axisPointer: { link: [{ xAxisIndex: 'all' }] },
      legend: legendHidden([ctx.t('doctor.cm.ov.traj_median'), ctx.t('doctor.cm.ov.traj_iqr')]),
      xAxis: [
        { type: 'value', gridIndex: 0, min: -0.4, max: maxB + 0.4, interval: 1, axisLabel: { show: false }, axisTick: { show: false },
          axisLine: { lineStyle: { color: T.axis } }, splitLine: { show: false } },
        { type: 'value', gridIndex: 1, min: -0.4, max: maxB + 0.4, interval: 1, axisLine: { show: false }, axisTick: { show: false }, splitLine: { show: false },
          name: ctx.t('doctor.cm.ov.traj_axis'), nameLocation: 'middle', nameGap: 26, nameTextStyle: { color: T.ink3, fontSize: 11 },
          axisLabel: axisLabel(ctx, { show: true, customValues: xs, margin: 6, hideOverlap: false, formatter: function (v) { return blockLabel(Math.round(v)); } }) }
      ],
      yAxis: [
        yValue(ctx, { gridIndex: 0, min: 0, max: C.LARS_MAX, interval: 10, axisLabel: axisLabel(ctx, { showMaxLabel: false }) }),
        { type: 'value', gridIndex: 1, show: false, min: 0 }
      ],
      tooltip: Object.assign(o.tooltip, { trigger: 'axis', axisPointer: { type: 'line', lineStyle: { color: T.crosshair } },
        formatter: function (ps) {
          var r = byB[Math.round(ps[0].value[0])];
          if (!r) return '';
          return tipValue(ctx.fmtNum(r.median, r.median % 1 ? 1 : 0)) + esc(ctx.t('doctor.cm.ov.traj_median')) + '<br>' +
            '<span style="opacity:.75">' + esc(ctx.t('doctor.cm.ov.traj_iqr') + ': ' + ctx.fmtNum(r.q1, 1) + '–' + ctx.fmtNum(r.q3, 1)) + '</span>' +
            '<div style="opacity:.7;margin-top:2px">' + esc(blockHead(ctx, r)) + '</div>';
        } }),
      series: [
        { id: 'q1', type: 'line', stack: 'iqr', data: col(function (r) { return r.q1; }), lineStyle: { opacity: 0 }, symbol: 'none', connectNulls: false, silent: true,
          emphasis: { disabled: true }, markArea: { silent: true, data: _.larsBands(ctx) } },
        { id: 'iqr', name: ctx.t('doctor.cm.ov.traj_iqr'), type: 'line', stack: 'iqr', data: col(function (r) { return r.q3 - r.q1; }),
          lineStyle: { opacity: 0 }, symbol: 'none', connectNulls: false, areaStyle: { color: T.bandNeutral }, silent: true, emphasis: { disabled: true } },
        { id: 'median', name: ctx.t('doctor.cm.ov.traj_median'), type: 'line', data: col(function (r) { return r.median; }), connectNulls: false,
          symbol: 'circle', symbolSize: 7, lineStyle: { width: 2.5, color: T.metricLars }, itemStyle: { color: T.metricLars, borderColor: T.pointRing, borderWidth: 2 } },
        { id: 'n', type: 'custom', xAxisIndex: 1, yAxisIndex: 1, silent: true, encode: { x: 0, y: 1 },
          data: xs.map(function (j) { return [j, byB[j] ? byB[j].n : null]; }),
          renderItem: function (params, api) {
            var n = api.value(1);
            if (!(n > 0)) return null;                                    // block not drawn (n < COHORT_MIN_N)
            var top = api.coord([api.value(0), n]), foot = api.coord([api.value(0), 0]);
            var w = Math.min(18, api.size([0.6, 0])[0]);
            return { type: 'group', children: [
              { type: 'rect', shape: { x: top[0] - w / 2, y: top[1], width: w, height: Math.max(1, foot[1] - top[1]), r: [2, 2, 0, 0] }, style: { fill: T.axis } },
              { type: 'text', x: top[0], y: top[1] - 2, style: { text: 'n ' + n, align: 'center', verticalAlign: 'bottom', fill: T.ink2, font: '10px ' + T.font } }
            ] };
          } }
      ]
    });
  }

  /**
   * Categories view: 100 % stacked none/minor/major per 4-week block (n ≥ COHORT_MIN_N). traj as cohortTrajectory.
   * Full category colours (a tint fails the colour-blind check), but bars as narrow as the other stacks (16 px).
   */
  function cohortCategoryShare(traj, ctx, description) {
    var T = ctx.tok, o = base(ctx, description);
    var b = (traj.blocks || []).filter(function (r) { return r.n >= C.COHORT_MIN_N; });
    var cats = ['none', 'minor', 'major'];
    return Object.assign(o, {
      grid: grid({ left: 36, right: 12, top: 10, bottom: 40 }),
      legend: legendHidden(cats.map(function (c) { return _.catLabel(ctx, c); })),
      tooltip: Object.assign(o.tooltip, { trigger: 'axis', axisPointer: { type: 'shadow', shadowStyle: { color: T.hover } }, formatter: function (ps) {
        var html = tipHead(blockHead(ctx, b[ps[0].dataIndex]));
        ps.slice().reverse().forEach(function (p) { html += tipRow(p.color, p.value + '%', p.seriesName, 'rect'); });
        return html; } }),
      xAxis: categoryAxis(ctx, b.map(function (r) { return blockLabel(r.block); }),
        { name: ctx.t('doctor.cm.ov.traj_axis'), nameLocation: 'middle', nameGap: 26, nameTextStyle: { color: T.ink3, fontSize: 11 }, axisLabel: axisLabel(ctx, { interval: 0 }) }),
      yAxis: yValue(ctx, { min: 0, max: 100, interval: 50, axisLabel: axisLabel(ctx, { formatter: '{value}%' }) }),
      series: cats.map(function (c) {
        return { id: 'cs-' + c, name: _.catLabel(ctx, c), type: 'bar', stack: 'c', barMaxWidth: 16,
          itemStyle: { color: T[_.CAT_TOK[c]], borderColor: T.surface, borderWidth: 1 },
          data: b.map(function (r) { return Math.round(r[c] / r.n * 100); }) };
      })
    });
  }

  // ------------------------------------------------------------------ registrations
  /** Cumulative step line (true zeros: a month without registrations is 0), extended flat to today. vm = {series, from, to} */
  function enrolmentCumulative(vm, ctx, description) {
    var T = ctx.tok, o = base(ctx, description);
    var dctx = Object.assign({}, ctx, { x: { mode: 'date', ref: null } });
    var data = vm.series.map(function (p) { return [p.day * DAY, p.total]; });
    if (vm.series.length) data.push([vm.to * DAY, vm.series[vm.series.length - 1].total]);
    return Object.assign(o, {
      grid: grid({ left: 36, right: 16, top: 12, bottom: 28 }),
      xAxis: xTime(dctx, vm.from, vm.to),
      yAxis: yValue(ctx, { min: 0, minInterval: 1 }),
      tooltip: Object.assign(o.tooltip, { trigger: 'axis', axisPointer: { type: 'line', lineStyle: { color: T.crosshair } }, formatter: function (ps) {
        return tipValue(ps[0].value[1]) + tipHead(ctx.fmtDay(Math.round(ps[0].value[0] / DAY), 'long')); } }),
      series: [{ id: 'enrol', type: 'line', step: 'end', data: data, showSymbol: false, lineStyle: { width: 2, color: T.chart[0] },
        areaStyle: { color: T.chart[0], opacity: T.areaAlpha } }]
    });
  }

  /** New registrations per calendar month (calm bars), year under January and under the first month. vm = {startDays, from, to} */
  function enrolmentMonthly(vm, ctx, description) {
    var T = ctx.tok, o = base(ctx, description);
    var months = new Map();
    vm.startDays.forEach(function (d) { var k = M.dayToIso(d).slice(0, 7); months.set(k, (months.get(k) || 0) + 1); });
    var first = M.dayToIso(vm.from).slice(0, 7), last = M.dayToIso(vm.to).slice(0, 7), keys = [];
    var y = +first.slice(0, 4), m = +first.slice(5, 7);
    for (;;) { var k = y + '-' + (m < 10 ? '0' : '') + m; keys.push(k); if (k >= last) break; m++; if (m > 12) { m = 1; y++; } }
    var mf = new Intl.DateTimeFormat(ctx.lang, { month: 'short', timeZone: 'UTC' });
    var yf = new Intl.DateTimeFormat(ctx.lang, { year: 'numeric', timeZone: 'UTC' });
    var names = keys.map(function (key) { var d = new Date(key + '-15T00:00:00Z'); return { m: mf.format(d), y: yf.format(d), jan: key.slice(5) === '01' }; });
    return Object.assign(o, {
      grid: grid({ left: 28, right: 8, top: 18, bottom: 36 }),
      tooltip: Object.assign(o.tooltip, { trigger: 'item', formatter: function (p) {
        var nm = names[p.dataIndex];
        return tipValue(ctx.tp('doctor.cm.common.n_patients', p.value, { n: p.value })) + esc(nm.m + ' ' + nm.y); } }),
      xAxis: categoryAxis(ctx, names.map(function (nm, i) { return nm.m + (i === 0 || nm.jan ? '\n{y|' + nm.y + '}' : ''); }),
        { axisLabel: axisLabel(ctx, { hideOverlap: true, lineHeight: 14, rich: { y: { color: T.ink3, fontSize: 10 } } }) }),
      yAxis: yValue(ctx, { minInterval: 1 }),
      series: [Object.assign({ id: 'enrol-m', type: 'bar', barMaxWidth: 24,
        label: Object.assign(countLabel(ctx), { show: keys.length <= 18 }),
        data: keys.map(function (key) { return _.calmValue(months.get(key) || 0); }) }, _.calmBar(T, T.chart[0], [4, 4, 0, 0]))]
    });
  }

  // ------------------------------------------------------------------ EQ VAS now
  /** One dot per active patient (deterministic jitter) + median line. rows = [{label, vas}] (labels escaped in the tooltip). */
  function vasStrip(rows, ctx, description) {
    var T = ctx.tok, o = base(ctx, description);
    var med = M.median(rows.map(function (r) { return r.vas; }));
    var data = rows.map(function (r, i) { return { value: [((i * 0.6180339887) % 1) * 1.6 - 0.8, r.vas], label: r.label }; });
    return Object.assign(o, {
      grid: grid({ left: 36, right: 70, top: 12, bottom: 12 }),
      tooltip: Object.assign(o.tooltip, { trigger: 'item', formatter: function (p) { return tipValue(p.value[1]) + esc(p.data.label); } }),
      xAxis: { type: 'value', min: -1.2, max: 1.2, show: false },
      yAxis: yValue(ctx, { min: 0, max: 100, interval: 25 }),
      series: [{ id: 'vas-dots', type: 'scatter', symbolSize: 10, data: data,
        itemStyle: { color: T.metricEq, opacity: 0.85, borderColor: T.pointRing, borderWidth: 2 },
        markLine: med == null ? undefined : { silent: true, symbol: 'none', lineStyle: { color: T.ink, width: 2 },
          label: { position: 'end', color: T.ink, fontSize: 11, formatter: ctx.t('doctor.cm.ov.traj_median') + ' ' + ctx.fmtNum(med, med % 1 ? 1 : 0) },
          data: [{ yAxis: med }] } }]
    });
  }

  /** 10-point VAS bins, calm bars in the EQ-5D identity colour. */
  function vasHistogram(rows, ctx, description) {
    var T = ctx.tok, o = base(ctx, description);
    var bins = []; for (var i = 0; i < 10; i++) bins.push({ lo: i * 10, hi: i === 9 ? 100 : i * 10 + 9, n: 0 });
    rows.forEach(function (r) { bins[Math.min(9, Math.floor(r.vas / 10))].n++; });
    return Object.assign(o, {
      grid: grid({ left: 28, right: 8, top: 18, bottom: 28 }),
      tooltip: Object.assign(o.tooltip, { trigger: 'item', formatter: function (p) {
        var b = bins[p.dataIndex];
        return tipValue(ctx.tp('doctor.cm.common.n_patients', b.n, { n: b.n })) + esc('VAS ' + b.lo + '–' + b.hi); } }),
      xAxis: categoryAxis(ctx, bins.map(function (b) { return b.lo + '–' + b.hi; })),
      yAxis: yValue(ctx, { minInterval: 1 }),
      series: [Object.assign({ id: 'vas-h', type: 'bar', barMaxWidth: 24, label: countLabel(ctx),
        data: bins.map(function (b) { return _.calmValue(b.n); }) }, _.calmBar(T, T.metricEq, [4, 4, 0, 0]))]
    });
  }

  Object.assign(O, {
    cohortLarsDonut: cohortLarsDonut, cohortLarsHistogram: cohortLarsHistogram,
    cohortAdherenceHistogram: cohortAdherenceHistogram, cohortAdherenceByPatient: cohortAdherenceByPatient,
    cohortTrajectory: cohortTrajectory, cohortCategoryShare: cohortCategoryShare,
    enrolmentCumulative: enrolmentCumulative, enrolmentMonthly: enrolmentMonthly, vasStrip: vasStrip, vasHistogram: vasHistogram
  });
  if (typeof module !== 'undefined' && module.exports) module.exports = O;
})(typeof window !== 'undefined' ? window : this);
