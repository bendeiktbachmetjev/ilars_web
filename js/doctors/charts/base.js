/*
 * charts/base.js — shared pieces of the ECharts 6.1.0 option builders (namespace ILARS_CHART_OPTIONS).
 * The builders live in charts/sparkline.js, charts/patient.js and charts/cohort.js and add themselves here.
 * Meaning of every chart: CHARTS-METRICS.md §7–§10 with DESIGN-SPEC Appendix A applied.
 *
 * Every builder is pure: (viewModel, ctx, description[, widthPx]) -> option. No DOM, no Date.now().
 * ctx = {
 *   tok:   colour tokens read from the CSS custom properties (charts/theme.js readTokens()),
 *   t(key, params), tp(key, n, params): i18n (tp picks _one/_few/_other via Intl.PluralRules),
 *   lang, reduced (prefers-reduced-motion), patterns (decal toggle),
 *   fmtDay(day, 'axis'|'short'|'long'), fmtNum(v, decimals),
 *   x: {mode: 'date'|'study'|'surgery', ref: dayKey|null}
 * }
 *
 * Calm look (lead decision "restraint"): large data areas are never loud.
 *  - Single-colour bars (one series, or one colour per bar) are drawn as a TINT of their colour with a 1 px
 *    border in the full colour (the border keeps the >= 3:1 edge of COLOR.md); hover shows the full colour.
 *  - Stacks of several identity colours (LARS items, EQ levels, questionnaire types, Bristol zones, LARS
 *    categories) keep their full token colours: their colour-blind separation was validated on those values.
 *  - Magnitude heat tables use the calm ramp --viz-seq-100…600 (A8); numbers on step 600 use the dark-step ink.
 *  - No universalTransition / divideShape 'clone' anywhere (A7): charts/card.js cross-fades between coordinate systems.
 */
