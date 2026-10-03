/* charts/card.js — the chart card component (DESIGN-SPEC §3.6). One shell for every chart:
   head (title · hint · view switch · table toggle · ⓘ) → takeaway → fixed-height box → HTML legend → notes,
   plus the table twin (real <table>, also the fallback when ECharts cannot load), resize, crosshair group,
   and the morph rule: same coordinate system = ECharts update animation; different = 160/240 ms cross-fade.
   Namespace ILARS_CHARTS. */
(function (g) {
  'use strict';
  var C = g.ILARS_CHARTS = g.ILARS_CHARTS || {};
  var UI = g.ILARS_UI;
  var all = [];

  /** Shared builder context (CHARTS-METRICS §9: tok, t, tp, lang, reduced, patterns, fmtDay, fmtNum, x). */
  C.ctx = function (x) {
    return { tok: g.ILARS_CHART_THEME.readTokens(), t: UI.t, tp: UI.tp, lang: UI.locale(), reduced: UI.reducedMotion(),
      patterns: C.patterns === true, fmtDay: function (d, s) { return UI.fmtDay(d, s); }, fmtNum: UI.fmtNum, x: x || { mode: 'date', ref: null } };
  };

  function legendHtml(items) {
    if (!items || !items.length) return '';
    return items.map(function (it) {
      var key = '<span class="ui-key' + (it.key ? ' ui-key--' + it.key : '') + '" style="--c:' + it.color + '"></span>';
      if (it.toggle) return '<button type="button" class="ui-legend__item" aria-pressed="true" data-series="' + UI.esc(it.name) + '">' + key + UI.esc(it.label || it.name) + '</button>';
      return '<span class="ui-legend__item">' + key + UI.esc(it.label || it.name) + '</span>';
    }).join('');
  }
  function tableHtml(tb) {
    if (!tb) return '';
    var num = tb.num || [];
    return '<table class="ui-table ui-table--compact"><caption>' + UI.esc(tb.caption) + '</caption><thead><tr>' +
      tb.head.map(function (h, i) { return '<th scope="col"' + (num.indexOf(i) > -1 ? ' class="r"' : '') + '>' + UI.esc(h) + '</th>'; }).join('') + '</tr></thead><tbody>' +
      tb.rows.map(function (r) { return '<tr>' + r.map(function (c, i) { return '<td' + (num.indexOf(i) > -1 ? ' class="r"' : '') + '>' + UI.esc(c == null ? '–' : c) + '</td>'; }).join('') + '</tr>'; }).join('') +
      '</tbody></table>';
  }

  /**
   * o = {id, title, hint, info, span, views:[{v, label, icon, build(width) -> option, coord, group, legend[], table(), takeaway(), summary(), height}],
   *      view, aside(), notes:[html], na:html, empty() -> html|null, reveal:i}
   */
  C.card = function (o) {
    var state = { view: o.view || o.views[0].v, table: false, chart: null, ro: null, last: null };
    var el = document.createElement('article');
    el.className = 'ui-card ui-chart ' + (o.span || 'span-12') + (o.fill && !o.aside && !o.extra ? ' ui-chart--fill' : '') + ' ui-reveal';
    if (o.reveal != null) el.dataset.i = o.reveal;
    el.id = 'card-' + o.id;
    el.setAttribute('aria-labelledby', o.id + '-h');
    function V() { return o.views.filter(function (x) { return x.v === state.view; })[0] || o.views[0]; }
    var multi = o.views.length > 1;
    el.innerHTML =
      '<div class="ui-card__head"><div><h2 class="ui-card__title" id="' + o.id + '-h">' + UI.esc(o.title) + '</h2>' +
        (o.hint ? '<p class="ui-card__hint">' + UI.esc(o.hint) + '</p>' : '') + '</div>' +
      '<div class="ui-card__tools">' +
        (multi ? UI.segHtml(o.id + '-view', o.views.map(function (x) { return { v: x.v, label: x.label, icon: x.icon }; }), state.view, { label: UI.t('doctor.cm.common.chart') }) : '') +
        '<button class="ui-icon-btn" type="button" data-act="table" aria-pressed="false" aria-label="' + UI.esc(UI.t('doctor.cm.common.show_table')) + '" title="' + UI.esc(UI.t('doctor.cm.common.show_table')) + '">' + UI.icon('table', 'i--sm') + '</button>' +
        (o.info ? '<button class="ui-icon-btn" type="button" data-act="info" aria-expanded="false" aria-label="' + UI.esc(UI.t('doctor.cm.common.about')) + '">' + UI.icon('info', 'i--sm') + '</button>' : '') +
      '</div></div>' +
      '<div class="ui-chart__takeaway" data-part="take"></div>' +
      '<div class="ui-chart__empty" data-part="empty" hidden></div>' +
      (o.aside ? '<div class="ui-chart__split"><div>' : '') +
      (o.extra && o.extra.side ? '<div class="ui-chart__duo"><div>' + (o.mainSub ? '<div class="ui-chart__sub">' + o.mainSub + '</div>' : '') : '') +
      '<div class="ui-chart__box"><div class="ui-chart__canvas" role="img"></div></div>' +
      (o.extra && o.extra.side ? '</div>' : '') +
      (o.extra ? '<div data-part="extra"><div class="ui-chart__sub" data-part="extra-sub"></div><div class="ui-chart__box"><div class="ui-chart__canvas" role="img" data-part="extra-canvas"></div></div></div>' : '') +
      (o.extra && o.extra.side ? '</div>' : '') +
      '<div class="ui-chart__table" data-part="table" tabindex="0"></div>' +
      (o.aside ? '</div><aside data-part="aside"></aside></div>' : '') +
      '<div data-part="na"></div>' +
      '<div class="ui-chart__foot"><div class="ui-legend" data-part="legend"></div><div data-part="notes"></div></div>';
    var canvas = el.querySelector('.ui-chart__canvas');
    var exCanvas = el.querySelector('[data-part="extra-canvas"]'), exChart = null;
    function drawExtra() {
      if (!o.extra || !g.echarts) return;
      var on = o.extra.when(state.view);
      el.querySelector('[data-part="extra"]').hidden = !on;
      if (!on) return;
      el.querySelector('[data-part="extra-sub"]').innerHTML = (typeof o.extra.sub === 'function' ? o.extra.sub() : o.extra.sub) || '';
      exCanvas.style.setProperty('--chart-h', (o.extra.height || 160) + 'px');
      exCanvas.setAttribute('aria-label', o.extra.summary ? o.extra.summary() : '');
      if (!exChart) {
        exChart = g.echarts.init(exCanvas, null, { renderer: 'svg' }); all.push(exChart);
        new ResizeObserver(function () { requestAnimationFrame(function () { if (exChart && !exChart.isDisposed()) { exChart.resize(); if (o.extra.widthDependent) exChart.setOption(o.extra.build(exCanvas.clientWidth || 600), { notMerge: true }); } }); }).observe(exCanvas);
      }
      exChart.setOption(o.extra.build(exCanvas.clientWidth || 600), { notMerge: true });
      exChart.group = o.extra.group || '';
    }

    function paintText() {
      var v = V();
      el.querySelector('[data-part="take"]').innerHTML = v.takeaway ? v.takeaway() : '';
      el.querySelector('[data-part="legend"]').innerHTML = legendHtml(typeof v.legend === 'function' ? v.legend() : v.legend);
      el.querySelector('[data-part="notes"]').innerHTML = (o.notes || []).concat(typeof v.notes === 'function' ? v.notes() : (v.notes || [])).map(function (n) { return '<p class="ui-chart__note">' + UI.icon('info') + '<span>' + n + '</span></p>'; }).join('');
      if (o.aside) el.querySelector('[data-part="aside"]').innerHTML = o.aside();
      el.querySelector('[data-part="na"]').innerHTML = o.na ? '<p class="ui-na">' + UI.icon('clock') + '<span><b>' + UI.esc(UI.t('doctor.ui.common.not_available')) + '.</b> ' + UI.esc(o.na) + '</span></p>' : '';
      var summary = v.summary ? v.summary() : '';
      canvas.setAttribute('aria-label', summary || o.title);
      canvas.style.setProperty('--chart-h', (v.height || o.height || 260) + 'px');
      var tb = el.querySelector('[data-part="table"]');
      tb.innerHTML = tableHtml(v.table ? v.table() : null);
      tb.setAttribute('aria-label', (v.table && v.table().caption) || o.title);
    }

    function draw(animate) {
      var v = V();
      if (!g.echarts) return;
      if (!state.chart) {
        state.chart = g.echarts.init(canvas, null, { renderer: 'svg' });
        all.push(state.chart);
        state.ro = new ResizeObserver(function () {
          cancelAnimationFrame(state.raf);
          state.raf = requestAnimationFrame(function () {
            if (!state.chart || state.chart.isDisposed()) return;
            state.chart.resize();
            if (V().widthDependent) { clearTimeout(state.rt); state.rt = setTimeout(function () { draw(false); }, 150); }
          });
        });
        state.ro.observe(canvas);
      }
      var opt = v.build(canvas.clientWidth || 600);
      var coord = v.coord || 'cartesian';
      var swap = animate && state.last && state.last !== coord && !UI.reducedMotion();
      function apply() {
        if (state.last && state.last !== coord) state.chart.clear();        // no clone-morph into/out of donuts
        state.chart.setOption(opt, { notMerge: true });
        state.chart.group = v.group || '';
        if (v.group && g.echarts.connect) g.echarts.connect(v.group);
        state.last = coord;
      }
      if (swap) {
        canvas.classList.add('is-switching');
        setTimeout(function () {
          apply(); canvas.classList.remove('is-switching'); canvas.classList.add('is-entering');
          setTimeout(function () { canvas.classList.remove('is-entering'); }, 260);
        }, 160);
      } else apply();
      drawExtra();
      // legend buttons toggle series (the last visible series cannot be hidden)
      Array.prototype.forEach.call(el.querySelectorAll('button.ui-legend__item'), function (b) {
        b.onclick = function () {
          var on = el.querySelectorAll('button.ui-legend__item[aria-pressed="true"]').length;
          var pressed = b.getAttribute('aria-pressed') === 'true';
          if (pressed && on <= 1) { UI.toast(UI.t('doctor.cm.common.legend_hide_last')); return; }
          b.setAttribute('aria-pressed', String(!pressed));
          state.chart.dispatchAction({ type: 'legendToggleSelect', name: b.dataset.series });
        };
      });
    }

    /** Empty = the element has nothing to show (in this range): one calm line, no axes, no tools but ⓘ. Reversible. */
    function applyEmpty() {
      var msg = o.empty && o.empty();
      el.classList.toggle('is-empty', !!msg);
      var box = el.querySelector('[data-part="empty"]');
      box.hidden = !msg;
      if (msg) box.innerHTML = '<div class="ui-empty"><div class="ui-empty__icon">' + UI.icon('clock') + '</div><div>' + msg + '</div></div>';
      return !!msg;
    }
    var api = {
      el: el, id: o.id,
      render: function () { if (!applyEmpty()) { paintText(); if (g.echarts) draw(false); } return api; },
      setView: function (v) { state.view = v; if (!applyEmpty()) { paintText(); draw(true); } },
      refresh: function () { if (!applyEmpty()) { paintText(); draw(false); } },
      failed: function () {
        if (o.extra) el.querySelector('[data-part="extra"]').hidden = true;
        el.querySelector('.ui-chart__box').innerHTML = '<div class="ui-alert ui-alert--info ui-chart__failed">' + UI.icon('info') + '<div>' + UI.esc(UI.t('doctor.cm.common.charts_failed')) + '</div></div>';
        state.table = true; el.classList.add('is-table');
      },
      chart: function () { return state.chart; },
      dispose: function () { if (state.ro) state.ro.disconnect(); if (state.chart && !state.chart.isDisposed()) state.chart.dispose(); state.chart = null; if (exChart && !exChart.isDisposed()) exChart.dispose(); exChart = null; }
    };
    if (multi) UI.seg(el.querySelector('#' + o.id + '-view'), function (v) { api.setView(v); });
    el.querySelector('[data-act="table"]').addEventListener('click', function (e) {
      state.table = !state.table; el.classList.toggle('is-table', state.table);
      e.currentTarget.setAttribute('aria-pressed', String(state.table));
      e.currentTarget.setAttribute('aria-label', UI.t(state.table ? 'doctor.cm.common.show_chart' : 'doctor.cm.common.show_table'));
      if (!state.table && state.chart) state.chart.resize();
    });
    var ib = el.querySelector('[data-act="info"]');
    if (ib) ib.addEventListener('click', function (e) { e.stopPropagation(); UI.infoPopover(ib, o.info); });
    return api;
  };
  /** Disposes every chart, or only the charts inside `root` (app.js: the patient view when leaving a patient). */
  C.disposeAll = function (root) {
    all = all.filter(function (c) {
      if (c.isDisposed()) return false;
      if (root && !root.contains(c.getDom())) return true;
      c.dispose(); return false;
    });
    if (g.echarts) g.echarts.disconnect('pd-time');
  };
})(window);
