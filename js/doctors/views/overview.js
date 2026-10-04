/* views/overview.js — iLARS "Overview" tab (DESIGN-SPEC §4.3, CHARTS-METRICS §5 with Appendix A17/A20/A21/A32).
   Golden reference: design/golden/js/doctors/views/patients.js (renderOverview).
   Data: the same cached list as the Patients tab (PatientListView.data(): /getPatients?status=all + names + profile);
   the trajectory card makes its own request ILARS_DATA.store.patients({include: 'lars_history'}) — only when the
   base list already carries API v2 keys, once per session; when it fails (or has no lars_history) the card is removed
   for the session and Registrations takes the full last row.
   Contract (tabs.js): window.OverviewView = new OverviewView(api); .load() on every #overview route render;
   .load(true) re-reads the list (after create patient).
   Scope: the list's "My patients · All visible" control and storage (localStorage.ilars_scope).
   Charts: ILARS_CHARTS.card + the ILARS_CHART_OPTIONS cohort builders (charts/cohort.js), no overrides. */
/* global ILARS_UI, ILARS_DATA, ILARS_METRICS, ILARS_VIEW_MODELS, ILARS_CHART_OPTIONS, ILARS_CHARTS, PatientListView, larsChip, attnChips */
class OverviewView {
  constructor(api) {
    this.api = api;
    this.cards = [];
    this.trajFailed = false;   // the lars_history request failed once: no trajectory card for this session
    this.d = null;             // the data on screen (a language change re-renders from it, without a request)
    this.left = false;         // the user left #overview since it was rendered
    var self = this;
    window.addEventListener('hashchange', function () { if (location.hash !== '#overview') self.left = true; });
  }

  load(force) {
    var self = this, U = ILARS_UI;
    var err = document.getElementById('patient-list-error'), root = document.getElementById('ov-root');
    // A language change re-renders the route (app.js rerender -> load): the overview on screen re-renders in place in
    // the new language, keeping card views, open tables and the scroll position (as the patient page does).
    if (!force && this.d && !this.left && this.renderedLang && this.renderedLang !== U.locale()) {
      this.render(this.d, { quiet: true });
      return Promise.resolve();
    }
    this.left = false;
    if (force) ILARS_DATA.store.invalidate('patients');
    err.hidden = true;
    PatientListView.head('overview');
    return U.withSkeleton(function () { self.skeleton(); }, function () { return PatientListView.data(); }, function (d) {
      root.removeAttribute('aria-busy');
      self.render(d);
    }).catch(function (e) {
      root.removeAttribute('aria-busy');
      console.error('[overview] failed:', e);
      self.d = null;
      self.dispose();
      root.innerHTML = '';
      PatientListView.showError(e, function () { self.load(true); });
    });
  }
  dispose() { this.cards.forEach(function (c) { c.dispose(); }); this.cards = []; }

  /** KPI tiles (4) + the attention card, content-shaped; widths are --w hand-offs. */
  skeleton() {
    var U = ILARS_UI, root = document.getElementById('ov-root');
    this.dispose();
    root.setAttribute('aria-busy', 'true');
    root.innerHTML = '<p class="sr-only" role="status">' + U.esc(U.t('doctor.ui.common.loading')) + '</p>' +
      '<div class="ov-skel" aria-hidden="true"><span class="ui-skel ui-skel--pill ov-skel__seg"></span><div class="ui-kpi-row ov-kpis" style="--cols:4">' + [55, 62, 48, 58].map(function (w) {
        return '<div class="ui-kpi"><span class="ui-skel ui-skel--text" style="--w:' + w + '%"></span><span class="ui-skel ui-skel--num ov-skel__num"></span><span class="ui-skel ui-skel--text ov-skel__meta"></span></div>';
      }).join('') + '</div>' +
      '<div class="ui-card ov-skel__card"><span class="ui-skel ui-skel--text" style="--w:18%"></span>' + [0, 1, 2].map(function () {
        return '<div class="ov-skel__row"><span class="ui-skel ui-skel--text" style="--w:22%"></span><span class="ui-skel ui-skel--text" style="--w:16%"></span><span class="ui-skel ui-skel--text" style="--w:12%"></span></div>';
      }).join('') + '</div></div>';
  }