(function (root) {
  'use strict';
  var M = root.ILARS_METRICS || (typeof require === 'function' ? require('../data/metrics.js') : null);
  var C = M.C;
  var DAY = 86400000;
  var CALM_TINT = 0.42;                 // share of the series colour in a calm bar fill (rest = chart surface)

  // ------------------------------------------------------------------ text
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  // ------------------------------------------------------------------ colour helpers
  /** '#rgb' | '#rrggbb' | 'rgb(r g b / a)' | 'rgb(r, g, b)' | 'rgba(…)' -> [r, g, b] | null */
  function rgbOf(c) {
    c = String(c == null ? '' : c).trim();
    var m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(c);
    if (m) {
      var h = m[1].length === 3 ? m[1].replace(/(.)/g, '$1$1') : m[1];
      return [0, 2, 4].map(function (i) { return parseInt(h.substr(i, 2), 16); });
    }
    m = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/i.exec(c);
    return m ? [+m[1], +m[2], +m[3]] : null;
  }
  /** Opaque mix: `w` of colour c over `base` (default white). Unparseable colours come back unchanged. */
  function mix(c, base, w) {
    var a = rgbOf(c), b = rgbOf(base) || [255, 255, 255];
    if (!a) return c;
    return '#' + a.map(function (v, i) {
      var x = Math.round(b[i] + (v - b[i]) * w).toString(16);
      return x.length < 2 ? '0' + x : x;
    }).join('');
  }
  function alpha(c, a) { var x = rgbOf(c); return x ? 'rgba(' + x.join(',') + ',' + a + ')' : c; }

  /**
   * Calm bar style for one colour: tinted fill + full-colour 1 px edge; hover = full colour.
   * Returns {itemStyle, emphasis} to spread into a series or a data item.
   */
  function calmBar(T, color, radius) {
    return {
      itemStyle: { color: mix(color, T.surface, CALM_TINT), borderColor: color, borderWidth: 1, borderRadius: radius == null ? [3, 3, 0, 0] : radius },
      emphasis: { itemStyle: { color: color, borderColor: color } }
    };
  }
  /** One calm bar as a data item; a zero count draws nothing (no stray 1 px edge on the baseline). */
  function calmItem(T, color, value, radius) {
    var s = calmBar(T, color, radius);
    if (!value) s.itemStyle.borderWidth = 0;
    return Object.assign({ value: value }, s);
  }
  /** Data value for a series-level calm bar: zero without its edge. */
  function calmValue(v) { return v === 0 ? { value: 0, itemStyle: { borderWidth: 0 } } : v; }
  /** Calm magnitude ramp for heat tables (A8): --viz-seq-100…600. */
  function calmRamp(T) { return T.seq.slice(0, 6); }

  // ------------------------------------------------------------------ option scaffolding
  function base(ctx, description) {
    var T = ctx.tok, anim = !ctx.reduced;
    return {
      useUTC: true,                                   // day keys are UTC midnights: never shift a day
      animation: anim,
      animationDuration: 500, animationDurationUpdate: 450,
      animationEasing: 'cubicOut', animationEasingUpdate: 'cubicInOut',
      textStyle: { fontFamily: T.font, fontSize: 12, color: T.ink2 },
      aria: { enabled: true, label: { description: description || '' }, decal: { show: !!ctx.patterns } },
      tooltip: {
        confine: true, backgroundColor: T.surface, borderColor: T.hairline, borderWidth: 1,
        padding: [8, 10], textStyle: { color: T.ink, fontSize: 12, fontFamily: T.font },
        extraCssText: 'border-radius:10px;box-shadow:0 8px 24px rgba(0,0,0,.10);max-width:280px;white-space:normal;'
      }
    };
  }

  function grid(o) { return Object.assign({ left: 40, right: 16, top: 12, bottom: 28 }, o); }

  /** x value for a day key in the current axis mode. */
  function X(ctx, day) { return ctx.x.mode === 'date' ? day * DAY : day - ctx.x.ref; }
  /** x of a bucket centre (bars drawn in the middle of their week/block). */
  function XB(ctx, start, size) { return ctx.x.mode === 'date' ? (start + size / 2) * DAY : start + size / 2 - ctx.x.ref; }
  function dayOfX(ctx, v) { return ctx.x.mode === 'date' ? Math.round(v / DAY) : Math.round(v) + ctx.x.ref; }

  /** Category-axis label style: every axis label uses --viz-axis-label (tok.ink3). */
  function axisLabel(ctx, o) { return Object.assign({ color: ctx.tok.ink3, fontSize: 11 }, o); }

  /** The time x-axis every time-based chart uses (crosshair-synced charts must use the same one). */
  function xTime(ctx, from, to, extra) {
    var common = {
      axisLine: { lineStyle: { color: ctx.tok.axis } }, axisTick: { show: false }, splitLine: { show: false },
      axisLabel: axisLabel(ctx, { hideOverlap: true })
    };
    if (ctx.x.mode === 'date') {
      return Object.assign(common, {
        type: 'time', min: (from - 0.5) * DAY, max: (to + 0.5) * DAY,
        axisLabel: Object.assign(common.axisLabel, { formatter: function (v) { return ctx.fmtDay(Math.round(v / DAY), 'axis'); } })
      }, extra);
    }
    return Object.assign(common, {
      type: 'value', min: from - ctx.x.ref - 0.5, max: to - ctx.x.ref + 0.5, minInterval: 7,
      axisLabel: Object.assign(common.axisLabel, { formatter: function (v) { return ctx.t('doctor.cm.axis.day_n', { n: Math.round(v) }); } })
    }, extra);
  }

  function yValue(ctx, o) {
    return Object.assign({
      type: 'value', axisLine: { show: false }, axisTick: { show: false },
      axisLabel: axisLabel(ctx, { showMinLabel: true }), splitLine: { lineStyle: { color: ctx.tok.grid, width: 1 } }
    }, o);
  }

  /** "12 Aug 2026" (+ " · Day 42" in relative axis modes). */
  function dateLine(ctx, day) {
    var s = ctx.fmtDay(day, 'long');
    if (ctx.x.mode !== 'date') s += ' · ' + ctx.t('doctor.cm.axis.day_n', { n: day - ctx.x.ref });
    return s;
  }

  // ------------------------------------------------------------------ tooltips (HTML; untrusted text through esc)
  /** Value first (strong), label second; line key or square key. */
  function tipRow(color, value, label, kind) {
    var key = kind === 'rect'
      ? '<span style="display:inline-block;width:8px;height:8px;border-radius:2px;background:' + color + ';margin-right:6px"></span>'
      : '<span style="display:inline-block;width:12px;height:2px;background:' + color + ';vertical-align:middle;margin-right:6px"></span>';
    return '<div style="display:flex;align-items:center;gap:2px;line-height:1.5">' + key +
      '<b style="font-weight:600">' + esc(value) + '</b>&nbsp;<span style="opacity:.75">' + esc(label) + '</span></div>';
  }
  function tipHead(text) { return '<div style="opacity:.7;margin-bottom:2px">' + esc(text) + '</div>'; }
  /** Big first line of a tooltip; `small` is an optional muted suffix. Both escaped. */
  function tipValue(value, small) {
    return '<div style="font-size:15px;font-weight:600">' + esc(value) +
      (small ? ' <span style="font-size:12px;font-weight:500;opacity:.75">' + esc(small) + '</span>' : '') + '</div>';
  }

  function legendHidden(names) { return { show: false, data: names }; }   // HTML legend drives it (dispatchAction)

  /**
   * The ring shared by the three donuts (LARS share, Bristol zones, cohort LARS category). The ring leaves room
   * for the outside percentage labels on narrow cards, and the labels never truncate ("4…"). One slice draws a
   * closed ring (no pad gap at the top). Callers add id, label.formatter and data.
   */
  function donut(T, slices) {
    return { type: 'pie', radius: ['56%', '70%'], padAngle: slices > 1 ? 1.5 : 0, percentPrecision: 0, itemStyle: { borderRadius: 4 },
      label: { color: T.ink2, fontSize: 12, overflow: 'none' }, labelLine: { length: 6, length2: 6, lineStyle: { color: T.axis } } };
  }

  var CAT_TOK = { none: 'larsNone', minor: 'larsMinor', major: 'larsMajor', nodata: 'larsUnknown' };
  var ADH_TOK = { good: 'adhGood', partial: 'adhPartial', poor: 'adhPoor' };
  function catLabel(ctx, cat) { return ctx.t('doctor.cm.lars.cat_' + (cat || 'nodata')); }

  /** LARS category bands (markArea) with their names at the right edge in the *-ink tokens. */
  function larsBands(ctx) {
    var T = ctx.tok;
    return [
      [0, C.LARS_MINOR_FROM, T.larsNoneWash, 'band_none', T.larsNoneInk],
      [C.LARS_MINOR_FROM, C.LARS_MAJOR_FROM, T.larsMinorWash, 'band_minor', T.larsMinorInk],
      [C.LARS_MAJOR_FROM, C.LARS_MAX, T.larsMajorWash, 'band_major', T.larsMajorInk]
    ].map(function (b) {
      return [{ yAxis: b[0], name: ctx.t('doctor.cm.lars.' + b[3]), itemStyle: { color: b[2] },
        label: { position: 'right', color: b[4], fontSize: 12, fontWeight: 600, distance: 8 } }, { yAxis: b[1] }];
    });
  }

  /**
   * A24: diary-based cards start at the 730-day diary window. vm.today (or vm.to, which is today on the
   * patient page) ends the window. Returns vm itself, or a copy with `from` moved and `clipped: true`.
   */
  function diaryVm(vm) {
    var f = M.diaryWindowStart(vm.from, vm.today != null ? vm.today : vm.to);
    return f > vm.from ? Object.assign({}, vm, { from: f, clipped: true }) : vm;
  }

  // ------------------------------------------------------------------ calendars
  function weekdayNames(lang) {
    var f = new Intl.DateTimeFormat(lang, { weekday: 'narrow', timeZone: 'UTC' });
    var out = [];
    for (var i = 0; i < 7; i++) out.push(f.format(new Date(Date.UTC(2026, 0, 4 + i))));   // 2026-01-04 = Sunday
    return out;
  }
  function monthNames(lang) {
    var f = new Intl.DateTimeFormat(lang, { month: 'short', timeZone: 'UTC' });
    var out = [];
    for (var i = 0; i < 12; i++) out.push(f.format(new Date(Date.UTC(2026, i, 15))));
    return out;
  }

  /**
   * Calendar range never exceeds CALENDAR_MAX_WEEKS, nor (with widthPx) the weeks that fit the card at the
   * smallest 6 px cell, so a phone card shows the latest weeks instead of cutting them off; returns {from, clipped}.
   */
  function calendarFrom(from, to, widthPx) {
    var weeks = Math.min(C.CALENDAR_MAX_WEEKS, Math.floor(((widthPx || 900) - 36) / 6));
    var minFrom = M.isoWeekStart(to) - (weeks - 1) * 7;
    return from < minFrom ? { from: minFrom, clipped: true } : { from: from, clipped: false };
  }

  /**
   * Calendar coordinate system. Range and data are 'YYYY-MM-DD' STRINGS (never ms: a timestamp lands one
   * cell early in UTC−5/−10). Cells never stretch: width ≤ 20 px from the card width, height = cellSize (no
   * `bottom`, which would stretch the rows to the box). left/top are whole multiples of the cell size, so a
   * decal tile of one cell (the EQ-5D-5L ring) sits centred in every cell.
   */
  function calendarBox(ctx, from, to, widthPx) {
    var T = ctx.tok;
    var weeks = Math.ceil((M.isoWeekStart(to) - M.isoWeekStart(from)) / 7) + 1;
    var cw = Math.max(6, Math.min(20, Math.floor(((widthPx || 900) - 34) / (weeks + 1))));
    var ch = Math.max(10, Math.min(16, cw));
    // a partial first / last month shows its name only when enough of it is on screen (about 26 px)
    var minDays = Math.ceil(26 * 7 / cw), fd = new Date(from * DAY);
    var firstDays = new Date(Date.UTC(fd.getUTCFullYear(), fd.getUTCMonth() + 1, 0)).getUTCDate() - fd.getUTCDate() + 1;
    return {
      range: [M.dayToIso(from), M.dayToIso(to)], top: Math.ceil(22 / ch) * ch, left: Math.ceil(30 / cw) * cw,
      cellSize: [cw, ch], orient: 'horizontal', splitLine: { show: false },
      itemStyle: { color: T.surface, borderColor: T.calMissed, borderWidth: 1, borderType: 'dashed' },   // no entry: hollow, >= 3:1 (A27)
      dayLabel: { firstDay: 1, nameMap: weekdayNames(ctx.lang), color: T.ink3, fontSize: 10 },
      monthLabel: { color: T.ink3, fontSize: 11, formatter: function (p) {
        var names = monthNames(ctx.lang), first = M.dayToIso(from), last = M.dayToIso(to), ym = p.yyyy + '-' + p.MM;
        if (ym === last.slice(0, 7) && +last.slice(8) < minDays && ym !== first.slice(0, 7)) return '';   // partial last month
        if (ym === first.slice(0, 7) && firstDays < minDays && ym !== last.slice(0, 7)) return '';        // partial first month
        return names[+p.M - 1]; } },
      yearLabel: { show: false }
    };
  }

  /** Heat-table cell gap: the full white gap on normal cells, thinner on small ones, none on tiny ones (never eats the cell). */
  function cellBorder(cellPx, full) { return cellPx < 6 ? 0 : cellPx < 10 ? Math.min(1, full) : full; }

  /** Right grid padding that caps heat-table cells at maxCell px (cells never stretch on wide cards). */
  function capRight(widthPx, left, cols, maxCell) {
    return Math.max(8, (widthPx || 900) - left - cols * maxCell);
  }

  var O = {
    esc: esc, base: base, xTime: xTime, X: X, calendarFrom: calendarFrom,
    /** Internal helpers shared by charts/sparkline.js, charts/patient.js and charts/cohort.js. */
    _: {
      M: M, C: C, DAY: DAY, rgbOf: rgbOf, mix: mix, alpha: alpha, calmBar: calmBar, calmItem: calmItem, calmValue: calmValue, calmRamp: calmRamp,
      grid: grid, XB: XB, dayOfX: dayOfX, axisLabel: axisLabel, yValue: yValue, dateLine: dateLine,
      tipRow: tipRow, tipHead: tipHead, tipValue: tipValue, legendHidden: legendHidden, donut: donut,
      CAT_TOK: CAT_TOK, ADH_TOK: ADH_TOK, catLabel: catLabel, larsBands: larsBands, diaryVm: diaryVm,
      calendarBox: calendarBox, capRight: capRight, cellBorder: cellBorder
    }
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = O;
  else root.ILARS_CHART_OPTIONS = O;
})(typeof window !== 'undefined' ? window : this);
