/*
 * charts/patient.js — every patient-dashboard chart (CHARTS-METRICS §7, DESIGN-SPEC §4.4 + Appendix A).
 * One file on purpose (the production server fetches scripts one at a time, §6.2). Adds to ILARS_CHART_OPTIONS.
 * Shared pieces and the calm-look rules: charts/base.js.
 *
 * Diary-based cards (bowel movements, symptom raster, Bristol over time, bloating, diet, steps, the
 * questionnaire views) start at the 730-day diary window (A24, base `_.diaryVm`); LARS, EQ-5D-5L and
 * monthly cards keep the full range.
 */
(function (root) {
  'use strict';
  var O = root.ILARS_CHART_OPTIONS || (typeof require === 'function' ? require('./base.js') : null);
  var _ = O._, M = _.M, C = _.C;
  var base = O.base, esc = O.esc, X = O.X, xTime = O.xTime;
  var XB = _.XB, grid = _.grid, yValue = _.yValue, dayOfX = _.dayOfX, dateLine = _.dateLine, axisLabel = _.axisLabel;
  var tipRow = _.tipRow, tipHead = _.tipHead, tipValue = _.tipValue, legendHidden = _.legendHidden;

  function inRange(vm) { return function (p) { return p.day >= vm.from && p.day <= vm.to; }; }
  function weekStartFn(ctx) { return ctx.x.mode === 'date' ? M.isoWeekStart : M.blockStartFn(ctx.x.ref, 7); }

  // ------------------------------------------------------------------ LARS
  var ITEM_ORDER = C.LARS_ITEM_KEYS;                             // bottom -> top: biggest weight first
  var ITEM_SLOT = { urgency_to_toilet: 0, repeat_bowel_opening: 1, flatus_control: 2, bowel_frequency: 3, liquid_stool_leakage: 4 };
  var ITEM_LABEL = { urgency_to_toilet: 'item_urgency', repeat_bowel_opening: 'item_clustering', flatus_control: 'item_flatus',
    bowel_frequency: 'item_frequency', liquid_stool_leakage: 'item_liquid' };
  var LARS_Y = function (ctx) {
    return yValue(ctx, { min: 0, max: C.LARS_MAX, interval: 10, axisLabel: axisLabel(ctx, { showMaxLabel: false }) });
  };

  /**
   * vm = {points:[{day, score, items, calculated}], median:[{day, value}], firstScore, preop|null, from, to}
   * Weekly points on a thin line (breaks at gaps > 21 d), the 4-week median as the strong line, category bands,
   * dashed "First" / "Pre-op" references. A point scored from the answers (A9) says so in the tooltip.
   */
  function larsTrend(vm, ctx, description) {
    var T = ctx.tok, o = base(ctx, description);
    var pts = vm.points.filter(inRange(vm));
    var withGaps = M.withGapBreaks(pts, C.LARS_GAP_BREAK_DAYS);
    var data = withGaps.map(function (p, i) {
      if (p.day == null) return [X(ctx, (withGaps[i - 1].day + withGaps[i + 1].day) / 2), null];   // line break
      return [X(ctx, p.day), p.score];
    });
    var med = vm.median.filter(inRange(vm)).map(function (m) { return [X(ctx, m.day), m.value]; });
    var refs = [], placed = [];
    var marks = pts.map(function (p) { return { day: p.day, y: p.score }; })
      .concat(vm.median.filter(inRange(vm)).map(function (m) { return { day: m.day, y: m.value }; }));
    if (vm.firstScore != null) {
      refs.push({ yAxis: vm.firstScore, label: { formatter: ctx.t('doctor.cm.lars.first_ref', { score: vm.firstScore }),
        position: refLabelPos(vm, vm.firstScore, marks, placed, ['insideStartTop', 'insideEndTop', 'insideStartBottom', 'insideEndBottom']) } });
    }
    if (vm.preop != null && vm.preop !== vm.firstScore) {
      refs.push({ yAxis: vm.preop, label: { formatter: ctx.t('doctor.cm.lars.preop_ref', { score: vm.preop }),
        position: refLabelPos(vm, vm.preop, marks, placed, ['insideEndTop', 'insideStartTop', 'insideEndBottom', 'insideStartBottom']) } });
    }
    var byX = new Map(pts.map(function (p) { return [X(ctx, p.day), p]; }));
    var medByX = new Map(med);
    return Object.assign(o, {
      grid: grid({ left: 32, right: 88, top: 12, bottom: 28 }),
      legend: legendHidden([ctx.t('doctor.cm.lars.series_weekly'), ctx.t('doctor.cm.lars.series_median')]),
      xAxis: xTime(ctx, vm.from, vm.to),
      yAxis: LARS_Y(ctx),
      tooltip: Object.assign(o.tooltip, {
        trigger: 'axis', axisPointer: { type: 'line', lineStyle: { color: T.crosshair } },
        formatter: function (ps) {
          var p = ps.filter(function (q) { return q.seriesId === 'lars' && q.value && q.value[1] != null; })[0];
          if (!p) return '';
          var row = byX.get(p.value[0]);
          var html = tipValue(row.score, _.catLabel(ctx, M.larsCategory(row.score))) + tipHead(dateLine(ctx, row.day));
          if (row.calculated) html += '<div style="opacity:.75;margin-bottom:2px">' + esc(ctx.t('doctor.cm.lars.calculated')) + '</div>';
          var m = medByX.get(p.value[0]);
          if (m != null) html += tipRow(T.metricLars, ctx.fmtNum(m, m % 1 ? 1 : 0), ctx.t('doctor.cm.lars.series_median'));
          if (row.items) {
            ITEM_ORDER.forEach(function (k) {
              html += tipRow(T.chart[ITEM_SLOT[k]], row.items[k], ctx.t('doctor.cm.lars.' + ITEM_LABEL[k]), 'rect');
            });
          }
          return html;
        }
      }),
      series: [
        {
          id: 'lars', name: ctx.t('doctor.cm.lars.series_weekly'), type: 'line', data: data,
          symbol: 'circle', symbolSize: 8, showSymbol: true, connectNulls: false,
          lineStyle: { width: 1.5, color: T.metricLars, opacity: 0.45 },
          itemStyle: { color: T.metricLars, borderColor: T.pointRing, borderWidth: 2 },
          emphasis: { scale: 1.4 },
          markArea: { silent: true, data: _.larsBands(ctx) },
          markLine: refs.length ? {
            silent: true, symbol: 'none', lineStyle: { color: T.refLine, type: [4, 4], width: 1 },
            label: { color: T.refLine, fontSize: 11 }, data: refs
          } : undefined
        },
        {
          id: 'lars-median', name: ctx.t('doctor.cm.lars.series_median'), type: 'line', data: med,
          showSymbol: false, connectNulls: false, z: 3,                    // no smoothing, no forward fill
          lineStyle: { width: 2.5, color: T.metricLars }, itemStyle: { color: T.metricLars }
        }
      ]
    });
  }

  /**
   * Where a dashed reference label ("First 36", "Pre-op 12") goes: the first of `order` (start/end of the line,
   * above/below it) with no score or median point under the text, else the one with the fewest. The text is
   * about 12 % of the range wide and 4 score points tall (≈ 14 px of the 300 px chart). `placed` collects the
   * chosen boxes, so two labels at the same end never overlap.
   */
  function refLabelPos(vm, v, marks, placed, order) {
    var span = vm.to - vm.from + 1, win = Math.max(10, span * 0.12);
    var box = function (pos) {
      var end = /End/.test(pos) ? 'end' : 'start', up = /Top/.test(pos);
      return { end: end, lo: up ? v - 1 : v - 4, hi: up ? v + 4 : v + 1 };
    };
    var cost = function (pos) {
      var b = box(pos);
      var n = marks.filter(function (m) {
        var dx = b.end === 'start' ? m.day - vm.from : vm.to - m.day;
        return m.y != null && dx >= 0 && dx <= win && m.y >= b.lo && m.y <= b.hi;
      }).length;
      placed.forEach(function (q) { if (q.end === b.end && q.lo < b.hi && b.lo < q.hi) n += 100; });
      if (b.hi > C.LARS_MAX + 1 || b.lo < -1) n += 50;                        // the text would leave the plot
      return n;
    };
    var best = order[0], bestCost = Infinity;
    order.forEach(function (pos) { var c = cost(pos); if (c < bestCost) { best = pos; bestCost = c; } });
    placed.push(box(best));
    return best;
  }

  /**
   * vm as larsTrend; only points with items. Above LARS_ITEMS_MAX_BARS: 4-week blocks of mean points.
   * Calm segments (base.js): tint + full-colour edge; a zero item is no segment (null), not a 0 px edge line.
   */
  function larsItems(vm, ctx, description) {
    var T = ctx.tok, o = base(ctx, description);
    var pts = vm.points.filter(function (p) { return p.items && p.day >= vm.from && p.day <= vm.to; });
    var blocks = pts.length > C.LARS_ITEMS_MAX_BARS;
    var rows;
    if (blocks) {
      var start = M.blockStartFn(vm.from, 28);
      var map = new Map();
      pts.forEach(function (p) { var k = start(p.day); if (!map.has(k)) map.set(k, []); map.get(k).push(p); });
      rows = Array.from(map.entries()).map(function (e) {
        var items = {};
        ITEM_ORDER.forEach(function (k) { items[k] = M.roundTo(M.mean(e[1].map(function (p) { return p.items[k]; })), 1); });
        return { x: XB(ctx, e[0], 28), day: e[0], items: items, n: e[1].length };
      });
    } else {
      rows = pts.map(function (p) { return { x: X(ctx, p.day), day: p.day, items: p.items, score: p.score }; });
    }
    var rowByX = new Map(rows.map(function (r) { return [r.x, r]; }));
    return Object.assign(o, {
      grid: grid({ left: 32, right: 88, top: 12, bottom: 28 }),
      legend: legendHidden(ITEM_ORDER.map(function (k) { return ctx.t('doctor.cm.lars.' + ITEM_LABEL[k]); })),
      xAxis: xTime(ctx, vm.from, vm.to),
      yAxis: LARS_Y(ctx),
      tooltip: Object.assign(o.tooltip, {
        trigger: 'axis', axisPointer: { type: 'shadow', shadowStyle: { color: T.hover } },
        formatter: function (ps) {
          var r = rowByX.get(ps[0].value[0]);
          if (!r) return '';
          var total = ITEM_ORDER.reduce(function (a, k) { return a + r.items[k]; }, 0);
          var html = tipValue(ctx.fmtNum(total, blocks ? 1 : 0)) +
            tipHead(blocks ? ctx.t('doctor.cm.common.block_of', { date: ctx.fmtDay(r.day, 'short') }) : dateLine(ctx, r.day));
          ITEM_ORDER.slice().reverse().forEach(function (k) {
            html += tipRow(T.chart[ITEM_SLOT[k]], ctx.fmtNum(r.items[k], blocks ? 1 : 0), ctx.t('doctor.cm.lars.' + ITEM_LABEL[k]), 'rect');
          });
          return html;
        }
      }),
      series: ITEM_ORDER.map(function (k, i) {
        var calm = _.calmBar(T, T.chart[ITEM_SLOT[k]], i === ITEM_ORDER.length - 1 ? [3, 3, 0, 0] : 0);
        return {
          id: 'item-' + k, name: ctx.t('doctor.cm.lars.' + ITEM_LABEL[k]), type: 'bar', stack: 'lars',
          barMaxWidth: 14, barMinWidth: 2,
          itemStyle: calm.itemStyle,
          emphasis: Object.assign({ focus: 'series' }, calm.emphasis),
          data: rows.map(function (r) { return [r.x, r.items[k] || null]; }),
          markLine: i === 0 ? {
            silent: true, symbol: 'none', lineStyle: { color: T.ink3, type: [2, 3], width: 1 },
            label: { position: 'end', color: T.ink3, fontSize: 11 },
            data: [{ yAxis: C.LARS_MINOR_FROM, label: { formatter: ctx.t('doctor.cm.lars.band_minor') + ' ≥' + Math.ceil(C.LARS_MINOR_FROM) } },
              { yAxis: C.LARS_MAJOR_FROM, label: { formatter: ctx.t('doctor.cm.lars.band_major') + ' ≥' + Math.ceil(C.LARS_MAJOR_FROM) } }]
          } : undefined
        };
      })
    });
  }

  /** Share of weekly scores per category in range (donut). charts/card.js cross-fades to it (no morph, A7). */
  function larsShare(vm, ctx, description) {
    var T = ctx.tok, o = base(ctx, description);
    var counts = { none: 0, minor: 0, major: 0 }, n = 0;
    vm.points.forEach(function (p) { if (p.day >= vm.from && p.day <= vm.to) { counts[M.larsCategory(p.score)]++; n++; } });
    var cats = ['none', 'minor', 'major'].filter(function (k) { return counts[k] > 0; });
    var ring = _.donut(T, cats.length);
    ring.label.formatter = '{d}%';
    return Object.assign(o, {
      title: { text: String(n), subtext: ctx.t('doctor.cm.lars.share_center'), left: 'center', top: '40%', itemGap: 2,
        textStyle: { fontSize: 26, fontWeight: 600, color: T.ink, fontFamily: T.font }, subtextStyle: { color: T.ink3, fontSize: 12 } },
      tooltip: Object.assign(o.tooltip, {
        trigger: 'item',
        formatter: function (p) { return tipRow(p.color, p.percent + '%', p.name, 'rect') + tipHead(ctx.tp('doctor.cm.common.n_scores', p.value)); }
      }),
      series: [Object.assign(ring, {
        id: 'lars',
        data: cats.map(function (k) {
          return { name: _.catLabel(ctx, k), value: counts[k], itemStyle: { color: T[_.CAT_TOK[k]] } };
        })
      })]
    });
  }

  // ------------------------------------------------------------------ EQ-5D-5L (all visits, range-independent)
  /*
   * vm = {visits:[{point, status:'done'|'missed', day|null, levels|null, vas|null}]} — every arrived time point.
   * The visit axes fit the card width, so no label touches its neighbour: narrow cards (< 520 px) wrap the
   * dimension names into a narrower left column; when a column is too narrow the visit date drops its day
   * ("Apr 2024"), then the date line goes (it stays in the tooltip and the table), then the "Day N" and
   * change words are staggered onto two lines.
   */
  var GLYPH = 0.55;                                        // average glyph width of the system UI font (× font size)
  function widest(list, size) { return list.reduce(function (m, s) { return Math.max(m, String(s).length * size * GLYPH); }, 0); }
  var MONTH_YEAR = {};
  function monthYear(ctx, day) {
    var f = MONTH_YEAR[ctx.lang] || (MONTH_YEAR[ctx.lang] = new Intl.DateTimeFormat(ctx.lang, { month: 'short', year: 'numeric', timeZone: 'UTC' }));
    return f.format(new Date(day * _.DAY));
  }
  /** Width estimate of a label in the system UI font: narrow, wide and capital glyphs differ (× font size). */
  function textPx(str, size) {
    return String(str).split('').reduce(function (w, c) {
      return w + (/[\s\/.,:;'’|!()\-iìíįîïjlłrtfI]/.test(c) ? 0.3 : /[mwMWŠŽ]/.test(c) ? 0.85 : /[A-ZÀ-Þ]/.test(c) ? 0.68 : 0.55);
    }, 0) * size;
  }
  /**
   * Profile and VAS share one column layout (the card cross-fades between them). The left column is 132 px,
   * wider when the profile's dimension names need it (labelPx, at most 180). It narrows to 84 px (names wrap,
   * the view gives phones taller rows) only when the visit columns would get less than 44 px: a half card at
   * 1024–1279 px keeps one-line names in its 28 px rows.
   */
  function eqGrid(widthPx, n, labelPx) {
    var w = widthPx || 900, cols = Math.max(1, n);
    var need = Math.min(180, Math.max(132, Math.ceil((labelPx || 0) * 1.04) + 12));     // 4 % safety on the estimate, 8 px label margin
    var left = w >= 520 || (w - need) / cols >= 44 ? need : 84;
    var right = _.capRight(w, left, cols, 64);
    return { left: left, right: right, colW: (w - left - right) / cols };
  }
  /** Category data + axisLabel for the visit axis: "Day 90" over its date, shortened to fit colW px. */
  function visitAxis(visits, ctx, colW) {
    var days = visits.map(function (v) { return ctx.t('doctor.cm.eq.visit', { n: v.point }); });
    var size = widest(days, 11) + 6 <= colW ? 11 : 10;
    var stagger = widest(days, size) + 6 > colW;
    var dateList = function (fmt) { return visits.map(function (v) { return v.day != null ? fmt(v.day) : '–'; }); };
    var full = dateList(function (d) { return ctx.fmtDay(d, 'short'); }), short = dateList(function (d) { return monthYear(ctx, d); });
    var dates = stagger ? null : widest(full, 10) + 6 <= colW ? full : widest(short, 10) + 6 <= colW ? short : null;
    return {
      data: days.map(function (d, i) { return (stagger && i % 2 ? '\n' : '') + d + (dates ? '\n{d|' + dates[i] + '}' : ''); }),
      axisLabel: axisLabel(ctx, { fontSize: size, lineHeight: 14, interval: 0, rich: { d: { color: ctx.tok.ink3, fontSize: 10 } } })
    };
  }
  var DIM_KEYS = ['app.eq_mobility', 'app.eq_self_care', 'app.eq_usual_activities', 'app.eq_pain_discomfort', 'app.eq_anxiety_depression'];

  /**
   * Profile heat-strip: 5 dimensions × visits, the level number in every cell (ink follows the fill),
   * missed visits = empty dashed cells with "–", and above each follow-up its change vs DAY 0 (A6) with the
   * row title "vs day 0" ("vs day N" when the day-0 visit was missed and a later visit is the baseline).
   */
  function eqProfile(vm, ctx, description, widthPx) {
    var T = ctx.tok, o = base(ctx, description);
    var data = [], missed = [];
    vm.visits.forEach(function (v, x) {
      for (var y = 0; y < 5; y++) {
        if (v.levels) data.push({ value: [x, y, v.levels[y]], label: { color: T.eqLevelText[v.levels[y] - 1] } });
        else missed.push([x, y, 0]);
      }
    });
    var vs = M.eqVsBaseline(vm.visits);
    var dims = DIM_KEYS.map(function (k) { return ctx.t(k); });
    var labelPx = dims.reduce(function (m, s) { return Math.max(m, textPx(s, 12)); }, 0);
    var g = eqGrid(widthPx, vm.visits.length, labelPx), va = visitAxis(vm.visits, ctx, g.colW);
    var words = vs.pchc.map(function (c) { return c ? ctx.t('doctor.cm.eq.pchc_' + c) : ''; });
    var staggerTop = widest(words, 11) + 6 > g.colW;                     // two lines: every other word one line up
    var opt = Object.assign(o, {
      grid: grid({ left: g.left, right: g.right, top: staggerTop ? 40 : 26, bottom: 34 }),
      tooltip: Object.assign(o.tooltip, {
        trigger: 'item',
        formatter: function (p) {
          var v = vm.visits[p.value[0]];
          if (p.seriesId === 'eq-missed') return tipHead(ctx.t('doctor.cm.eq.visit', { n: v.point })) + esc(ctx.t('doctor.cm.eq.missed'));
          return tipValue(ctx.t('doctor.cm.eq.level_n', { n: p.value[2] })) + esc(dims[p.value[1]]) +
            tipHead(ctx.t('doctor.cm.eq.visit', { n: v.point }) + ' · ' + ctx.fmtDay(v.day, 'long'));
        }
      }),
      xAxis: [
        { type: 'category', data: va.data, position: 'bottom', axisLine: { show: false }, axisTick: { show: false }, axisLabel: va.axisLabel },
        { type: 'category', data: words.map(function (w, i) { return staggerTop && i % 2 ? w + '\n' : w; }),
          position: 'top', axisLine: { show: false }, axisTick: { show: false }, axisLabel: axisLabel(ctx, { fontWeight: 600, interval: 0, lineHeight: 14 }) }
      ],
      yAxis: { type: 'category', data: dims, inverse: true, axisLine: { show: false }, axisTick: { show: false },
        axisLabel: axisLabel(ctx, { fontSize: 12, width: g.left - (g.left === 84 ? 14 : 10), overflow: 'break', lineHeight: 13 }) },
      visualMap: { type: 'piecewise', show: false, seriesIndex: 0, dimension: 2,
        pieces: [1, 2, 3, 4, 5].map(function (l) { return { value: l, color: T.eqLevel[l - 1] }; }) },
      series: [
        { id: 'eq-levels', type: 'heatmap', data: data, xAxisIndex: 0,
          itemStyle: { borderColor: T.surface, borderWidth: 3, borderRadius: 6, decal: { symbol: 'none' } },
          label: { show: true, fontSize: 12, fontWeight: 600, formatter: function (p) { return String(p.value[2]); } },
          emphasis: { itemStyle: { borderColor: T.ink, borderWidth: 1 } } },
        { id: 'eq-missed', type: 'heatmap', data: missed, xAxisIndex: 0,
          itemStyle: { color: T.empty, borderColor: T.emptyBorder, borderWidth: 1, borderType: 'dashed', borderRadius: 6, decal: { symbol: 'none' } },
          label: { show: true, formatter: '–', color: T.ink3 } }
      ]
    });
    if (vs.pchc.some(Boolean)) {
      opt.graphic = [{ type: 'text', left: 8, top: 6, silent: true, style: {
        text: vs.point ? ctx.t('doctor.cm.eq.pchc_row_n', { n: vs.point }) : ctx.t('doctor.cm.eq.pchc_row'),
        fill: T.ink3, font: '600 11px ' + T.font } }];
    }
    return opt;
  }

  /**
   * VAS line on the same visit axis; band = first VAS ± VAS_MID; breaks at missed visits; every point labelled.
   * The band's name is in the legend beside the chart, not inside the plot (it would sit on the first point).
   * A line with few visits keeps a readable plot (at least VAS_MIN_PLOT px) instead of the profile's 64 px columns.
   */
  var VAS_MIN_PLOT = 240;
  function eqVas(vm, ctx, description, widthPx) {
    var T = ctx.tok, o = base(ctx, description);
    var first = null;
    vm.visits.forEach(function (v) { if (first == null && v.vas != null) first = v.vas; });
    var g = eqGrid(widthPx, vm.visits.length), w = widthPx || 900;
    var minPlot = Math.min(VAS_MIN_PLOT, w - g.left - 16);
    if (w - g.left - g.right < minPlot) { g.right = Math.max(16, w - g.left - minPlot); g.colW = (w - g.left - g.right) / Math.max(1, vm.visits.length); }
    var va = visitAxis(vm.visits, ctx, g.colW);
    return Object.assign(o, {
      grid: grid({ left: g.left, right: g.right, top: 18, bottom: 34 }),
      tooltip: Object.assign(o.tooltip, {
        trigger: 'axis', axisPointer: { type: 'line', lineStyle: { color: T.crosshair } },
        formatter: function (ps) {
          var v = vm.visits[ps[0].dataIndex];
          if (v.vas == null) return tipHead(ctx.t('doctor.cm.eq.visit', { n: v.point })) + esc(ctx.t('doctor.cm.eq.missed'));
          return tipValue(v.vas, '/ 100') + tipHead(ctx.t('doctor.cm.eq.visit', { n: v.point }) + ' · ' + ctx.fmtDay(v.day, 'long'));
        }
      }),
      xAxis: { type: 'category', data: va.data, boundaryGap: true, axisLine: { lineStyle: { color: T.axis } },
        axisTick: { show: false }, axisLabel: va.axisLabel },
      yAxis: yValue(ctx, { min: 0, max: 100, interval: 50, name: ctx.t('doctor.cm.eq.vas'), nameLocation: 'middle', nameGap: 34,
        nameTextStyle: { color: T.ink3 } }),
      series: [{
        id: 'vas', type: 'line', data: vm.visits.map(function (v) { return v.vas; }), connectNulls: false,
        symbol: 'circle', symbolSize: 8, lineStyle: { width: 2, color: T.metricEq },
        itemStyle: { color: T.metricEq, borderColor: T.pointRing, borderWidth: 2 },
        label: { show: true, position: 'top', color: T.ink, fontSize: 11, distance: 6 },
        markArea: first == null ? undefined : {
          silent: true, itemStyle: { color: T.bandNeutral }, emphasis: { disabled: true },   // space-syntax colour: no hover state
          label: { show: false },
          data: [[{ yAxis: Math.max(0, first - C.VAS_MID), name: ctx.t('doctor.cm.eq.vas_band') }, { yAxis: Math.min(100, first + C.VAS_MID) }]]
        }
      }]
    });
  }

  /** Summary view: per visit, how many of the 5 dimensions sit at each level (ordinal stack, 0-5). widthPx optional. */
  function eqLevels(vm, ctx, description, widthPx) {
    var T = ctx.tok, o = base(ctx, description);
    var done = vm.visits.filter(function (v) { return v.levels; });
    var va = visitAxis(done, ctx, ((widthPx || 900) - 40) / Math.max(1, done.length));
    return Object.assign(o, {
      grid: grid({ left: 32, right: 8, top: 12, bottom: 34 }),
      legend: legendHidden([1, 2, 3, 4, 5].map(function (l) { return ctx.t('doctor.cm.eq.level_n', { n: l }); })),
      tooltip: Object.assign(o.tooltip, { trigger: 'axis', axisPointer: { type: 'shadow', shadowStyle: { color: T.hover } } }),
      xAxis: { type: 'category', data: va.data, axisLine: { lineStyle: { color: T.axis } }, axisTick: { show: false }, axisLabel: va.axisLabel },
      yAxis: yValue(ctx, { min: 0, max: 5, interval: 1 }),
      series: [1, 2, 3, 4, 5].map(function (l) {
        return { id: 'lvl' + l, name: ctx.t('doctor.cm.eq.level_n', { n: l }), type: 'bar', stack: 'lv', barMaxWidth: 24,
          itemStyle: { color: T.eqLevel[l - 1], borderColor: T.surface, borderWidth: 1 },
          data: done.map(function (v) { return v.levels.filter(function (x) { return x === l; }).length || null; }) };
      })
    });
  }

  // ------------------------------------------------------------------ questionnaires (adherence)
  var Q_TYPES = ['daily', 'weekly', 'monthly', 'eq5d5l'];
  // EQ-5D-5L "inner ring": an annulus (outer circle clockwise, inner counter-clockwise -> hole under nonzero fill)
  var RING = 'path://M10 0a10 10 0 1 1 0 20a10 10 0 1 1 0-20zm0 5a5 5 0 1 0 0 10a5 5 0 1 0 0-10z';

  /**
   * A27: questionnaire types carry a pattern as well as a colour (WCAG 1.4.1): daily solid (no decal),
   * weekly LARS hatch, monthly dots, EQ-5D-5L an inner ring. Per item, always on (not tied to the
   * Patterns toggle). The ring tile is one calendar cell; calendarBox aligns cells to that tile.
   */
  function questionnaireDecals(T, cell) {
    var ink = function (a) { return _.alpha(T.surface, a); };
    return {
      daily: { symbol: 'none' },
      weekly: { symbol: 'rect', dashArrayX: [1, 0], dashArrayY: [2, 3], rotation: -Math.PI / 4, color: ink(0.55) },
      monthly: { symbol: 'circle', symbolSize: 0.8, dashArrayX: [[2, 3]], dashArrayY: [2, 3], color: ink(0.8) },
      eq5d5l: { symbol: RING, symbolSize: 0.66, symbolKeepAspect: true, dashArrayX: [[cell[0], 0]], dashArrayY: [cell[1], 0], color: ink(0.9) }
    };
  }

  /**
   * First day that is no longer tracked (exclusive end of the "expected" days): vm.end when the model gives it
   * (a deceased patient: the day of the status change), else today (today is still open, never missed).
   */
  function trackEnd(vm) { return vm.end != null ? Math.min(vm.end, vm.today != null ? vm.today : vm.to + 1) : vm.today != null ? vm.today : vm.to + 1; }
  /** Tracked days in from..to without an entry (has(day) false): the hollow dashed "missed" cells of a calendar. */
  function missedDays(vm, from, has) {
    var out = [], last = Math.min(vm.to, trackEnd(vm) - 1);
    for (var d = from; d <= last; d++) if (!has(d)) out.push(d);
    return out;
  }

  /**
   * Calendar: one cell per day, coloured AND patterned by the day's priority type; a tracked day without a
   * questionnaire = hollow dashed cell (--viz-cal-missed-border, base missedSeries). Today and the days after
   * vm.end (deceased) are not missed. vm = {from, to, today, end?, act: Map(day -> type)}
   */
  function questionnaireCalendar(vm, ctx, description, widthPx) {
    var T = ctx.tok, o = base(ctx, description);
    vm = _.diaryVm(vm);
    var cf = O.calendarFrom(vm.from, vm.to, widthPx);
    var cal = _.calendarBox(ctx, cf.from, vm.to, widthPx);
    var decals = questionnaireDecals(T, cal.cellSize);
    var data = [];
    vm.act.forEach(function (type, day) {
      if (day >= cf.from && day <= vm.to) data.push({ value: [M.dayToIso(day), Q_TYPES.indexOf(type) + 1, day], itemStyle: { decal: decals[type] } });
    });
    var missed = _.missedSeries(ctx, missedDays(vm, cf.from, function (d) { return vm.act.has(d); }), cal);
    return Object.assign(o, {
      tooltip: Object.assign(o.tooltip, {
        trigger: 'item',
        formatter: function (p) { return tipRow(p.color, ctx.t('doctor.cm.q.type_' + Q_TYPES[p.value[1] - 1]), '', 'rect') + tipHead(ctx.fmtDay(p.value[2], 'long')); }
      }),
      visualMap: { type: 'piecewise', show: false, dimension: 1, seriesIndex: 0,
        pieces: Q_TYPES.map(function (k, i) { return { value: i + 1, color: T.q[k] }; }) },
      calendar: cal,
      series: [{ id: 'q', type: 'heatmap', coordinateSystem: 'calendar', data: data, itemStyle: { borderColor: T.surface, borderWidth: 2, decal: { symbol: 'none' } } }, missed]
    });
  }

  /** Weekly view: stacked days per type (0-7) per ISO week (date mode) or 7-day block (relative modes); expected days end at trackEnd. */
  function questionnaireWeekly(vm, ctx, description) {
    var T = ctx.tok, o = base(ctx, description);
    vm = _.diaryVm(vm);
    var bs = weekStartFn(ctx);
    var weeks = new Map();
    for (var w = bs(vm.from); w <= vm.to; w += 7) weeks.set(w, { daily: 0, weekly: 0, monthly: 0, eq5d5l: 0, expected: 0 });
    for (var d = vm.from; d <= Math.min(vm.to, trackEnd(vm) - 1); d++) {
      var wk = weeks.get(bs(d)); if (!wk) continue;
      wk.expected++;
      if (vm.act.has(d)) wk[vm.act.get(d)]++;
    }
    var keys = Array.from(weeks.keys());
    return Object.assign(o, {
      grid: grid({ left: 28, right: 8, top: 10, bottom: 28 }),
      legend: legendHidden(Q_TYPES.map(function (k) { return ctx.t('doctor.cm.q.type_' + k); })),
      tooltip: Object.assign(o.tooltip, {
        trigger: 'axis', axisPointer: { type: 'shadow', shadowStyle: { color: T.hover } },
        formatter: function (ps) {
          var wk = weeks.get(keys[ps[0].dataIndex]);
          var done = wk.daily + wk.weekly + wk.monthly + wk.eq5d5l;
          var html = tipValue(ctx.tp('doctor.cm.q.week_tooltip', wk.expected, { done: done, expected: wk.expected })) +
            tipHead(ctx.t('doctor.cm.common.week_of', { date: ctx.fmtDay(keys[ps[0].dataIndex], 'short') }));
          ps.slice().reverse().forEach(function (p) { if (p.value && p.value[1]) html += tipRow(p.color, p.value[1], p.seriesName, 'rect'); });
          return html;
        }
      }),
      xAxis: xTime(ctx, vm.from, vm.to),
      yAxis: yValue(ctx, { min: 0, max: 7, interval: 7 }),
      series: Q_TYPES.map(function (k) {
        return { id: 'qw-' + k, name: ctx.t('doctor.cm.q.type_' + k), type: 'bar', stack: 'q', barMaxWidth: 16,
          itemStyle: { color: T.q[k], borderColor: T.surface, borderWidth: 1 },
          data: keys.map(function (s) { return [XB(ctx, s, 7), weeks.get(s)[k] || null]; }) };
      })
    });
  }

  // ------------------------------------------------------------------ bowel movements (+ pads)
  /**
   * The x-axis of the Bowel movements trend AND the symptom raster under it, so a day (or week) has the same
   * x in both. It starts at the (diary-window) range start like every diary card; weekly ranges (> DAILY_MAX_DAYS)
   * end with the current week, so its bar is not cut at the right edge. containShape off: ECharts 6 would
   * otherwise widen only the axis that carries bars, and the raster's columns would drift away from the bars.
   */
  function diaryAxis(vm, ctx, extra) {
    var max = vm.to + 0.5;
    if (vm.to - vm.from + 1 > C.DAILY_MAX_DAYS) max = Math.max(max, weekStartFn(ctx)(vm.to) + 7);
    return xTime(ctx, vm.from, vm.to, Object.assign({ min: X(ctx, vm.from - 0.5), max: X(ctx, max), containShape: false }, extra));
  }

  /**
   * vm = {from, to, stool:[{day,value}], mean:[{day,value}], pads:[{day,value}]|null}
   * ≤ 92 days: soft daily bars (context) + the 7-day mean line; above: calm weekly-mean bars (faint when
   * < LOW_N_BUCKET days). A real zero is a 2 px stub in --viz-zero; a missing day has no bar at all.
   */
  function stoolTrend(vm, ctx, description) {
    var T = ctx.tok, o = base(ctx, description);
    vm = _.diaryVm(vm);
    var weekly = vm.to - vm.from + 1 > C.DAILY_MAX_DAYS;
    var hasPads = !!(vm.pads && vm.pads.length);
    var grids = hasPads ? [grid({ left: 40, right: 16, top: 10, height: '58%' }), grid({ left: 40, right: 16, top: '74%', bottom: 26 })]
      : [grid({ left: 40, right: 16, top: 10, bottom: 28 })];
    var zero = { itemStyle: { color: T.zero, borderWidth: 0, borderRadius: 0 } };
    function barSeries(points, name, id, gridIndex) {
      var color = T.metricDiary;
      if (!weekly) {
        var soft = gridIndex === 0;                    // daily stool bars are context for the mean line
        var style = soft ? { itemStyle: { color: _.mix(color, T.surface, 0.35), borderRadius: [3, 3, 0, 0] }, emphasis: { itemStyle: { color: color } } }
          : _.calmBar(T, color);
        return Object.assign({ id: id, name: name, type: 'bar', xAxisIndex: gridIndex, yAxisIndex: gridIndex, barMaxWidth: 10, barMinHeight: 2,
          data: points.filter(inRange(vm)).map(function (p) { return Object.assign({ value: [X(ctx, p.day), p.value] }, p.value === 0 ? zero : {}); }) }, style);
      }
      return Object.assign({ id: id, name: name, type: 'bar', xAxisIndex: gridIndex, yAxisIndex: gridIndex, barMaxWidth: 14, barMinHeight: 2,
        data: M.buckets(points, vm.from, vm.to, weekStartFn(ctx), 7).filter(function (b) { return b.n; }).map(function (b) {
          var v = M.roundTo(b.value, 1), item = { value: [XB(ctx, b.start, 7), v], n: b.n, start: b.start };
          if (v === 0) return Object.assign(item, zero);
          if (b.n < C.LOW_N_BUCKET) item.itemStyle = { opacity: 0.45 };
          return item;
        }) }, _.calmBar(T, color));
    }
    var series = [barSeries(vm.stool, ctx.t(weekly ? 'doctor.cm.stool.series_weekly' : 'doctor.cm.stool.series_daily'), 'stool', 0)];
    if (!weekly) {
      series.push({ id: 'stool-mean', name: ctx.t('doctor.cm.stool.series_mean'), type: 'line', xAxisIndex: 0, yAxisIndex: 0,
        data: vm.mean.filter(inRange(vm)).map(function (m) { return [X(ctx, m.day), m.value == null ? null : M.roundTo(m.value, 1)]; }),
        showSymbol: false, connectNulls: false, lineStyle: { width: 2, color: T.metricDiary }, itemStyle: { color: T.metricDiary } });
    }
    if (hasPads) series.push(barSeries(vm.pads, ctx.t('doctor.cm.stool.pads'), 'pads', 1));
    var xAxes = [diaryAxis(vm, ctx, hasPads ? { gridIndex: 0, axisLabel: { show: false } } : { gridIndex: 0 })];
    var yAxes = [yValue(ctx, { gridIndex: 0, min: 0, minInterval: 1 })];
    if (hasPads) {
      xAxes.push(diaryAxis(vm, ctx, { gridIndex: 1 }));
      yAxes.push(yValue(ctx, { gridIndex: 1, min: 0, minInterval: 1, splitNumber: 2, name: ctx.t('doctor.cm.stool.pads'),
        nameLocation: 'end', nameTextStyle: { color: T.ink3, fontSize: 11, align: 'left' } }));
    }
    return Object.assign(o, {
      grid: grids, xAxis: xAxes, yAxis: yAxes,
      axisPointer: { link: [{ xAxisIndex: 'all' }] },
      legend: legendHidden(series.map(function (s) { return s.name; })),
      tooltip: Object.assign(o.tooltip, {
        trigger: 'axis', axisPointer: { type: 'line', lineStyle: { color: T.crosshair } },
        formatter: function (ps) {
          if (!ps.length) return '';
          var head = weekly ? ctx.t('doctor.cm.common.week_of', { date: ctx.fmtDay(ps[0].data.start, 'short') }) : dateLine(ctx, dayOfX(ctx, ps[0].value[0]));
          var html = tipHead(head);
          ps.forEach(function (p) {
            var v = p.value[1];
            if (v == null) return;
            var label = p.seriesName + (weekly && p.data.n != null ? ' · ' + ctx.tp('doctor.cm.common.n_diary_days', p.data.n, { n: p.data.n }) : '');
            html += tipRow(T.metricDiary, v === 0 && !weekly ? ctx.t('doctor.cm.stool.zero_day') : ctx.fmtNum(v, weekly || p.seriesId === 'stool-mean' ? 1 : 0), label,
              p.seriesType === 'bar' ? 'rect' : 'line');
          });
          return html;
        }
      }),
      series: series
    });
  }

  /**
   * Stool-count calendar on the calm ramp; 0 has its own lightest bin; small dots = another questionnaire; a
   * tracked day without an entry = hollow dashed cell (today and days after vm.end are not missed).
   * Month view (1M, base calendarBig): the count is written in each cell and the dot moves to the top-right corner.
   */
  function stoolCalendar(vm, ctx, description, widthPx) {
    var T = ctx.tok, o = base(ctx, description), R = _.calmRamp(T);
    vm = _.diaryVm(vm);
    var cf = O.calendarFrom(vm.from, vm.to, widthPx);
    var bins = [
      { min: 0, max: 0, color: R[0], label: '0' }, { min: 1, max: 2, color: R[1], label: '1–2' },
      { min: 3, max: 4, color: R[2], label: '3–4' }, { min: 5, max: 6, color: R[3], label: '5–6' },
      { min: 7, max: 8, color: R[4], label: '7–8' }, { min: 9, color: R[5], label: '9+' }];
    var other = [];
    if (vm.act) vm.act.forEach(function (type, day) { if (type !== 'daily' && day >= cf.from && day <= vm.to) other.push([M.dayToIso(day), 1, type, day]); });
    var cal = _.calendarBox(ctx, cf.from, vm.to, widthPx), big = _.calendarBig(cf.from, vm.to), cs = cal.cellSize;
    var entry = new Set(vm.stool.map(function (p) { return p.day; }));
    var missed = _.missedSeries(ctx, missedDays(vm, cf.from, function (d) { return entry.has(d); }), cal);
    return Object.assign(o, {
      tooltip: Object.assign(o.tooltip, {
        trigger: 'item',
        formatter: function (p) {
          if (p.seriesId === 'other') return esc(ctx.t('doctor.cm.q.type_' + p.value[2])) + tipHead(ctx.fmtDay(p.value[3], 'long'));
          return tipValue(p.value[1]) + esc(ctx.t('doctor.cm.stool.title')) + tipHead(ctx.fmtDay(p.value[2], 'long'));
        }
      }),
      // the bin legend starts under the calendar's first column (phone: at the edge, room for '9+')
      visualMap: { type: 'piecewise', seriesIndex: 0, dimension: 1, orient: 'horizontal', left: (widthPx || 900) < 400 ? 0 : cal.left, bottom: 0, itemWidth: 12, itemHeight: 12,
        itemGap: 8, textGap: 4, textStyle: { color: T.ink3, fontSize: 11 }, pieces: bins, selectedMode: false },
      calendar: cal,
      series: [
        { id: 'stool-cal', type: 'heatmap', coordinateSystem: 'calendar', itemStyle: { borderColor: T.surface, borderWidth: 2, decal: { symbol: 'none' } },
          label: { show: big, fontSize: 11, fontWeight: 600, formatter: function (p) { return String(p.value[1]); } },
          data: vm.stool.filter(function (p) { return p.day >= cf.from && p.day <= vm.to; }).map(function (p) {
            return big ? { value: [M.dayToIso(p.day), p.value, p.day], label: { color: p.value >= 9 ? T.seqInkDark : T.seqInkLight } } : [M.dayToIso(p.day), p.value, p.day];
          }) },
        missed,
        { id: 'other', type: 'scatter', coordinateSystem: 'calendar', symbolSize: big ? 5 : 4, itemStyle: { color: T.otherQ }, z: 4,
          symbolOffset: big ? [cs[0] / 2 - 7, -cs[1] / 2 + 7] : [0, 0], data: other }
      ]
    });
  }

  /**
   * Symptom raster (v2). Rows: urgency, night stools, incomplete emptying, leakage. Daily cells up to
   * RASTER_DAILY_MAX_DAYS, else weekly "% of diary days" — both on the calm ramp. No diary that day = no cell.
   * It sits under the Bowel movements trend and uses the trend's x-axis and grid (left 40, right 16): every
   * column lies under its own bar (a week cell spans the week bar's slot), so a reader can scan straight down.
   * The row names are written above each row (a left label column would shift the columns away from the bars).
   * vm = {from, to, rows:[{day, urgency, night_stools, incomplete_evacuation, leakage}]} ('Yes'/'No'/'None'/'Liquid'/'Solid')
   * widthPx (optional) thins the white cell gaps on narrow cards, so small cells keep their colour.
   * Data per cell: [x0, x1, row, value, n|day, start] (x in axis units).
   */
  var SYM = [['urgency', 'urgency'], ['night_stools', 'night'], ['incomplete_evacuation', 'incomplete'], ['leakage', 'leakage']];
  var RASTER_LABEL_H = 15, RASTER_ROW_GAP = 3;          // px above each row for its name; px below each row
  function symCode(field, v) {
    if (v == null) return null;
    if (field === 'leakage') return v === 'Liquid' ? 2 : v === 'Solid' ? 3 : 0;
    return v === 'Yes' ? 1 : 0;
  }
  function symptomRaster(vm, ctx, description, widthPx) {
    var T = ctx.tok, o = base(ctx, description), R = _.calmRamp(T);
    vm = _.diaryVm(vm);
    var names = SYM.map(function (s) { return ctx.t('doctor.cm.sym.' + s[1]); });
    var plotW = (widthPx || 900) - 56;
    var daily = vm.to - vm.from + 1 <= C.RASTER_DAILY_MAX_DAYS;
    var data = [], cols;
    if (daily) {
      cols = vm.to - vm.from + 1;
      vm.rows.forEach(function (r) {
        if (r.day < vm.from || r.day > vm.to) return;                 // no diary that day: no cell (not "No")
        SYM.forEach(function (s, y) { var c = symCode(s[0], r[s[0]]); if (c != null) data.push([X(ctx, r.day - 0.5), X(ctx, r.day + 0.5), y, c, r.day, r.day]); });
      });
    } else {
      var bs = weekStartFn(ctx), weeks = [];
      for (var w = bs(vm.from); w <= vm.to; w += 7) weeks.push(w);
      cols = weeks.length;
      weeks.forEach(function (ws) {
        var rs = vm.rows.filter(function (r) { return r.day >= ws && r.day < ws + 7 && r.day >= vm.from && r.day <= vm.to; });
        SYM.forEach(function (s, y) {
          var known = rs.filter(function (r) { return r[s[0]] != null; });
          if (!known.length) return;
          var hit = known.filter(function (r) { return symCode(s[0], r[s[0]]) > 0; }).length;
          data.push([X(ctx, ws), X(ctx, ws + 7), y, Math.round(hit / known.length * 100), known.length, ws]);   // the week bar's slot (XB centre)
        });
      });
    }
    var gap = _.cellBorder(plotW / Math.max(1, cols), daily ? 1 : 2);
    var leak = ['leak_none', '', 'leak_liquid', 'leak_solid'];
    return Object.assign(o, {
      grid: grid({ left: 40, right: 16, top: 2, bottom: 22 }),
      xAxis: diaryAxis(vm, ctx, { axisLine: { show: false } }),            // the trend's axis; no baseline under empty columns
      yAxis: { type: 'category', data: names, inverse: true, axisLine: { show: false }, axisTick: { show: false }, axisLabel: { show: false }, splitLine: { show: false } },
      tooltip: Object.assign(o.tooltip, { trigger: 'item', formatter: function (p) {
        var v = p.value, row = names[v[2]];
        if (daily) return '<b>' + esc(SYM[v[2]][0] === 'leakage' ? ctx.t('doctor.cm.sym.' + leak[v[3]]) : ctx.t('doctor.cm.sym.' + (v[3] ? 'yes' : 'no'))) + '</b> ' + esc(row) + tipHead(ctx.fmtDay(v[4], 'long'));
        return '<b>' + esc(ctx.tp('doctor.cm.sym.weekly_pct', v[4], { pct: v[3] + '%', n: v[4] })) + '</b><br>' + esc(row) +
          tipHead(ctx.t('doctor.cm.common.week_of', { date: ctx.fmtDay(v[5], 'short') }));
      } }),
      visualMap: daily
        ? { type: 'piecewise', show: false, dimension: 3, seriesIndex: 0,              // no · yes · liquid · solid
          pieces: [{ value: 0, color: R[0] }, { value: 1, color: R[4] }, { value: 2, color: R[3] }, { value: 3, color: R[5] }] }
        : { type: 'piecewise', show: false, dimension: 3, seriesIndex: 0,
          pieces: [{ value: 0, color: R[0] }, { min: 1, max: 25, color: R[1] }, { min: 26, max: 50, color: R[2] },
            { min: 51, max: 75, color: R[4] }, { min: 76, max: 100, color: R[5] }] },
      series: [
        { id: 'sym', type: 'custom', data: data, encode: { x: [0, 1], y: 2, tooltip: [3] },
          itemStyle: { borderColor: T.surface, borderWidth: gap, decal: { symbol: 'none' } },
          renderItem: function (params, api) {
            var a = api.coord([api.value(0), api.value(2)]), b = api.coord([api.value(1), api.value(2)]);
            var cs = params.coordSys, bh = api.size([0, 1])[1];
            var x0 = Math.max(a[0], cs.x), x1 = Math.min(b[0], cs.x + cs.width);
            if (!(x1 - x0 > 0.5)) return null;
            var y = a[1] - bh / 2 + RASTER_LABEL_H, h = Math.max(4, bh - RASTER_LABEL_H - RASTER_ROW_GAP);
            return { type: 'rect', shape: { x: x0, y: y, width: x1 - x0, height: h, r: !daily && x1 - x0 >= 8 ? 3 : 0 }, style: api.style() };
          } },
        { id: 'sym-rows', type: 'custom', silent: true, data: names.map(function (n, i) { return [X(ctx, vm.from), i]; }), encode: { x: 0, y: 1 },
          renderItem: function (params, api) {
            var p = api.coord([api.value(0), api.value(1)]), bh = api.size([0, 1])[1];
            return { type: 'text', silent: true, x: params.coordSys.x, y: p[1] - bh / 2 + 1,
              style: { text: names[params.dataIndex], fill: T.ink2, font: '500 11px ' + T.font, align: 'left', verticalAlign: 'top' } };
          } }
      ]
    });
  }

  // ------------------------------------------------------------------ Bristol
  /**
   * vm = {from, to, stats: bristolStats(), weekly:[{start, counts:{hard,normal,loose}, n}]}
   * Types view: the zone word under every type; on narrow cards (widthPx, optional) only under types 1, 4 and 7
   * (both ends and the middle of the scale), so "Normal Normal Normal" never runs together.
   */
  function bristolTypes(vm, ctx, description, widthPx) {
    var T = ctx.tok, o = base(ctx, description), n = vm.stats.n || 1;
    var zoneWord = function (type) { return ctx.t('doctor.cm.bristol.zone_' + M.bristolZone(type)); };
    var sparse = widest([1, 2, 3, 4, 5, 6, 7].map(zoneWord), 10) + 6 > ((widthPx || 900) - 24) / 7;
    return Object.assign(o, {
      grid: grid({ left: 12, right: 12, top: 22, bottom: 52 }),
      tooltip: Object.assign(o.tooltip, { trigger: 'item', formatter: function (p) {
        var t = p.dataIndex + 1;
        return tipValue(Math.round(p.value / n * 100) + '%') +
          esc(ctx.t('doctor.cm.bristol.type_n', { n: t }) + ' · ' + ctx.t('doctor.cm.bristol.desc_' + t)) +
          tipHead(ctx.t('doctor.cm.common.of_total', { done: p.value, total: ctx.tp('doctor.cm.common.n_diary_days', n, { n: n }) })); } }),
      xAxis: { type: 'category', data: ['1', '2', '3', '4', '5', '6', '7'], axisLine: { lineStyle: { color: T.axis } }, axisTick: { show: false },
        axisLabel: axisLabel(ctx, { fontSize: 12, lineHeight: 15, interval: 0, rich: { z: { color: T.ink3, fontSize: 10 } },
          formatter: function (v) { return v + (sparse && [1, 4, 7].indexOf(+v) < 0 ? '' : '\n{z|' + zoneWord(+v) + '}'); } }),
        name: ctx.t('doctor.cm.bristol.axis'), nameLocation: 'middle', nameGap: 34, nameTextStyle: { color: T.ink3, fontSize: 11 } },
      yAxis: yValue(ctx, { minInterval: 1, axisLabel: { show: false } }),
      series: [{ id: 'bristol', type: 'bar', barMaxWidth: 24,
        label: { show: true, position: 'top', color: T.ink2, fontSize: 11, formatter: function (p) { return p.value ? Math.round(p.value / n * 100) + '%' : ''; } },
        data: vm.stats.counts.map(function (c, i) { return _.calmItem(T, T.bristol[i], c, [4, 4, 0, 0]); }) }]
    });
  }

  function bristolZones(vm, ctx, description) {
    var T = ctx.tok, o = base(ctx, description), z = vm.stats.zones;
    var zones = [['hard', 0], ['normal', 1], ['loose', 2]].filter(function (k) { return z[k[0]] > 0; });
    var ring = _.donut(T, zones.length);
    ring.label.formatter = '{d}%';
    return Object.assign(o, {
      title: { text: Math.round((vm.stats.normalShare || 0) * 100) + '%', subtext: ctx.t('doctor.cm.bristol.center'), left: 'center', top: '40%', itemGap: 2,
        textStyle: { fontSize: 26, fontWeight: 600, color: T.ink, fontFamily: T.font }, subtextStyle: { color: T.ink3, fontSize: 12 } },
      tooltip: Object.assign(o.tooltip, { trigger: 'item', formatter: function (p) { return tipRow(p.color, p.percent + '%', p.name, 'rect') + tipHead(ctx.tp('doctor.cm.common.n_diary_days', p.value, { n: p.value })); } }),
      series: [Object.assign(ring, { id: 'bristol',
        data: zones.map(function (k) {
          return { name: ctx.t('doctor.cm.bristol.zone_' + k[0] + '_range'), value: z[k[0]], itemStyle: { color: T.bristolZone[k[1]] } };
        }) })]
    });
  }

  /**
   * Zone shares per week; above BRISTOL_WEEKLY_MAX_BARS weeks per 4-week block (summed counts), so long ranges
   * keep readable stacks instead of 1 px hairlines. Calm segments like the Types view (tint + full-colour edge);
   * an empty zone is no segment (null).
   */
  function bristolWeekly(vm, ctx, description) {
    var T = ctx.tok, o = base(ctx, description);
    vm = _.diaryVm(vm);
    var zones = [['hard', 0], ['normal', 1], ['loose', 2]];
    var weeks = vm.weekly.filter(function (w) { return w.start + 6 >= vm.from; });
    var size = Math.ceil((vm.to - M.isoWeekStart(vm.from) + 1) / 7) > C.BRISTOL_WEEKLY_MAX_BARS ? 28 : 7;
    if (size === 28 && weeks.length) {
      var first = weeks[0].start, blocks = new Map();
      weeks.forEach(function (w) {
        var k = first + Math.floor((w.start - first) / 28) * 28, b = blocks.get(k);
        if (!b) blocks.set(k, b = { start: k, n: 0, counts: { hard: 0, normal: 0, loose: 0 } });
        b.n += w.n;
        zones.forEach(function (z) { b.counts[z[0]] += w.counts[z[0]] || 0; });
      });
      weeks = Array.from(blocks.values());
    }
    var rows = weeks.filter(function (w) { return w.n; });
    return Object.assign(o, {
      grid: grid({ left: 36, right: 12, top: 10, bottom: 28 }),
      legend: legendHidden(zones.map(function (z) { return ctx.t('doctor.cm.bristol.zone_' + z[0] + '_range'); })),
      tooltip: Object.assign(o.tooltip, { trigger: 'axis', axisPointer: { type: 'shadow', shadowStyle: { color: T.hover } },
        formatter: function (ps) {
          var w = rows[ps[0].dataIndex];
          var html = tipHead(ctx.t(size === 7 ? 'doctor.cm.common.week_of' : 'doctor.cm.common.block_of', { date: ctx.fmtDay(w.start, 'short') }) +
            ' · ' + ctx.tp('doctor.cm.common.n_diary_days', w.n, { n: w.n }));
          ps.slice().reverse().forEach(function (p) { html += tipRow(T.bristolZone[p.seriesIndex] || p.color, (p.value[1] || 0) + '%', p.seriesName, 'rect'); });
          return html;
        } }),
      xAxis: xTime(ctx, vm.from, vm.to),
      yAxis: yValue(ctx, { min: 0, max: 100, interval: 50, axisLabel: axisLabel(ctx, { formatter: '{value}%' }) }),
      series: zones.map(function (z, i) {
        return Object.assign({ id: 'bw-' + z[0], name: ctx.t('doctor.cm.bristol.zone_' + z[0] + '_range'), type: 'bar', stack: 'b', barMaxWidth: 16,
          data: rows.map(function (w) { return [XB(ctx, w.start, size), Math.round(w.counts[z[0]] / w.n * 100) || null]; }) },
          _.calmBar(T, T.bristolZone[z[1]], i === zones.length - 1 ? [3, 3, 0, 0] : 0));
      })
    });
  }

  // ------------------------------------------------------------------ bloating & impact (0-10)
  /** vm = {from, to, bloating:[{day,value}], impact:[...], bloatingMean:[{day,value}], impactMean:[...]} */
  function symptomsTrend(vm, ctx, description) {
    var T = ctx.tok, o = base(ctx, description);
    vm = _.diaryVm(vm);
    var showDots = vm.to - vm.from + 1 <= C.DAILY_MAX_DAYS;
    var defs = [['bloating', T.chart[3], vm.bloating, vm.bloatingMean], ['impact', T.chart[4], vm.impact, vm.impactMean]];
    var series = [];
    defs.forEach(function (d) {
      var name = ctx.t('doctor.cm.symptoms.' + d[0]);
      if (showDots) series.push({ id: d[0] + '-day', name: name, type: 'scatter', symbolSize: 5, itemStyle: { color: d[1], opacity: 0.35 },
        data: d[2].filter(inRange(vm)).map(function (p) { return [X(ctx, p.day), p.value]; }) });
      series.push({ id: d[0] + '-mean', name: name, type: 'line', showSymbol: false, connectNulls: false,
        lineStyle: { width: 2, color: d[1] }, itemStyle: { color: d[1] },
        data: d[3].filter(inRange(vm)).map(function (m) { return [X(ctx, m.day), m.value == null ? null : M.roundTo(m.value, 1)]; }) });
    });
    return Object.assign(o, {
      grid: grid({ left: 32, right: 16, top: 12, bottom: 28 }),
      legend: legendHidden(defs.map(function (d) { return ctx.t('doctor.cm.symptoms.' + d[0]); })),
      xAxis: xTime(ctx, vm.from, vm.to),
      yAxis: yValue(ctx, { min: 0, max: 10, interval: 5 }),
      tooltip: Object.assign(o.tooltip, { trigger: 'axis', axisPointer: { type: 'line', lineStyle: { color: T.crosshair } },
        formatter: function (ps) {
          if (!ps.length) return '';
          var html = tipHead(dateLine(ctx, dayOfX(ctx, ps[0].value[0])));
          ps.forEach(function (p) {
            if (p.value[1] == null) return;
            var mean = /-mean$/.test(p.seriesId);
            html += tipRow(p.color, ctx.fmtNum(p.value[1], mean ? 1 : 0), p.seriesName + (mean ? ' · ' + ctx.t('doctor.cm.stool.series_mean') : ''), mean ? 'line' : 'rect');
          });
          return html;
        } }),
      series: series
    });
  }

  /** Share of diary days per severity band (0 / 1-3 / 4-6 / 7-10), one 100 % bar per symptom, calm ramp. */
  function symptomsDistribution(vm, ctx, description) {
    var T = ctx.tok, o = base(ctx, description), R = _.calmRamp(T);
    vm = _.diaryVm(vm);
    var bands = [['sev_none', 0, 0, R[0]], ['sev_mild', 1, 3, R[2]], ['sev_moderate', 4, 6, R[3]], ['sev_severe', 7, 10, R[5]]];
    var syms = ['bloating', 'impact'];
    var stats = syms.map(function (k) {
      var pts = vm[k].filter(inRange(vm));
      return bands.map(function (b) { return pts.filter(function (p) { return p.value >= b[1] && p.value <= b[2]; }).length; })
        .map(function (c) { return { c: c, n: pts.length }; });
    });
    return Object.assign(o, {
      grid: grid({ left: 110, right: 16, top: 8, bottom: 28 }),
      legend: legendHidden(bands.map(function (b) { return ctx.t('doctor.cm.symptoms.' + b[0]); })),
      tooltip: Object.assign(o.tooltip, { trigger: 'item', formatter: function (p) {
        var s = stats[p.dataIndex][p.seriesIndex];
        return tipRow(p.color, p.value + '%', p.seriesName, 'rect') + tipHead(ctx.t('doctor.cm.common.of_total', { done: s.c, total: ctx.tp('doctor.cm.common.n_diary_days', s.n, { n: s.n }) })); } }),
      xAxis: yValue(ctx, { min: 0, max: 100, interval: 25, axisLabel: axisLabel(ctx, { formatter: '{value}%' }) }),
      yAxis: { type: 'category', data: syms.map(function (k) { return ctx.t('doctor.cm.symptoms.' + k); }), axisLine: { show: false }, axisTick: { show: false },
        axisLabel: axisLabel(ctx, { fontSize: 12 }) },
      series: bands.map(function (b, i) {
        return { id: 'sev' + i, name: ctx.t('doctor.cm.symptoms.' + b[0]), type: 'bar', stack: 's', barMaxWidth: 24,
          itemStyle: { color: b[3], borderColor: T.surface, borderWidth: 1 },
          label: { show: true, color: i === 3 ? T.seqInkDark : T.seqInkLight, fontSize: 11, formatter: function (p) { return p.value >= 8 ? p.value + '%' : ''; } },
          data: stats.map(function (s) { return s[i].n ? Math.round(s[i].c / s[i].n * 100) : null; }) };
      })
    });
  }

  // ------------------------------------------------------------------ diet (context, not a clinical signal)
  var FOOD = [['vegetables_all', 'app.food_vegetables_all_types', 'servings'], ['root_vegetables', 'app.food_root_vegetables', 'servings'],
    ['whole_grains', 'app.food_whole_grains', 'servings'], ['whole_grain_bread', 'app.food_whole_grain_bread', 'slices'],
    ['nuts_and_seeds', 'app.food_nuts_and_seeds', 'handfuls'], ['legumes', 'app.food_legumes', 'servings'],
    ['fruits_with_skin', 'app.food_fruits_with_skin', 'pieces'], ['berries', 'app.food_berries_any', 'handfuls'],
    ['soft_fruits_no_skin', 'app.food_soft_fruits_without_skin', 'pieces'], ['muesli_and_bran', 'app.food_muesli_and_bran_cereals', 'servings']];
  var DRINK = [['water', 'app.drink_water', 'glasses'], ['tea', 'app.drink_tea', 'cups'], ['coffee', 'app.drink_coffee', 'cups'],
    ['juices', 'app.drink_juices', 'glasses'], ['dairy', 'app.drink_dairy_drinks', 'glasses'], ['carbonated', 'app.drink_carbonated_drinks', 'cans'],
    ['energy', 'app.drink_energy_drinks', 'cans'], ['alcohol', 'app.drink_alcohol', 'drinks']];
  var DIET_ROWS = FOOD.map(function (f) { return ['food'].concat(f); }).concat(DRINK.map(function (d) { return ['drink'].concat(d); }));

  /**
   * Heat-table: mean per diary day per week (≤ 26 columns, else 4-week blocks), bins 0 | ≤1 | ≤2 | ≤4 | ≤6 | >6
   * on the calm ramp seq-100…600 (A8). A week without diary = empty dashed cell with "–" (never inside the
   * diary window's past: the table starts at the window; never for the week/block that holds today, which is
   * still open). In-cell ink follows the fill.
   * vm = {from, to, today?, end?, rows: daily_entries with .day} (today defaults to `to`; from `end` on = not tracked)
   */
  function dietHeat(vm, ctx, description, widthPx) {
    var T = ctx.tok, o = base(ctx, description), R = _.calmRamp(T);
    vm = _.diaryVm(vm);
    var weeksSpan = Math.ceil((vm.to - M.isoWeekStart(vm.from) + 1) / 7);
    var size = weeksSpan > C.DIET_WEEKLY_MAX_COLS ? 28 : 7;
    var bs = size === 7 ? weekStartFn(ctx) : M.blockStartFn(vm.from, 28);
    var cols = [];
    for (var s = bs(vm.from); s <= vm.to; s += size) cols.push(s);
    var labels = DIET_ROWS.map(function (r) { return ctx.t('doctor.cm.diet.row_label', { item: ctx.t(r[2]), unit: ctx.t('doctor.cm.unit.' + r[3]) }); });
    var data = [], missing = [], today = vm.today != null ? vm.today : vm.to;
    cols.forEach(function (start, x) {
      var rs = vm.rows.filter(function (r) { return r.day >= start && r.day < start + size && r.day >= vm.from && r.day <= vm.to; });
      if (!rs.length && today >= start && today < start + size) return;        // the current week/block is still open: not "no diary"
      if (!rs.length && vm.end != null && start + size > vm.end) return;        // not tracked any more (deceased): not "no diary"
      DIET_ROWS.forEach(function (row, y) {
        if (!rs.length) { missing.push([x, y, 0]); return; }                    // no diary that week: empty cell with a dash
        var st = M.dietItemStats(rs, row[0], row[1]);
        var v = M.roundTo(st.meanPerDay, 1);
        data.push({ value: [x, y, v, st.n], label: { color: v > 6 ? T.seqInkDark : T.seqInkLight } });
      });
    });
    var showNums = ((widthPx || 900) - 232 - 12) / cols.length >= 28;
    return Object.assign(o, {
      grid: grid({ left: 232, right: 12, top: 6, bottom: 26 }),
      tooltip: Object.assign(o.tooltip, { trigger: 'item', formatter: function (p) {
        var head = ctx.t(size === 7 ? 'doctor.cm.common.week_of' : 'doctor.cm.common.block_of', { date: ctx.fmtDay(cols[p.value[0]], 'short') });
        return tipValue(ctx.fmtNum(p.value[2], 1)) + esc(labels[p.value[1]]) +
          tipHead(head + ' · ' + ctx.tp('doctor.cm.common.n_diary_days', p.value[3], { n: p.value[3] })); } }),
      xAxis: { type: 'category', data: cols, axisLine: { show: false }, axisTick: { show: false },
        axisLabel: axisLabel(ctx, { hideOverlap: true, formatter: function (v) { return _.axisDay(ctx, +v); } }) },
      yAxis: { type: 'category', data: labels, inverse: true, axisLine: { show: false }, axisTick: { show: false }, axisLabel: axisLabel(ctx) },
      visualMap: { type: 'piecewise', show: false, dimension: 2, seriesIndex: 0, pieces: [
        { min: 0, max: 0, color: R[0] }, { gt: 0, lte: 1, color: R[1] }, { gt: 1, lte: 2, color: R[2] },
        { gt: 2, lte: 4, color: R[3] }, { gt: 4, lte: 6, color: R[4] }, { gt: 6, color: R[5] }] },
      series: [{ id: 'diet', type: 'heatmap', data: data,
        itemStyle: { borderColor: T.surface, borderWidth: _.cellBorder(((widthPx || 900) - 244) / cols.length, 2), borderRadius: 3, decal: { symbol: 'none' } },
        label: { show: showNums, fontSize: 10, formatter: function (p) { return p.value[2] > 0 ? ctx.fmtNum(p.value[2], 1) : ''; } } },
        { id: 'diet-missing', type: 'heatmap', data: missing, silent: true,
          itemStyle: { color: T.empty, borderColor: T.emptyBorder, borderWidth: 1, borderType: 'dashed', borderRadius: 3, decal: { symbol: 'none' } },
          label: { show: showNums, fontSize: 10, color: T.ink3, formatter: '–' } }]
    });
  }

  /** "How often": share of diary days with any, unit-free; sorted inside each group, gap between groups. */
  function dietFrequency(vm, ctx, description) {
    var T = ctx.tok, o = base(ctx, description);
    vm = _.diaryVm(vm);
    var rowsIn = vm.rows.filter(inRange(vm));
    var stats = DIET_ROWS.map(function (r) { return { row: r, st: M.dietItemStats(rowsIn, r[0], r[1]), label: ctx.t(r[2]) }; });
    var byShare = function (a, b) { return (b.st.share || 0) - (a.st.share || 0); };
    var rows = stats.filter(function (s) { return s.row[0] === 'food'; }).sort(byShare).concat([null])     // null = gap between groups
      .concat(stats.filter(function (s) { return s.row[0] === 'drink'; }).sort(byShare));
    return Object.assign(o, {
      grid: grid({ left: 190, right: 40, top: 4, bottom: 24 }),
      tooltip: Object.assign(o.tooltip, { trigger: 'item', formatter: function (p) {
        var s = rows[p.dataIndex];
        return tipValue(p.value + '%') + esc(s.label) +
          tipHead(ctx.t('doctor.cm.common.of_total', { done: s.st.daysConsumed, total: ctx.tp('doctor.cm.common.n_diary_days', s.st.n, { n: s.st.n }) })); } }),
      xAxis: yValue(ctx, { min: 0, max: 100, interval: 25, axisLabel: axisLabel(ctx, { formatter: '{value}%' }) }),
      yAxis: { type: 'category', inverse: true, data: rows.map(function (s) { return s ? s.label : ''; }),
        axisLine: { show: false }, axisTick: { show: false }, axisLabel: axisLabel(ctx) },
      series: [Object.assign({ id: 'diet-freq', type: 'bar', barMaxWidth: 12,
        label: { show: true, position: 'right', color: T.ink2, fontSize: 11, formatter: '{c}%' },
        data: rows.map(function (s) { return s && s.st.share != null ? _.calmValue(Math.round(s.st.share * 100)) : null; }) }, _.calmBar(T, T.chart[0], [0, 3, 3, 0]))]
    });
  }

  // ------------------------------------------------------------------ monthly QoL (v2 only)
  var BURDEN = [['avoid_travel', 'app.avoid_traveling'], ['avoid_social', 'app.avoid_social'], ['embarrassed', 'app.feel_embarrassed'],
    ['worry_notice', 'app.worry_others_notice'], ['depressed', 'app.feel_depressed']];
  /** Burden items 1-4 × months, calm ramp (100/300/400/600), number in each cell ≥ 22 px wide. vm = {from, to, rows:[{day, …}]} */
  function monthlyBurden(vm, ctx, description, widthPx) {
    var T = ctx.tok, o = base(ctx, description), R = _.calmRamp(T);
    var rows = vm.rows.filter(inRange(vm));
    var fills = [R[0], R[2], R[3], R[5]];
    var data = [];
    rows.forEach(function (r, x) {
      BURDEN.forEach(function (b, y) {
        var v = r[b[0]];
        if (v >= 1 && v <= 4) data.push({ value: [x, y, v], label: { color: v === 4 ? T.seqInkDark : T.seqInkLight } });
      });
    });
    var right = _.capRight(widthPx, 170, Math.max(1, rows.length), 56);
    var cellW = ((widthPx || 900) - 170 - right) / Math.max(1, rows.length);
    var showNums = cellW >= 22;                                                      // long ranges: colour + tooltip + table
    return Object.assign(o, {
      grid: grid({ left: 170, right: right, top: 4, bottom: 24 }),
      tooltip: Object.assign(o.tooltip, { trigger: 'item', formatter: function (p) {
        return tipValue(p.value[2] + ' / 4') + esc(ctx.t(BURDEN[p.value[1]][1])) + tipHead(ctx.fmtDay(rows[p.value[0]].day, 'long')); } }),
      xAxis: { type: 'category', data: rows.map(function (r) { return ctx.fmtDay(r.day, 'short'); }), axisLine: { show: false }, axisTick: { show: false },
        axisLabel: axisLabel(ctx, { hideOverlap: true }) },
      yAxis: { type: 'category', data: BURDEN.map(function (b) { return ctx.t(b[1]); }), inverse: true, axisLine: { show: false }, axisTick: { show: false },
        axisLabel: axisLabel(ctx, { fontSize: 12 }) },
      visualMap: { type: 'piecewise', show: false, dimension: 2, pieces: [1, 2, 3, 4].map(function (l) { return { value: l, color: fills[l - 1] }; }) },
      series: [{ id: 'burden', type: 'heatmap', data: data,
        itemStyle: { borderColor: T.surface, borderWidth: _.cellBorder(cellW, 3), borderRadius: 6, decal: { symbol: 'none' } },
        label: { show: showNums, fontSize: 12, fontWeight: 600, formatter: function (p) { return String(p.value[2]); } } }]
    });
  }

  /** Control and satisfaction 0-10 (higher is better; never on one axis with the burden items). */
  function monthlyScores(vm, ctx, description) {
    var T = ctx.tok, o = base(ctx, description);
    var rows = vm.rows.filter(inRange(vm));
    var defs = [['control', 'app.feel_in_control', T.chart[2]], ['satisfaction', 'app.satisfaction', T.chart[3]]];
    return Object.assign(o, {
      grid: grid({ left: 32, right: 16, top: 12, bottom: 28 }),
      legend: legendHidden(defs.map(function (d) { return ctx.t(d[1]); })),
      xAxis: xTime(ctx, vm.from, vm.to),
      yAxis: yValue(ctx, { min: 0, max: 10, interval: 5 }),
      tooltip: Object.assign(o.tooltip, { trigger: 'axis', axisPointer: { type: 'line', lineStyle: { color: T.crosshair } },
        formatter: function (ps) {
          var html = tipHead(dateLine(ctx, dayOfX(ctx, ps[0].value[0])));
          ps.forEach(function (p) { if (p.value[1] != null) html += tipRow(p.color, p.value[1] + ' / 10', p.seriesName); });
          return html;
        } }),
      series: defs.map(function (d) {
        return { id: 'm-' + d[0], name: ctx.t(d[1]), type: 'line', symbol: 'circle', symbolSize: 8, connectNulls: false,
          lineStyle: { width: 2, color: d[2] }, itemStyle: { color: d[2], borderColor: T.pointRing, borderWidth: 2 },
          data: rows.map(function (r) { return [X(ctx, r.day), r[d[0]] == null ? null : r[d[0]]]; }) };
      })
    });
  }

  // ------------------------------------------------------------------ steps
  function stepsAxis(ctx) {
    return yValue(ctx, { min: 0, axisLabel: axisLabel(ctx, { formatter: function (v) { return v >= 1000 ? ctx.fmtNum(v / 1000, 0) + 'k' : v; } }) });
  }

  /** vm = {from, to, steps:[{day,value}], mean:[{day,value}]}. Soft daily bars + 7-day mean; > 92 days mean only. */
  function stepsDaily(vm, ctx, description) {
    var T = ctx.tok, o = base(ctx, description);
    vm = _.diaryVm(vm);
    var series = [];
    if (vm.to - vm.from + 1 <= C.DAILY_MAX_DAYS) series.push({ id: 'steps', name: ctx.t('doctor.cm.steps.series_daily'), type: 'bar', barMaxWidth: 10,
      itemStyle: { color: _.mix(T.metricSteps, T.surface, 0.35), borderRadius: [3, 3, 0, 0] }, emphasis: { itemStyle: { color: T.metricSteps } },
      data: vm.steps.filter(inRange(vm)).map(function (p) { return [X(ctx, p.day), p.value]; }) });
    series.push({ id: 'steps-mean', name: ctx.t('doctor.cm.steps.series_mean'), type: 'line', showSymbol: false, connectNulls: false,
      lineStyle: { width: 2, color: T.metricSteps }, itemStyle: { color: T.metricSteps },
      data: vm.mean.filter(inRange(vm)).map(function (m) { return [X(ctx, m.day), m.value == null ? null : Math.round(m.value)]; }) });
    return Object.assign(o, {
      grid: grid({ left: 44, right: 16, top: 12, bottom: 28 }),
      legend: legendHidden(series.map(function (s) { return s.name; })),
      xAxis: xTime(ctx, vm.from, vm.to),
      yAxis: stepsAxis(ctx),
      tooltip: Object.assign(o.tooltip, { trigger: 'axis', axisPointer: { type: 'line', lineStyle: { color: T.crosshair } },
        formatter: function (ps) {
          if (!ps.length) return '';
          var html = tipHead(dateLine(ctx, dayOfX(ctx, ps[0].value[0])));
          ps.forEach(function (p) { if (p.value[1] != null) html += tipRow(T.metricSteps, ctx.fmtNum(p.value[1], 0), p.seriesName, p.seriesType === 'bar' ? 'rect' : 'line'); });
          return html;
        } }),
      series: series
    });
  }

  /** Weekly mean per synced day, calm bars (faint when < LOW_N_BUCKET days). */
  function stepsWeekly(vm, ctx, description) {
    var T = ctx.tok, o = base(ctx, description);
    vm = _.diaryVm(vm);
    var b = M.buckets(vm.steps, vm.from, vm.to, weekStartFn(ctx), 7).filter(function (x) { return x.n; });
    return Object.assign(o, {
      grid: grid({ left: 44, right: 16, top: 12, bottom: 28 }),
      xAxis: xTime(ctx, vm.from, vm.to),
      yAxis: stepsAxis(ctx),
      tooltip: Object.assign(o.tooltip, { trigger: 'item', formatter: function (p) {
        var w = b[p.dataIndex];
        return tipValue(ctx.fmtNum(Math.round(w.value), 0)) + esc(ctx.t('doctor.cm.steps.series_weekly')) +
          tipHead(ctx.t('doctor.cm.common.week_of', { date: ctx.fmtDay(w.start, 'short') }) + ' · ' + ctx.tp('doctor.cm.common.n_days', w.n, { n: w.n })); } }),
      series: [Object.assign({ id: 'steps-week', name: ctx.t('doctor.cm.steps.series_weekly'), type: 'bar', barMaxWidth: 16,
        data: b.map(function (w) {
          var item = { value: [XB(ctx, w.start, 7), Math.round(w.value)] };
          if (w.n < C.LOW_N_BUCKET) item.itemStyle = { opacity: 0.45 };
          return item;
        }) }, _.calmBar(T, T.metricSteps))]
    });
  }

  Object.assign(O, {
    larsTrend: larsTrend, larsItems: larsItems, larsShare: larsShare,
    eqProfile: eqProfile, eqVas: eqVas, eqLevels: eqLevels,
    questionnaireCalendar: questionnaireCalendar, questionnaireWeekly: questionnaireWeekly,
    stoolTrend: stoolTrend, stoolCalendar: stoolCalendar, symptomRaster: symptomRaster,
    bristolTypes: bristolTypes, bristolZones: bristolZones, bristolWeekly: bristolWeekly,
    symptomsTrend: symptomsTrend, symptomsDistribution: symptomsDistribution,
    dietHeat: dietHeat, dietFrequency: dietFrequency, DIET_ROWS: DIET_ROWS,
    monthlyBurden: monthlyBurden, monthlyScores: monthlyScores,
    stepsDaily: stepsDaily, stepsWeekly: stepsWeekly
  });
  if (typeof module !== 'undefined' && module.exports) module.exports = O;
})(typeof window !== 'undefined' ? window : this);
