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
 *  - Time stacks that fill a whole plot (LARS items per score, Bristol zones over time) use the same calm
 *    style per segment: tint + 1 px full-colour edge (the edge keeps the identity colour and its colour-blind
 *    separation); a zero segment is left out, so no stray edge line is drawn.
 *  - Donut slices take the same calm style as the bar view of the same data (tint + full-colour edge), so a view
 *    switch keeps the same weight. Small identity marks (EQ levels, the rarer questionnaire types) keep their
 *    full token colours: their colour-blind separation was validated on those values. A daily-diary day is a
 *    calm cell (light fill + darker edge, lead decision).
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
      // no description: ECharts must not write its own English label of raw values over the card's aria-label
      aria: { enabled: true, label: description ? { description: description } : { enabled: false }, decal: { show: !!ctx.patterns } },
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
  /**
   * x of a bucket bar: the centre of the part of the bucket inside [from, to]. A bucket only counts the days in
   * range (M.buckets), so a cut first week and the current week get a whole bar over their own days instead of a
   * sliver at the axis edge; full buckets sit at their centre (= XB). The symptom raster's cut columns match.
   */
  function XV(ctx, start, size, from, to) {
    var mid = (Math.max(start, from) + Math.min(start + size, to + 1)) / 2;
    return ctx.x.mode === 'date' ? mid * DAY : mid - ctx.x.ref;
  }
  function dayOfX(ctx, v) { return ctx.x.mode === 'date' ? Math.round(v / DAY) : Math.round(v) + ctx.x.ref; }

  /** Category-axis label style: every axis label uses --viz-axis-label (tok.ink3). */
  function axisLabel(ctx, o) { return Object.assign({ color: ctx.tok.ink3, fontSize: 11 }, o); }

  // ------------------------------------------------------------------ month names on axes and calendars
  var LONG_MONTH = {};
  function longMonth(lang, d) {
    var f = LONG_MONTH[lang] || (LONG_MONTH[lang] = new Intl.DateTimeFormat(lang, { month: 'long', timeZone: 'UTC' }));
    return f.format(d);
  }
  /**
   * Axis label of a day ("5 Sept", a month name on the 1st, the year on 1 January). A month start shows the same
   * short month as the dates beside it (ctx.fmtDay 'month': Lithuanian "rugp." next to "liep. 8", never a lone "08"
   * or the long "rugpjūtis").
   */
  function axisDay(ctx, day) {
    var d = new Date(day * DAY);
    return d.getUTCDate() === 1 && d.getUTCMonth() > 0 ? ctx.fmtDay(day, 'month') : ctx.fmtDay(day, 'axis');
  }
  /**
   * Day + short month, never the year ("16 Oct", lt "spal. 16" — Lithuanian CLDR would give "10-16"): the date of a
   * column when the year does not fit (EQ-5D-5L visits across a new year).
   */
  var DAY_MONTH = {};
  function dayMonth(ctx, day) {
    var d = new Date(day * DAY);
    if (/^lt\b/.test(ctx.lang)) return ctx.fmtDay(day, 'month') + ' ' + d.getUTCDate();
    var f = DAY_MONTH[ctx.lang] || (DAY_MONTH[ctx.lang] = new Intl.DateTimeFormat(ctx.lang, { day: 'numeric', month: 'short', timeZone: 'UTC' }));
    return f.format(d);
  }

  /** The time x-axis every time-based chart uses (crosshair-synced charts must use the same one). */
  function xTime(ctx, from, to, extra) {
    var common = {
      axisLine: { lineStyle: { color: ctx.tok.axis } }, axisTick: { show: false }, splitLine: { show: false },
      axisLabel: axisLabel(ctx, { hideOverlap: true })
    };
    if (ctx.x.mode === 'date') {
      return Object.assign(common, {
        type: 'time', min: (from - 0.5) * DAY, max: (to + 0.5) * DAY,
        axisLabel: Object.assign(common.axisLabel, { formatter: function (v) { return axisDay(ctx, Math.round(v / DAY)); } })
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

  /** A share 0..1 as shown text: M.percentParts, so never "0%" when something happened, never "100%" when not all. */
  function pct(ratio) { var p = M.percentParts(ratio); return p ? p.prefix + p.value + '%' : '–'; }

  function legendHidden(names) { return { show: false, data: names }; }   // HTML legend drives it (dispatchAction)

  /**
   * The ring shared by the three donuts (LARS share, Bristol zones, cohort LARS category). The ring leaves room
   * for the outside percentage labels on narrow cards, and the labels never truncate ("4…"). One slice draws a
   * closed ring: no pad gap and no rounded ends (they would cut a notch at 12 o'clock), and no "100%" label on a
   * leader line (the centre, the legend and the tooltip already say it). Callers add id, label.formatter and data.
   */
  function donut(T, slices) {
    var one = slices <= 1;
    return { type: 'pie', radius: ['56%', '70%'], padAngle: one ? 0 : 1.5, percentPrecision: 0, itemStyle: { borderRadius: one ? 0 : 4 },
      label: { show: !one, color: T.ink2, fontSize: 12, overflow: 'none' }, labelLine: { show: !one, length: 6, length2: 6, lineStyle: { color: T.axis } } };
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
  function weekdayNames(lang, style) {
    var f = new Intl.DateTimeFormat(lang, { weekday: style || 'narrow', timeZone: 'UTC' });
    var out = [];
    for (var i = 0; i < 7; i++) out.push(f.format(new Date(Date.UTC(2026, 0, 4 + i))));   // 2026-01-04 = Sunday
    return out;
  }
  /** Short month names; a language whose short month is only a number ("06", Lithuanian) gets the long names. */
  function monthNames(lang) {
    var f = new Intl.DateTimeFormat(lang, { month: 'short', timeZone: 'UTC' });
    var out = [];
    for (var i = 0; i < 12; i++) out.push(f.format(new Date(Date.UTC(2026, i, 15))));
    return /^\d+\.?$/.test(out[5]) ? out.map(function (s, i) { return longMonth(lang, new Date(Date.UTC(2026, i, 15))); }) : out;
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
   * decal tile of one cell (the EQ-5D-5L ring) sits centred in every cell. A calendar narrower than its card
   * (1M, 3M on a wide card) is centred instead of hugging the left edge.
   * A short range (calendarBig: at most BIG_CAL_WEEKS weeks, i.e. 1M) is a wall calendar: weekdays across the
   * top, one row per week, cells up to BIG_CELL_W × BIG_CELL_H px with the day of the month in their corner
   * (dayNumbers); the first cell column holds the month names.
   * The day grid itself is plain (no border): missed days are drawn by missedSeries() on top of the data, so the
   * white gap of a neighbouring filled cell never paints over their dashed border.
   * labelTo (optional): the last tracked day (a deceased patient) — no month name over the empty weeks after it.
   */
  var BIG_CAL_WEEKS = 6, BIG_CELL_W = 112, BIG_CELL_H = 36;
  function calendarWeeks(from, to) { return Math.ceil((M.isoWeekStart(to) - M.isoWeekStart(from)) / 7) + 1; }
  /** True when the calendar of from..to is the month view (the view gives that chart a taller box). */
  function calendarBig(from, to) { return calendarWeeks(from, to) <= BIG_CAL_WEEKS; }
  /** Cell size, offsets and drawn height of the calendar of from..to in a box widthPx wide. */
  function calendarGeom(from, to, widthPx) {
    var w = widthPx || 900, weeks = calendarWeeks(from, to), big = weeks <= BIG_CAL_WEEKS, cw, ch, left, top;
    if (big) {
      cw = Math.max(20, Math.min(BIG_CELL_W, Math.floor(w / 8)));
      ch = BIG_CELL_H;
      left = Math.floor(Math.max(0, w - 8 * cw) / 2 / cw) * cw + cw;
      top = ch;
    } else {
      cw = Math.max(6, Math.min(20, Math.floor((w - 34) / (weeks + 1))));
      ch = Math.max(10, Math.min(16, cw));
      left = Math.ceil(30 / cw) * cw;
      if (widthPx) left = Math.max(left, Math.floor((widthPx - weeks * cw) / 2 / cw) * cw);
      top = Math.ceil(22 / ch) * ch;
    }
    return { big: big, weeks: weeks, cw: cw, ch: ch, left: left, top: top, height: top + (big ? weeks : 7) * ch };
  }
  /** Drawn height of a calendar (labels + rows): the view sizes its canvas to it, so no blank band stays under it. */
  function calendarHeight(from, to, widthPx) { return calendarGeom(from, to, widthPx).height; }
  function calendarBox(ctx, from, to, widthPx, labelTo) {
    var T = ctx.tok, g = calendarGeom(from, to, widthPx), cw = g.cw, ch = g.ch, big = g.big;
    var minDays = big ? 7 : Math.ceil(26 * 7 / cw);  // a partial first / last month needs a row (month view) or about 26 px for its name
    var fd = new Date(from * DAY);
    var firstDays = new Date(Date.UTC(fd.getUTCFullYear(), fd.getUTCMonth() + 1, 0)).getUTCDate() - fd.getUTCDate() + 1;
    var lastDay = labelTo != null ? Math.max(from, Math.min(to, labelTo)) : to;
    return {
      range: [M.dayToIso(from), M.dayToIso(to)], top: g.top, left: g.left,
      cellSize: [cw, ch], orient: big ? 'vertical' : 'horizontal', splitLine: { show: false },
      itemStyle: { color: T.surface, borderColor: T.calMissed, borderWidth: 0 },
      dayLabel: { firstDay: 1, nameMap: weekdayNames(ctx.lang, big && cw >= 36 ? 'short' : 'narrow'), color: T.ink3, fontSize: big ? 11 : 10 },
      monthLabel: { color: T.ink3, fontSize: 11, formatter: function (p) {
        var names = monthNames(ctx.lang), first = M.dayToIso(from), last = M.dayToIso(lastDay), ym = p.yyyy + '-' + p.MM;
        if (ym > last.slice(0, 7)) return '';                                                              // no cells after the last tracked day
        if (ym === last.slice(0, 7) && +last.slice(8) < minDays && ym !== first.slice(0, 7)) return '';   // partial last month
        if (ym === first.slice(0, 7) && firstDays < minDays && ym !== last.slice(0, 7)) return '';        // partial first month
        return names[+p.M - 1]; } },
      yearLabel: { show: false }
    };
  }
  /**
   * The day of the month in the top-left corner of every month-view cell (a date without hovering): quiet ink on a
   * small surface tab, so it stays readable on a filled or patterned cell; the cell's own figure (stool count) stays
   * in its centre, the "other questionnaire" dot in the other corner.
   */
  function dayNumbers(ctx, from, to) {
    var T = ctx.tok, days = [];
    for (var d = from; d <= to; d++) days.push(d);
    var iso = days.map(M.dayToIso);
    return {
      id: 'day-n', type: 'custom', coordinateSystem: 'calendar', silent: true, z: 5,
      data: iso.map(function (s, i) { return [s, days[i]]; }),
      renderItem: function (params, api) {
        var p = api.coord([iso[params.dataIndex]]);
        if (!p || isNaN(p[0])) return null;
        var n = String(new Date(days[params.dataIndex] * DAY).getUTCDate());
        var x = p[0] - params.coordSys.cellWidth / 2 + 4, y = p[1] - params.coordSys.cellHeight / 2 + 4;
        return { type: 'group', silent: true, children: [
          { type: 'rect', silent: true, shape: { x: x, y: y, width: n.length * 6 + 6, height: 13, r: 3 }, style: { fill: T.surface, opacity: 0.92 } },
          { type: 'text', silent: true, style: { text: n, x: x + 3, y: y + 2, align: 'left', verticalAlign: 'top', fill: T.ink2, font: '500 9px ' + T.font } }
        ] };
      }
    };
  }

  /**
   * Missed days on a calendar (a tracked day without an entry): a hollow cell with a 1 px dashed border in
   * --viz-cal-missed-border (>= 3:1, A27), inset like the filled cells and drawn above them. days = [dayKey].
   */
  function missedSeries(ctx, days, cal) {
    return calendarCells('missed', days, cal, { fill: ctx.tok.surface, stroke: ctx.tok.calMissed, dash: [2, 2], silent: true, z: 3 });
  }
  /**
   * Outlined day cells on a calendar, inset like the heatmap cells (whose white gap would paint over a border):
   * s = {fill, stroke, dash?, silent?, z}. Data per cell: ['YYYY-MM-DD', dayKey] (the tooltip reads the day key).
   */
  function calendarCells(id, days, cal, s) {
    var iso = days.map(M.dayToIso), cs = cal.cellSize, inset = cs[0] < 10 || cs[1] < 10 ? 1 : 2;
    return {
      id: id, type: 'custom', coordinateSystem: 'calendar', silent: !!s.silent, z: s.z,
      data: iso.map(function (d, i) { return [d, days[i]]; }),
      renderItem: function (params, api) {
        var p = api.coord([iso[params.dataIndex]]);
        if (!p || isNaN(p[0])) return null;
        var cw = params.coordSys.cellWidth, ch = params.coordSys.cellHeight;
        return { type: 'rect', silent: !!s.silent,
          shape: { x: p[0] - cw / 2 + inset, y: p[1] - ch / 2 + inset, width: cw - 2 * inset, height: ch - 2 * inset, r: cw >= 20 ? 3 : 1 },
          style: s.dash ? { fill: s.fill, stroke: s.stroke, lineWidth: 1, lineDash: s.dash } : { fill: s.fill, stroke: s.stroke, lineWidth: 1 } };
      }
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
      grid: grid, XB: XB, XV: XV, dayOfX: dayOfX, axisLabel: axisLabel, yValue: yValue, dateLine: dateLine,
      tipRow: tipRow, tipHead: tipHead, tipValue: tipValue, legendHidden: legendHidden, donut: donut, pct: pct,
      CAT_TOK: CAT_TOK, ADH_TOK: ADH_TOK, catLabel: catLabel, larsBands: larsBands, diaryVm: diaryVm,
      calendarBox: calendarBox, calendarBig: calendarBig, calendarHeight: calendarHeight, dayNumbers: dayNumbers, missedSeries: missedSeries, calendarCells: calendarCells, capRight: capRight, cellBorder: cellBorder, axisDay: axisDay, dayMonth: dayMonth
    }
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = O;
  else root.ILARS_CHART_OPTIONS = O;
})(typeof window !== 'undefined' ? window : this);