  /** o = {quiet: true}: a language change re-renders in place: no reveal, no count-up, each card keeps its view and
      open table, and the page keeps its scroll position while the charts fill in. */
  render(d, o) {
    o = o || {};
    var self = this, U = ILARS_UI, M = ILARS_METRICS, VM = ILARS_VIEW_MODELS, O = ILARS_CHART_OPTIONS;
    var root = document.getElementById('ov-root');
    var kept = {}, scrollY0 = window.scrollY;
    if (o.quiet) this.cards.forEach(function (c) {
      var b = c.el.querySelector('.ui-card__tools .ui-seg > button[aria-pressed="true"]');
      kept[c.id] = { view: b && b.dataset.v, table: c.el.classList.contains('is-table') };
    });
    var keepScroll = function () { if (o.quiet) window.scrollTo(0, scrollY0); };
    // ILARS_CHARTS.card with the view and the open table the card had before a quiet re-render
    var chartCard = function (spec) {
      var k = kept[spec.id];
      if (k && k.view && spec.views.some(function (v) { return v.v === k.view; })) spec.view = k.view;
      var c = ILARS_CHARTS.card(spec);
      if (k && k.table) c.el.querySelector('[data-act="table"]').click();
      return c;
    };
    this.d = d;
    this.renderedLang = U.locale();
    var scope = PatientListView.scopeFor(PatientListView.readScope(), d.list.rows, d.me);
    var mod = VM.cohortModel(d.list.rows, { today: d.today, meDoctorCode: d.me.doctor_code, scope: scope });
    var stats = mod.stats, caps = (d.list.rows[0] && M.listRowCaps(d.list.rows[0])) || {};
    var names = d.names;
    document.getElementById('study-title').textContent = U.t('doctor.ui.overview.title');
    // a no-break space before the dot: a wrapped line never starts with '·' (VIS-25)
    document.getElementById('study-sub').textContent = U.t('doctor.ui.overview.sub', { hospital: d.me.hospital_name || '', date: U.fmtDay(d.today, 'weekday') }).replace(/ · /g, '\u00a0· ');
    document.getElementById('tab-count-patients').textContent = mod.scoped.length;
    this.dispose();

    // scope: the same control and storage as the list (A20); no "as of" chip (the date is in the page sub line)
    var toolbar = '<div class="ov-toolbar">' + U.segHtml('ov-scope', [{ v: 'mine', label: U.t('doctor.cm.scope.mine') }, { v: 'all', label: U.t('doctor.cm.scope.all') }], scope, { cls: '', label: U.t('doctor.cm.scope.label') }) + '</div>';
    var bindScope = function () {
      U.seg(document.getElementById('ov-scope'), function (v) {
        PatientListView.writeScope(v);
        if (window.PatientListView && window.PatientListView.st) window.PatientListView.st.scope = v;
        U.transition(function () { self.render(d); }, 'list');
      });
    };
    var first = !root.dataset.shown;
    root.dataset.shown = '1';

    // nobody in scope: one empty card with Create patient, no KPI row, no chart cards
    if (!mod.scoped.length) {
      root.innerHTML = toolbar + '<div class="ui-card ov-empty"><div class="ui-empty"><div class="ui-empty__icon">' + U.icon('users') + '</div>' +
        '<div class="ui-empty__title">' + U.esc(U.t('doctor.cm.list.empty_none')) + '</div>' +
        // secondary: the page head already has the one primary (gradient) action of the view
        '<button class="ui-btn ui-btn--secondary" type="button" data-act="create">' + U.icon('plus') + '<span>' + U.esc(U.t('doctor.create_patient')) + '</span></button></div></div>';
      root.querySelector('[data-act="create"]').addEventListener('click', function () { document.getElementById('btn-create-patient').click(); });
      bindScope();
      return;
    }

    var active = mod.scoped.filter(function (s) { return s.status === 'active'; });
    var attn = mod.attention;
    var reasons = VM.topReasons(stats.reasonCounts || ovReasonCounts(attn), 2);
    var adh = active.filter(function (s) { return s.adherence.ratio != null; }).map(function (s) { return s.adherence.ratio; });
    var adhApprox = active.some(function (s) { return s.adherence.approx; });
    var scored = active.filter(function (s) { return s.lars.latest != null; });
    var major = scored.filter(function (s) { return s.lars.category === 'major'; }).length;
    var mAdh = M.median(adh), pp = mAdh == null ? null : M.percentParts(mAdh);
    var new30 = mod.scoped.filter(function (s) { return s.startDay != null && s.startDay >= d.today - 29; }).length;
    var v2 = !!caps.adherence;
    var approx = adhApprox ? '≈ ' : '';
    var noActive = ovText('doctor.cm.ov.empty_no_active', 'No active patients in this group.');

    // KPI row: tiles without data are not rendered (the row's --cols follows); "Needs attention" is hidden when
    // nobody is active (A21: "All on track" with nobody to track would be false reassurance)
    var tiles = [];
    if (active.length) tiles.push('<article class="ui-kpi ui-kpi--hero"><div class="ui-kpi__label">' + U.icon('alert') + U.esc(U.t('doctor.cm.kpi.attention')) + '</div>' +
      '<div class="ui-kpi__value"><span data-count="' + attn.length + '">' + attn.length + '</span><span class="ui-kpi__unit">' + U.esc(U.tp('doctor.cm.common.n_patients', attn.length, { n: '' }).trim()) + '</span></div>' +
      '<div class="ui-kpi__meta">' + (attn.length ? U.esc(reasons.map(function (x) { return U.tp('doctor.cm.kpi.reason_' + x.code, x.n); }).join(' · '))
        : '<span class="ui-delta ui-delta--better">' + U.esc(U.t('doctor.cm.kpi.attention_none')) + '</span>') + '</div></article>');
    tiles.push('<article class="ui-kpi"><div class="ui-kpi__label">' + U.icon('users') + U.esc(U.t('doctor.cm.kpi.active')) + '</div>' +
      '<div class="ui-kpi__value"><span data-count="' + stats.status.active + '">' + stats.status.active + '</span></div>' +
      '<div class="ui-kpi__meta">' + U.esc(U.t('doctor.cm.kpi.active_meta', { total: mod.scoped.length, new30: new30 })) + '</div></article>');
    if (pp) tiles.push('<article class="ui-kpi"><div class="ui-kpi__label">' + U.icon('calendar') + U.esc(U.t(adhApprox ? 'doctor.cm.kpi.adherence_since' : 'doctor.cm.kpi.adherence_median')) + '</div>' +
      '<div class="ui-kpi__value"><span data-count="' + pp.value + '" data-prefix="' + U.esc(approx + pp.prefix) + '" data-suffix="%">' + U.esc(approx + pp.prefix) + pp.value + '%</span></div>' +
      '<div class="ui-kpi__meta"><span class="ui-meter ov-kpi-meter ui-meter--' + M.adherenceLevel(mAdh) + '" style="--v:' + pp.value + '%"></span>' + U.esc(U.tp('doctor.cm.kpi.adherence_median_meta', adh.length)) + '</div></article>');
    if (scored.length) {
      var share = M.percentParts(major / scored.length);   // "<1%" / ">99%", never 0 % with a patient in the category
      tiles.push('<article class="ui-kpi"><div class="ui-kpi__label">' + U.icon('line') + U.esc(U.t('doctor.cm.kpi.major_share')) + '</div>' +
        '<div class="ui-kpi__value"><span data-count="' + share.value + '" data-prefix="' + U.esc(share.prefix) + '" data-suffix="%">' + U.esc(share.prefix) + share.value + '%</span></div>' +
        '<div class="ui-kpi__meta">' + U.esc(U.t('doctor.cm.kpi.major_share_meta', { k: major, n: scored.length })) + '</div></article>');
    }
    root.innerHTML = toolbar +
      '<section class="ui-kpi-row ov-kpis" style="--cols:' + tiles.length + '" aria-label="' + U.esc(U.t('doctor.ui.a11y.key_figures')) + '">' +
        tiles.map(function (t, i) { return first ? t.replace('<article class="ui-kpi', '<article data-i="' + (i + 1) + '" class="ui-reveal ui-kpi') : t; }).join('') + '</section>' +
      '<section class="app-grid app-section ov-grid" id="ov-grid" aria-label="' + U.esc(U.t('doctor.ui.a11y.cohort')) + '"></section>';
    var grid = document.getElementById('ov-grid');
    bindScope();
    var reveal = first ? 5 : null;
    var nextReveal = function () { return reveal == null ? null : reveal++; };

    // C1 Needs attention (first 8 rows, row links as in the list)
    var att = document.createElement('article');
    att.className = 'ui-card span-12 ov-attn' + (first ? ' ui-reveal' : '');
    if (first) att.dataset.i = nextReveal();
    att.setAttribute('aria-labelledby', 'ov-attn-h');
    var rulesUsed = caps.lastActivity ? ['lars_worse', 'vas_drop', 'no_entry', 'not_started', 'eq_overdue'] : ['no_lars', 'not_started', 'eq_overdue'];
    var lastHead = U.t(caps.lastActivity ? 'doctor.cm.list.th_last' : 'doctor.cm.attn.th_last_lars');
    att.innerHTML = '<div class="ui-card__head"><div><h2 class="ui-card__title" id="ov-attn-h">' + U.esc(U.t('doctor.cm.attn.title')) + (attn.length ? ' <span class="ui-count">' + attn.length + '</span>' : '') + '</h2>' +
        '<p class="ui-card__hint">' + U.esc(U.t('doctor.cm.attn.hint')) + '</p></div>' +
        (attn.length ? '<a class="ui-btn ui-btn--plain ui-btn--sm" href="#patients" data-attn-all>' + U.esc(U.tp('doctor.cm.attn.show_all', attn.length)) + U.icon('chev-right') + '</a>' : '') + '</div>' +
      (attn.length ? '<div class="ov-attn-scroll"><table class="ui-table ov-attn-table"><caption class="sr-only">' + U.esc(U.t('doctor.cm.attn.title')) + '</caption><thead><tr>' +
          '<th scope="col">' + U.esc(U.t('doctor.cm.list.th_patient')) + '</th><th scope="col">' + U.esc(U.t('doctor.cm.list.th_attention')) + '</th>' +
          '<th scope="col">' + U.esc(lastHead) + '</th><th scope="col">' + U.esc(U.t('doctor.cm.list.th_lars')) + '</th></tr></thead><tbody>' +
          attn.slice(0, 8).map(function (s) {
            var nm = names[s.code];
            var lastDay = caps.lastActivity ? s.lastActivityDay : s.lars.latestDay;
            return '<tr class="has-link"><td data-col="patient"><a class="ui-row-link pl-who" href="#patient/' + encodeURIComponent(s.code) + '" aria-label="' + U.esc(U.t('doctor.ui.patients.open', { name: nm || s.code })) + '"><span class="pl-who__text">' +
                '<span class="pl-who__name' + (nm ? '' : ' code') + '">' + (nm ? U.esc(nm) : U.fmtCode(s.code)) + '</span>' + (nm ? '<span class="pl-who__code">' + U.fmtCode(s.code) + '</span>' : '') + '</span></a></td>' +
              '<td data-col="attention">' + attnChips(s.attention) + '</td>' +
              '<td data-col="last" class="t-secondary" data-label="' + U.esc(lastHead) + '">' + U.esc(lastDay == null ? '—' : U.fmtRelative(lastDay, d.today)) + '</td>' +
              '<td data-col="lars">' + (s.lars.latest == null ? '<span class="pl-muted">—</span>' : '<div class="pl-lars"><span class="pl-lars__n">' + s.lars.latest + '</span>' + larsChip(s.lars.category) + '</div>') + '</td></tr>';
          }).join('') + '</tbody></table></div>'
        : '<div class="ui-empty ov-attn-empty"><div class="ui-empty__title">' + U.esc(active.length ? U.t('doctor.cm.attn.empty') : noActive) + '</div></div>') +
      '<p class="ov-rules">' + U.icon('info') + '<span>' + U.esc(U.t('doctor.cm.attn.rules_used', { list: rulesUsed.map(function (k) { return U.t('doctor.cm.attn.rule_' + k); }).join(' · ') })) + '</span></p>';
    grid.appendChild(att);
    if (att.querySelector('tbody')) U.rowLinks(att.querySelector('tbody'));
    var all = att.querySelector('[data-attn-all]');
    if (all) all.addEventListener('click', function () { PatientListView.showAttentionOnly(); });

    var ctx = function () { return ILARS_CHARTS.ctx(); };
    var cats = stats.larsCategories, scoredN = cats.none + cats.minor + cats.major;
    var sum = { none: cats.none, minor: cats.minor, major: cats.major, nodata: cats.nodata, n: scoredN + cats.nodata };
    var larsSum = U.t('doctor.cm.ov.summary_lars', sum);
    var pct = function (k) { return k === 'nodata' || !scoredN ? '' : O._.pct(cats[k] / scoredN); };

    // C2 LARS category now: Share donut ↔ Scores histogram (different coordinate systems → cross-fade, no morph).
    // Every percentage on this card uses the patients WITH a score as the base (A17), like the KPI.
    var catTable = function () {
      return { caption: U.t('doctor.cm.ov.lars_title'), head: [U.t('doctor.cm.lars.th_category'), U.t('doctor.cm.list.th_patient'), '%'], num: [1, 2],
        rows: ['none', 'minor', 'major', 'nodata'].map(function (k) { return [U.t('doctor.cm.lars.cat_' + k), cats[k], pct(k) || '–']; }) };
    };
    var c2 = chartCard({ id: 'ov-lars', span: 'span-4 lg-full', reveal: nextReveal(), title: U.t('doctor.cm.ov.lars_title'), hint: U.t('doctor.cm.ov.lars_hint'), info: U.t('doctor.cm.lars.info'),
      empty: function () { return active.length ? null : U.esc(noActive); },
      views: [
        { v: 'share', label: U.t('doctor.cm.ov.view_donut'), icon: 'donut', coord: 'pie', height: 200,
          build: function () { return O.cohortLarsDonut(stats, ctx(), larsSum); }, summary: function () { return larsSum; }, table: catTable },
        { v: 'scores', label: U.t('doctor.cm.ov.view_hist'), icon: 'bars', coord: 'cartesian', height: 200,
          build: function () { return O.cohortLarsHistogram(stats, ctx(), larsSum); }, summary: function () { return larsSum; }, table: catTable,
          notes: cats.nodata ? [U.esc(U.tp('doctor.cm.ov.without_score', cats.nodata))] : [] }
      ] });
    if (!first) c2.el.classList.remove('ui-reveal');
    grid.appendChild(c2.el);
    // the HTML list beside the chart: chip · count · % of scored; donut and list share a row when the card is wide
    var legend = document.createElement('ul');
    legend.className = 'ov-legend-list';
    legend.setAttribute('aria-hidden', 'true');                 // the table view carries the same numbers
    legend.innerHTML = ['none', 'minor', 'major', 'nodata'].map(function (k) {
      return '<li><span>' + larsChip(k === 'nodata' ? null : k) + '</span><span class="n">' + cats[k] + '</span><span class="p">' + pct(k) + '</span></li>';
    }).join('');
    var split = document.createElement('div'); split.className = 'ov-lars-split';
    var box = c2.el.querySelector('.ui-chart__box'); box.before(split); split.append(box, legend);
    this.cards.push(c2);

    // C4 LARS since registration (needs lars_history: v2 only; one request per session; removed on failure)
    var trajSlot = null;
    if (v2 && !this.trajFailed) {
      trajSlot = document.createElement('article');
      trajSlot.className = 'ui-card span-8 ov-traj-slot';
      trajSlot.setAttribute('aria-busy', 'true');
      trajSlot.innerHTML = '<div class="ui-card__head"><div><h2 class="ui-card__title"></h2><p class="ui-card__hint"></p></div></div>' +
        '<div class="ui-skel-chart ov-traj-skel" aria-hidden="true"></div><p class="sr-only" role="status"></p>';
      trajSlot.querySelector('h2').textContent = U.t('doctor.cm.ov.traj_title');
      trajSlot.querySelector('.ui-card__hint').textContent = U.t('doctor.cm.ov.traj_hint_blocks');
      trajSlot.querySelector('[role="status"]').textContent = U.t('doctor.ui.common.loading');
      grid.appendChild(trajSlot);
    }
    var trajReveal = nextReveal();
    var buildTraj = function (hist) {
      var byCode = {};
      hist.rows.forEach(function (r) { byCode[r.patient_code] = r; });
      var traj = ILARS_DATA.cohortTrajectory(mod.scoped.map(function (s) { return byCode[s.code]; }), M);
      var trajSum = traj.blocks.length ? U.tp('doctor.cm.ov.summary_traj', traj.blocks[0].n) : U.t('doctor.cm.ov.traj_too_few_blocks');
      var blockName = function (b) { return b.week + '–' + (b.week + 3); };
      var c4 = chartCard({ id: 'ov-traj', span: 'span-8', fill: true, reveal: trajReveal, title: U.t('doctor.cm.ov.traj_title'), hint: U.t('doctor.cm.ov.traj_hint_blocks'), info: U.t('doctor.cm.lars.info'),
        empty: function () { return traj.blocks.length ? null : U.esc(U.t('doctor.cm.ov.traj_too_few_blocks')); },
        notes: [U.esc(U.t('doctor.cm.ov.traj_note'))],
        views: [
          { v: 'trend', label: U.t('doctor.cm.ov.view_traj'), icon: 'line', height: 300, widthDependent: true,
            build: function (w) { return O.cohortTrajectory(traj, ctx(), trajSum, w); }, summary: function () { return trajSum; },
            legend: [{ name: U.t('doctor.cm.ov.traj_median'), key: 'line', color: 'var(--viz-metric-lars)' }, { name: U.t('doctor.cm.ov.traj_iqr'), color: 'var(--viz-band-neutral)' }],
            // paired change (no survivorship headline): neutral ink, only when k >= 5
            takeaway: function () {
              var p = traj.paired; if (!p) return '';
              var dl = (p.delta > 0 ? '+' : p.delta < 0 ? '−' : '') + U.fmtNum(Math.abs(p.delta), p.delta % 1 ? 1 : 0);
              return '<span class="ui-chart__text">' + U.esc(U.tp('doctor.cm.ov.traj_paired', p.k, { k: p.k, delta: dl })) + '</span>';
            },
            table: function () { return { caption: U.t('doctor.cm.ov.traj_title'), head: [U.t('doctor.cm.ov.traj_axis'), U.t('doctor.cm.ov.traj_n'), U.t('doctor.cm.ov.traj_median'), U.t('doctor.cm.ov.traj_iqr')], num: [1, 2, 3],
              rows: traj.blocks.map(function (b) { return [blockName(b), b.n, U.fmtNum(b.median, b.median % 1 ? 1 : 0), U.fmtNum(b.q1, 1) + '–' + U.fmtNum(b.q3, 1)]; }) }; } },
          { v: 'cats', label: U.t('doctor.cm.ov.view_traj_share'), icon: 'bars', height: 300, widthDependent: true,
            build: function (w) { return O.cohortCategoryShare(traj, ctx(), trajSum, w); }, summary: function () { return trajSum; },
            legend: ['none', 'minor', 'major'].map(function (k) { return { name: U.t('doctor.cm.lars.cat_' + k), color: 'var(--color-lars-' + k + ')' }; }),
            table: function () { return { caption: U.t('doctor.cm.ov.traj_title'), head: [U.t('doctor.cm.ov.traj_axis'), U.t('doctor.cm.ov.traj_n'), U.t('doctor.cm.lars.cat_none'), U.t('doctor.cm.lars.cat_minor'), U.t('doctor.cm.lars.cat_major')], num: [1, 2, 3, 4],
              rows: traj.blocks.map(function (b) { return [blockName(b), b.n, b.none, b.minor, b.major]; }) }; } }
        ] });
      if (!first) c4.el.classList.remove('ui-reveal');
      trajSlot.replaceWith(c4.el);
      self.cards.push(c4);
      ILARS_CHARTS.load().then(function () { c4.render(); keepScroll(); }, function () { c4.render(); c4.failed(); keepScroll(); });
    };

    // C3 Adherence: Distribution ↔ By patient (≤ 60)
    var byP = active.filter(function (s) { return s.adherence.ratio != null; }).sort(function (a, b) { return a.adherence.ratio - b.adherence.ratio; }).slice(0, 60)
      .map(function (s) { return { label: names[s.code] || s.code, code: s.code, ratio: s.adherence.ratio, done: s.adherence.done, expected: s.adherence.expected }; });
    var adhSum = pp ? U.tp('doctor.cm.ov.summary_adh', adh.length, { median: approx + pp.prefix + pp.value + '%' }) : '';
    var adhTable = function (rows) {
      return { caption: U.t('doctor.cm.ov.adh_title'), head: [U.t('doctor.cm.list.th_patient'), U.t('doctor.cm.list.th_adherence'), U.t('doctor.cm.q.th_days')], num: [1, 2],
        rows: rows.map(function (r) { var q = M.percentParts(r.ratio); return [r.label, approx + q.prefix + q.value + '%', U.tp('doctor.ui.patient.q_days', r.expected, { done: r.done, expected: r.expected })]; }) };
    };
    var c3 = chartCard({ id: 'ov-adh', span: 'span-4', fill: true, reveal: nextReveal(), title: U.t('doctor.cm.ov.adh_title'), hint: U.t(adhApprox ? 'doctor.cm.ov.adh_hint_approx' : 'doctor.cm.ov.adh_hint'),
      empty: function () { return adh.length ? null : U.esc(active.length ? U.t('doctor.cm.common.too_early_hint') : noActive); },
      views: [
        { v: 'dist', label: U.t('doctor.cm.ov.view_hist_adh'), icon: 'bars', height: 220,
          build: function () { return O.cohortAdherenceHistogram(stats, ctx(), adhSum); }, summary: function () { return adhSum; },
          legend: [{ name: '≥ 80%', color: 'var(--color-adherence-good)' }, { name: '50–79%', color: 'var(--color-adherence-partial)' }, { name: '< 50%', color: 'var(--color-adherence-poor)' }],   // same '80%' style as the values (I18N-R2-04)
          table: function () { return adhTable(byP.slice().reverse()); } },
        { v: 'pt', label: U.t('doctor.cm.ov.view_by_patient'), icon: 'list', height: Math.max(220, byP.length * 18 + 30),
          build: function () { return O.cohortAdherenceByPatient(byP, ctx(), adhSum); }, summary: function () { return adhSum; },
          table: function () { return adhTable(byP); } }
      ] });
    if (!first) c3.el.classList.remove('ui-reveal');
    grid.appendChild(c3.el); this.cards.push(c3);
    var bindBars = function () {
      var ch = c3.chart(); if (!ch || ch.__ovBound) return;
      ch.__ovBound = true;
      ch.on('click', function (p) {
        var y = (ch.getOption().yAxis || [])[0];
        if (!y || y.type !== 'category') return;                      // only the "By patient" view has patient rows
        var r = byP[p.dataIndex]; if (r) window.location.hash = '#patient/' + encodeURIComponent(r.code);
      });
    };

    // C5 Registrations (all statuses): Total ↔ Per month
    var efrom = Math.min.apply(null, mod.startDays);
    var enrolSum = U.t('doctor.cm.ov.summary_enrol', { total: mod.scoped.length, new30: new30 });
    var enrolTable = function () {
      var m = {}, tot = 0, mf = new Intl.DateTimeFormat(U.locale(), { month: 'long', year: 'numeric', timeZone: 'UTC' });
      mod.startDays.forEach(function (x) { var k = M.dayToIso(x).slice(0, 7); m[k] = (m[k] || 0) + 1; });
      return { caption: U.t('doctor.cm.ov.enrol_title'), head: [ovText('doctor.cm.ov.th_month', 'Month'), ovText('doctor.cm.ov.th_new', 'New registrations'), ovText('doctor.cm.ov.th_total', 'Total')], num: [1, 2],
        rows: Object.keys(m).sort().map(function (k) { tot += m[k]; return [mf.format(new Date(k + '-15T00:00:00Z')), m[k], tot]; }).reverse() };
    };
    // the same takeaway in both views, so the card head does not jump when the view changes
    var enrolTake = function () { return '<span class="ui-chart__num">' + mod.scoped.length + '</span><span class="ui-chart__text">' + U.esc(U.tp('doctor.cm.kpi.new_30d', new30)) + '</span>'; };
    var c5 = chartCard({ id: 'ov-enrol', span: 'span-4', fill: true, reveal: nextReveal(), title: U.t('doctor.cm.ov.enrol_title'), hint: U.t('doctor.cm.ov.enrol_hint'),
      empty: function () { return mod.startDays.length ? null : '—'; },
      views: [
        { v: 'total', label: U.t('doctor.cm.ov.view_cumulative'), icon: 'line', height: 200, widthDependent: true,
          build: function (w) { return O.enrolmentCumulative({ series: M.enrolmentSeries(mod.startDays), from: efrom, to: d.today }, ctx(), enrolSum, w); }, summary: function () { return enrolSum; },
          takeaway: enrolTake, table: enrolTable },
        { v: 'month', label: U.t('doctor.cm.ov.view_monthly'), icon: 'bars', height: 200,
          build: function () { return O.enrolmentMonthly({ startDays: mod.startDays, from: efrom, to: d.today }, ctx(), enrolSum); }, summary: function () { return enrolSum; },
          takeaway: enrolTake, table: enrolTable }
      ] });
    if (!first) c5.el.classList.remove('ui-reveal');
    grid.appendChild(c5.el); this.cards.push(c5);

    // C6 EQ VAS now: Patients strip with median ↔ Distribution
    var vrows = active.filter(function (s) { return s.vas.latest != null; }).map(function (s) { return { label: names[s.code] || s.code, vas: s.vas.latest, day: s.vas.latestDay }; });
    var vMed = M.median(vrows.map(function (r) { return r.vas; }));
    var vasSum = U.tp('doctor.cm.ov.summary_vas', vrows.length, { median: U.fmtNum(vMed, vMed % 1 ? 1 : 0) });
    var vasTable = function () {
      return { caption: U.t('doctor.cm.ov.vas_title'), head: [U.t('doctor.cm.list.th_patient'), U.t('doctor.cm.list.th_vas'), U.t('doctor.cm.eq.th_date')], num: [1],
        rows: vrows.map(function (r) { return [r.label, r.vas, U.fmtDay(r.day)]; }) };
    };
    var c6 = chartCard({ id: 'ov-vas', span: 'span-4', fill: true, reveal: nextReveal(), title: U.t('doctor.cm.ov.vas_title'), hint: U.t('doctor.cm.ov.vas_hint'),
      empty: function () { return vrows.length ? null : U.esc(active.length ? ovText('doctor.cm.ov.vas_empty', 'No active patient has an EQ VAS yet.') : noActive); },
      views: [
        { v: 'dots', label: U.t('doctor.cm.ov.view_dots'), icon: 'grid', height: 200, build: function () { return O.vasStrip(vrows, ctx(), vasSum); }, summary: function () { return vasSum; }, table: vasTable },
        { v: 'hist', label: U.t('doctor.cm.ov.view_vas_hist'), icon: 'bars', height: 200, build: function () { return O.vasHistogram(vrows, ctx(), vasSum); }, summary: function () { return vasSum; }, table: vasTable }
      ] });
    if (!first) c6.el.classList.remove('ui-reveal');
    grid.appendChild(c6.el); this.cards.push(c6);

    // no trajectory (today's API, or its request failed): Registrations takes the full last row
    var fullRegistrations = function () { c5.el.classList.replace('span-4', 'span-12'); c5.el.classList.add('ov-enrol--full'); grid.appendChild(c5.el); };
    if (!trajSlot) fullRegistrations();
    else ILARS_DATA.store.patients({ include: 'lars_history' }).then(function (hist) {
      if (!hist.larsHistory) throw new Error('lars_history missing');
      if (document.body.contains(trajSlot)) buildTraj(hist);
    }).catch(function (e) {
      console.warn('[overview] trajectory hidden for this session:', e && e.message);
      self.trajFailed = true;
      if (document.body.contains(trajSlot)) { trajSlot.remove(); fullRegistrations(); }
    });

    if (first) U.reveal(root);
    if (!o.quiet) U.countAll(root.querySelector('.ui-kpi-row'));
    var cards = this.cards.slice();
    cards.forEach(function (c) { if (!window.echarts) c.render(); });   // text, legend and table at once
    keepScroll();
    ILARS_CHARTS.load().then(function () { cards.forEach(function (c) { if (self.cards.indexOf(c) > -1) c.render(); }); bindBars(); keepScroll(); },
      function () { cards.forEach(function (c) { if (self.cards.indexOf(c) > -1) { c.render(); c.failed(); } }); keepScroll(); });
  }
}

/** Text for a key that may not be in the dictionaries yet (stage-2 additions, design/i18n-additions/WP2.en.json):
    the translation when one exists, else the English default — never the raw key. */
function ovText(key, en, params) {
  var U = ILARS_UI, I = window.ILARS_I18N, fb = U._fallback;
  var known = (I && typeof I.t === 'function' && I.t(key) !== key) ||
    (fb && typeof key.split('.').reduce(function (a, k) { return a == null ? a : a[k]; }, fb) === 'string');
  if (known) return U.t(key, params);
  return params ? en.replace(/\{(\w+)\}/g, function (m, n) { return params[n] != null ? params[n] : m; }) : en;
}

/** {code: n} over the attention list (fallback when ILARS_METRICS.cohortStats has no reasonCounts). */
function ovReasonCounts(attn) {
  var out = {};
  attn.forEach(function (s) { s.attention.forEach(function (a) { out[a.code] = (out[a.code] || 0) + 1; }); });
  return out;
}
