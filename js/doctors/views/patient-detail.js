/* views/patient-detail.js — the patient dashboard (#patient/<code>), DESIGN-SPEC §4.4 / §4.7, CHARTS-METRICS §7.
   Keeps the global class name PatientDetailView (app.js: new PatientDetailView(api).load(code)) and the LT registry
   link flow of the old view (same API calls, same Lithuanian strings, same contract classes and ids).
   Data: GET /getPatientDetail (adapted by ILARS_DATA.adaptDetail) + GET /getPatientStatusHistory (its own request:
   the page renders without it) + LT GET /getRegistryPatients (the linked row) + the Firestore name doc.
   Models: ILARS_VIEW_MODELS (data/patient-model.js); charts: ILARS_CHART_OPTIONS builders inside ILARS_CHARTS cards.
   Rule: every untrusted string (names, codes, API text, translations) goes into HTML through ILARS_UI.esc(). */
/* global ILARS_UI, ILARS_DATA, ILARS_METRICS, ILARS_VIEW_MODELS, ILARS_CHART_OPTIONS, ILARS_CHARTS, echarts */
class PatientDetailView {
  constructor(api) {
    this.api = api;
    this.cards = [];
    this.code = null;
    this.seq = 0;                // ignores answers of a patient the user already left
    this.d = null;               // the loaded data of the current patient (re-render without a request)
    this.hist = { state: 'loading', rows: [] };
    this.names = {};             // {code: name} seen this session (shell name before the Firestore read)
    this.left = false;           // the user left this patient's route since it was rendered
    this.bindKeys();
    var self = this;
    window.addEventListener('hashchange', function () { if (location.hash !== '#patient/' + encodeURIComponent(self.code)) self.left = true; });
  }

  // ================================================================== load / errors
  load(code) {
    var self = this, U = ILARS_UI;
    // A language change re-renders the route (app.js rerender -> load): the patient on screen re-renders in place
    // in the new language, keeping card views, open tables and the focused control, without a new request.
    if (code === this.code && this.d && !this.left && this.renderedLang && this.renderedLang !== U.locale()) {
      this.render(document.getElementById('patient-detail-view'), this.d, { quiet: true });
      return Promise.resolve();
    }
    var seq = ++this.seq;
    this.code = code; this.d = null; this.left = false; this.dispose();
    var root = document.getElementById('patient-detail-view');
    // The shell renders synchronously: app.js calls load() inside the view-transition callback, and the browser
    // captures the new view right after it (DESIGN-SPEC §5.1). The skeleton body fades in only after 250 ms.
    this.skeleton(root, code, this.knownName(code));
    return U.withSkeleton(function () { if (seq === self.seq) root.classList.add('is-skeleton-visible'); },
      function () { return self.fetch(code, seq); },
      function (d) {
        if (seq !== self.seq) return;
        root.classList.remove('is-skeleton-visible');
        self.d = d;
        self.render(root, d);
      })
      .catch(function (e) {
        if (seq !== self.seq) return;
        root.classList.remove('is-skeleton-visible'); root.removeAttribute('aria-busy');
        self.renderError(root, code, e);
      });
  }

  /** api.js errors carry .status (0 = network or timeout) and .detail (DESIGN-SPEC §3.15, §6.2). */
  renderError(root, code, e) {
    var U = ILARS_UI, self = this;
    var detail = (e && e.detail) || '';
    var forbidden = e && e.status === 403 && !/no hospital/i.test(detail);        // "Doctor has no hospital assigned" = generic
    var missing = e && (e.status === 404 || (e.status === 400 && /code/i.test(detail)));
    root.innerHTML = this.backRow() + '<div class="ui-alert pd-error" role="alert"></div>';
    var box = root.querySelector('.ui-alert');
    U.alert(box, forbidden ? U.t('doctor.ui.patient.forbidden') : missing ? U.t('doctor.ui.patient.not_found', { code: code }) : U.t('doctor.ui.patient.load_error'),
      forbidden || missing ? null : e);
    if (!forbidden && !missing) {
      var retry = document.createElement('div');
      retry.className = 'ui-alert__actions';
      retry.innerHTML = '<button class="ui-btn ui-btn--secondary ui-btn--sm" type="button">' + U.icon('refresh', 'i--sm') + '<span>' + U.esc(U.t('doctor.ui.common.retry')) + '</span></button>';
      retry.firstChild.addEventListener('click', function () { self.load(code); });
      box.appendChild(retry);
    }
  }

  dispose() {
    this.cards.forEach(function (c) { c.dispose(); });
    this.cards = [];
    if (window.echarts) echarts.disconnect('pd-time');
  }

  knownName(code) {
    var pl = window.PatientListView, names = pl && (pl.names || (pl.data && pl.data.names));
    return (names && names[code]) || this.names[code] || '';
  }

  // ================================================================== data
  fetch(code, seq) {
    var self = this, api = this.api;
    return window.ILARS_PROFILE().then(function (me) {
      var lt = !!(me && me.is_lithuania);
      // LT registry row: a failed read hides the link group AND the surgery section (the page cannot know
      // whether the patient is linked, so "Susieti su registru" must not appear — §4.4 states)
      var reg = lt ? self.registryRows().then(function (rows) { return { rows: rows }; },
        function (e) { console.warn('[patient] registry read failed', e); return { failed: true }; }) : null;
      var hist = self.loadHistory(code, seq);                          // its own request; the summary shows its state
      var detailP = api.getPatientDetail(code);
      // a study coordinator viewing another hospital's patient (can_edit = false): the name is never read
      var nameP = me && me.is_coordinator ? detailP.then(function (r) {
        return r && r.can_edit === false ? { name: '', first: '', last: '', canEdit: false } : self.readName(code);
      }) : self.readName(code);
      return Promise.all([detailP, nameP]).then(function (r) {
        if (r[1].name) self.names[code] = r[1].name;
        var d = { me: me && me.profile ? me.profile : (me || {}), lt: lt, detail: ILARS_DATA.adaptDetail(r[0]),
          readOnly: r[0].can_edit === false,                         // another hospital's patient: view only
          linked: null, regFailed: false, regPending: lt, name: r[1].name, first: r[1].first, last: r[1].last, canEditName: r[1].canEdit };
        // a deceased patient: the status history gives the day tracking ended (header, missed days); it was
        // requested in parallel, so it is usually here already — wait for it a little, never for long
        var dead = ILARS_METRICS.normalizeStatus(d.detail.patient_status) === 'dead';
        var waitHist = dead ? Promise.race([hist, new Promise(function (res) { setTimeout(res, PatientDetailView.HIST_GRACE_MS); })]) : Promise.resolve();
        if (!reg) return waitHist.then(function () { return d; });
        // The registry read usually lands with the detail (or comes from the registry list's cache): wait up to
        // REG_GRACE_MS for it, so the chip is right at first paint. A slower read no longer holds the page: the
        // link group shows a skeleton chip and the page re-renders in place when the row arrives (§4.4 states).
        var settled = false;
        reg.then(function (x) {
          settled = true;
          if (seq !== self.seq) return;
          self.applyRegistry(d, code, x);
          if (self.d === d) self.render(document.getElementById('patient-detail-view'), d, { quiet: true });
        });
        return Promise.all([waitHist, Promise.race([reg, new Promise(function (res) { setTimeout(res, PatientDetailView.REG_GRACE_MS); })])])
          .then(function () { return settled ? reg.then(function () { return d; }) : d; });
      });
    });
  }

  /** Puts the LT registry read result into the loaded data (linked row, or failed). */
  applyRegistry(d, code, x) {
    d.regPending = false;
    d.regFailed = !!(x && x.failed);
    d.linked = x && x.rows ? x.rows.filter(function (r) { return r.study_patient_code === code; })[0] || null : null;
  }

  /** Day of a change to "dead" made on this page, else of the latest one in the loaded status history, else null. */
  deathDay(d) {
    var M = ILARS_METRICS, best = null;
    if (d && d.deathHint != null) return d.deathHint;
    if (this.hist.state === 'ok') this.hist.rows.forEach(function (h) {
      if (M.normalizeStatus(h.new_status) === 'dead' && (!best || h.changed_at > best.changed_at)) best = h;
    });
    return best ? M.dayFromTimestamp(best.changed_at) : null;
  }

  registryRows() {
    var R = window.RegistryListView;
    if (R && R.cached) return Promise.resolve(R.cached);
    return this.api.getRegistryPatients().then(function (r) { return (r && r.patients) || []; });
  }

  /**
   * Firestore patients/<code>: {name, first, last, canEdit}. first / last stay apart (a two-word first name must
   * not move into the last name when the dialog saves). A failed read shows the grouped code and hides edit-name (§4.4).
   */
  readName(code) {
    var auth = window.ILARS_AUTH;
    if (!auth || !auth.db) return Promise.resolve({ name: '', first: '', last: '', canEdit: false });
    return auth.db.collection('patients').doc(code).get().then(function (doc) {
      var nd = doc && doc.exists ? (doc.data() || {}) : null;
      var user = auth.getCurrentUser && auth.getCurrentUser();
      var first = nd && nd.firstName ? String(nd.firstName) : '', last = nd && nd.lastName ? String(nd.lastName) : '';
      return { name: [first, last].filter(Boolean).join(' ').trim(), first: first, last: last,
        canEdit: !nd || !nd.doctorUid || !!(user && nd.doctorUid === user.uid) };      // same rule as the old view
    }, function (e) {
      console.warn('[patient] Firestore name read failed', e);
      return { name: '', first: '', last: '', canEdit: false };
    });
  }

  /**
   * Status history: loading → one skeleton row; failed → calm line + Try again inside the Summary card.
   * A deceased patient's page re-renders in place when the history changes the day tracking ended.
   */
  loadHistory(code, seq) {
    var self = this;
    this.hist = { state: 'loading', rows: [] };
    this.paintSummary();
    return this.api.getPatientStatusHistory(code).then(function (r) {
      if (seq !== self.seq) return;
      self.hist = { state: 'ok', rows: (r && r.history) || [] };
      var root = document.getElementById('patient-detail-view');
      if (self.d && self.pm && self.pm.status === 'dead' && self.deathDay(self.d) !== self.renderedDeath && root.contains(self.sumEl || null)) self.render(root, self.d, { quiet: true });
      else self.paintSummary();
    }, function (e) {
      if (seq !== self.seq) return;
      console.warn('[patient] status history failed', e);
      self.hist = { state: 'failed', rows: [] };
      self.paintSummary();
    });
  }

  /**
   * Codes in the current list order and filter, or null (stepper hidden). The order comes from the list's own pure
   * pieces — PatientListView.data() / .readState() / .scopeFor() + ILARS_VIEW_MODELS.cohortModel / listRows (WP2) —
   * with the list instance's live state when it exists, so the stepper always agrees with the table. Older contract
   * (golden): an instance with rows() / fetch() / data. Nothing is rendered or constructed here.
   */
  listOrder() {
    var P = typeof PatientListView === 'function' ? PatientListView : null, VM = ILARS_VIEW_MODELS, pl = window.PatientListView;
    var codes = function (r) { return ((r && r.rows) || r || []).map(function (s) { return s.code || s.patient_code; }); };
    if (P && typeof P.data === 'function' && typeof VM.cohortModel === 'function' && typeof VM.listRows === 'function') {
      var st = pl && pl.st ? pl.st : typeof P.readState === 'function' ? P.readState() : { status: 'active' };
      return P.data().then(function (d) {
        var scope = typeof P.scopeFor === 'function' ? P.scopeFor(st.scope, d.list.rows, d.me) : (st.scope || 'all');
        var mod = VM.cohortModel(d.list.rows, { today: d.today, meDoctorCode: d.me.doctor_code, scope: scope });
        return codes(VM.listRows(mod.scoped, Object.assign({}, st, { scope: scope }), d.names));
      }).catch(function () { return null; });
    }
    if (!pl || typeof pl.rows !== 'function') return Promise.resolve(null);
    var ready = pl.data ? Promise.resolve() : typeof pl.fetch === 'function' ? pl.fetch() : Promise.reject(new Error('no list'));
    return ready.then(function () { return codes(pl.rows()); }).catch(function () { return null; });
  }

  // ================================================================== small helpers
  /** t() with an English default for keys that are not merged into en.json yet (design/i18n-additions/WP3.en.json). */
  tx(key, params) {
    var U = ILARS_UI, s = U.t(key, params);
    if (s !== key) return s;
    var en = PatientDetailView.EN[key];
    return en ? en.replace(/\{(\w+)\}/g, function (m, n) { return params && params[n] != null ? params[n] : m; }) : s;
  }
  larsChip(cat) {
    var U = ILARS_UI, k = cat || 'nodata';
    return '<span class="ui-lars ui-lars--' + k + '"><span class="ui-lars__pips" aria-hidden="true"><i></i><i></i><i></i></span>' + U.esc(U.t('doctor.cm.lars.cat_' + k)) + '</span>';
  }
  statusWord(s) { return ILARS_UI.t('doctor.cm.status.' + (s === 'dead' ? 'deceased' : s)); }
  /** "yesterday" / "3 days ago" inside a sentence (lower-case first letter); older days stay a date ("14 Mar"). */
  relativeInline(day, today) {
    var s = ILARS_UI.fmtRelative(day, today);
    return today - day > 60 ? s : s.charAt(0).toLocaleLowerCase(ILARS_UI.locale()) + s.slice(1);
  }
  /** A selector that finds the same control after a re-render: its id, else its data-act / data-v / data-del /
      data-series inside the nearest ancestor with an id (a card's table toggle, a view or range option). */
  focusKey(el, root) {
    if (!el || el === root || !root.contains(el)) return null;
    if (el.id) return '#' + CSS.escape(el.id);
    var attr = ['data-act', 'data-v', 'data-del', 'data-series'].filter(function (a) { return el.hasAttribute(a); })[0];
    var scope = el.parentElement && el.parentElement.closest('[id]');
    if (!attr || !scope || scope === root || !root.contains(scope)) return null;
    return '#' + CSS.escape(scope.id) + ' [' + attr + '="' + CSS.escape(el.getAttribute(attr)) + '"]';
  }
  initials(name) { return name.split(/\s+/).filter(Boolean).map(function (p) { return p[0]; }).slice(0, 2).join('').toUpperCase(); }
  store(k, v) { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) { return null; } return null; }
  copyCode(code) {
    if (navigator.clipboard) navigator.clipboard.writeText(code).catch(function () { /* the toast still confirms */ });
    ILARS_UI.toast(ILARS_UI.t('doctor.ui.toast.code_copied'));
  }

  // ================================================================== skeleton (content-shaped, same heights)
  skeleton(root, code, name) {
    var U = ILARS_UI;
    var tile = function (w) {
      return '<div class="ui-kpi pd-sk-tile"><div class="ui-skel ui-skel--text pd-sk-tile__a"></div><div class="ui-skel ui-skel--num" style="--w:' + w + 'px"></div><div class="ui-skel ui-skel--text pd-sk-tile__c"></div></div>';
    };
    var wave = '<svg viewBox="0 0 400 100" preserveAspectRatio="none" aria-hidden="true"><path d="M0 70 C40 55 60 40 100 48 S160 72 200 58 S270 30 310 42 S370 60 400 50" fill="none" stroke="var(--color-skeleton)" stroke-width="2.5" vector-effect="non-scaling-stroke"/></svg>';
    var card = function (span, h) {
      return '<article class="ui-card pd-sk-card ' + span + '"><div class="ui-card__head"><div><div class="ui-skel ui-skel--text pd-sk-card__t"></div><div class="ui-skel ui-skel--text pd-sk-card__h"></div></div><div class="ui-skel ui-skel--pill pd-sk-card__seg"></div></div>' +
        '<div class="pd-sk-card__take"><div class="ui-skel pd-sk-card__num"></div><div class="ui-skel ui-skel--text pd-sk-card__txt"></div></div>' +
        '<div class="ui-skel-chart" style="--chart-h:' + h + 'px">' + wave + '</div></article>';
    };
    var row = function (w) { return '<div class="pd-sk-row"><div class="ui-skel ui-skel--circle"></div><div class="ui-skel ui-skel--text" style="--w:' + w + '%"></div><div class="ui-skel ui-skel--text"></div></div>'; };
    var sec = '<div class="pd-summary__sec"><div class="ui-skel ui-skel--text pd-sk-sec__h"></div>' + [52, 64, 44].map(row).join('') + '</div>';
    root.setAttribute('aria-busy', 'true');
    root.innerHTML = this.backRow() + '<p class="sr-only" role="status">' + U.esc(U.t('doctor.ui.common.loading')) + '</p>' +
      '<header class="pd-head pd-head--shell"><div class="pd-head__id"><span class="ui-avatar ui-avatar--lg" aria-hidden="true">' + (name ? U.esc(this.initials(name)) : U.icon('user')) + '</span>' +
      '<div class="pd-head__text"><h1 class="pd-head__name" tabindex="-1"><span' + (name ? ' class="pd-vt-name"' : '') + '>' + (name ? U.esc(name) : '<span class="code">' + U.fmtCode(code || '') + '</span>') + '</span></h1>' +
      '<div class="pd-skel-meta" aria-hidden="true"><div class="ui-skel"></div><div class="ui-skel ui-skel--text"></div></div></div></div></header>' +
      '<div class="pd-skel-body" aria-hidden="true" inert>' +
        '<section class="ui-kpi-row pd-kpis" style="--cols:5">' + [70, 92, 78, 84, 110].map(tile).join('') + '</section>' +
        '<div class="pd-range-slot"><div class="pd-range ui-glass-float is-disabled">' + this.rangeBarInner('all', 'date', null, true) + '</div></div>' +
        '<section class="app-grid">' + card('span-8', 300) + '<article class="ui-card pd-sk-card span-4 lg-full">' + sec + sec + sec + '</article>' +
          card('span-6', 260) + card('span-6', 260) + '</section>' +
      '</div>';
  }

  backRow() {
    var U = ILARS_UI;
    return '<div class="pd-backrow"><a class="pd-back" href="#patients">' + U.icon('chev-left') + '<span>' + U.esc(U.t('doctor.ui.patient.back')) + '</span></a>' +
      '<div class="pd-stepper" data-part="stepper" role="group" hidden></div></div>';
  }

  /** Stepper "4 of 17" with ↑/↓ links (Alt+↑ / Alt+↓, never single-character keys: WCAG 2.1.4). */
  paintStepper(root, order) {
    var U = ILARS_UI, el = root.querySelector('[data-part="stepper"]');
    if (!el) return;
    var i = order ? order.indexOf(this.code) : -1;
    if (i < 0) { el.hidden = true; el.innerHTML = ''; return; }
    var pos = U.t('doctor.ui.patient.position', { i: i + 1, n: order.length }), prev = order[i - 1], next = order[i + 1];
    var link = function (code, step, icon, label, keys) {
      return '<a class="ui-icon-btn" data-step="' + step + '" ' + (code ? 'href="#patient/' + encodeURIComponent(code) + '"' : 'aria-disabled="true"') +
        ' aria-label="' + U.esc(label) + '" title="' + U.esc(label + ' (' + keys + ')') + '" aria-keyshortcuts="' + (step === 'prev' ? 'Alt+ArrowUp' : 'Alt+ArrowDown') + '">' + U.icon(icon) + '</a>';
    };
    el.setAttribute('aria-label', pos);
    el.innerHTML = link(prev, 'prev', 'chev-up', U.t('doctor.ui.patient.prev'), 'Alt+↑') + '<span class="pd-stepper__pos">' + U.esc(pos) + '</span>' +
      link(next, 'next', 'chev-down', U.t('doctor.ui.patient.next'), 'Alt+↓');
    el.hidden = false;
  }

  bindKeys() {
    // Alt+↓ / Alt+↑ walk the list order; ignored while typing or when another modifier is held
    document.addEventListener('keydown', function (e) {
      if (!e.altKey || e.metaKey || e.ctrlKey || e.shiftKey) return;
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
      if (!document.querySelector('#patient-detail-view.active') || document.querySelector('dialog[open]')) return;
      var a = document.activeElement;
      if (a && (/^(input|textarea|select)$/i.test(a.tagName) || a.isContentEditable)) return;
      var link = document.querySelector('#patient-detail-view .pd-stepper [data-step="' + (e.key === 'ArrowDown' ? 'next' : 'prev') + '"][href]');
      if (!link) return;
      e.preventDefault();
      location.hash = link.getAttribute('href').slice(1);
    });
  }

  rangeBarInner(range, axis, surgeryKind, disabled) {
    var U = ILARS_UI;
    var axes = [{ v: 'date', label: U.t('doctor.cm.axis.date') }, { v: 'study', label: U.t('doctor.cm.axis.study') }];
    if (surgeryKind) axes.push({ v: 'surgery', label: U.t(surgeryKind === 'closure' ? 'doctor.cm.axis.closure' : 'doctor.cm.axis.surgery') });
    return '<span class="pd-range__label" data-part="range-label">' + U.icon('calendar', 'i--sm') + '<span></span></span>' +
      U.segHtml(disabled ? null : 'pd-range-seg', ['1m', '3m', '6m', '1y', 'all'].map(function (k) { return { v: k, label: U.t('doctor.cm.range.' + k), title: U.t('doctor.cm.range.' + k + '_long') }; }),
        range, { cls: 'ui-seg--sm pd-range-seg', label: U.t('doctor.cm.range.label') }) +
      '<span class="pd-vsep" aria-hidden="true"></span>' +
      U.segHtml(disabled ? null : 'pd-axis-seg', axes, axis, { cls: 'ui-seg--sm pd-axis', label: U.t('doctor.cm.axis.label') }) +
      '<button class="ui-icon-btn ui-icon-btn--sm" type="button" data-act="range-more" aria-haspopup="menu" aria-expanded="false" aria-label="' + U.esc(U.t('doctor.ui.range.more')) + '" title="' + U.esc(U.t('doctor.ui.range.more')) + '">' + U.icon('more') + '</button>';
  }

  // ================================================================== render
  /** o = {quiet: true} re-renders in place after a change (no reveal, no count-up, card views kept); o.focus = selector. */
  render(root, d, o) {
    o = o || {};
    var self = this, U = ILARS_UI, M = ILARS_METRICS, VM = ILARS_VIEW_MODELS, O = ILARS_CHART_OPTIONS, C = M.C;
    var keptViews = {}, keptTables = {};
    if (o.quiet) this.cards.forEach(function (c) {
      var b = c.el.querySelector('.ui-card__tools .ui-seg > button[aria-pressed="true"]'); if (b) keptViews[c.id] = b.dataset.v;
      if (c.el.classList.contains('is-table')) keptTables[c.id] = true;                  // an open table twin stays open
    });
    this.dispose();
    root.removeAttribute('aria-busy');
    this.renderedLang = U.locale();
    this.renderedDeath = this.deathDay(d);
    var pm = VM.patientModel(d.detail, { registryRow: d.regFailed ? null : d.linked, deathDay: this.renderedDeath });
    U._today = pm.today;                                  // fmtDay 'short' and fmtRelative count from the same today
    var ext = { items: pm.caps.larsItems, dims: pm.caps.eqDims, sym: pm.caps.dailySymptoms, monthly: pm.caps.monthly };
    var mobile = matchMedia('(max-width: 767px)').matches;
    if (ILARS_CHARTS.patterns == null) ILARS_CHARTS.patterns = this.store('ilars_chart_patterns') === '1';
    var rangeKey = this.store('ilars_pd_range');
    if (['1m', '3m', '6m', '1y', 'all'].indexOf(rangeKey) < 0) rangeKey = mobile ? '3m' : M.defaultRange(pm.startDay, pm.today);
    var surgeryKind = pm.surgery ? pm.surgery.kind : null;
    var axis = this.store('ilars_pd_axis');
    if (['date', 'study', 'surgery'].indexOf(axis) < 0 || (axis === 'surgery' && !pm.surgery)) axis = 'date';
    var range = M.rangeWindow(rangeKey, pm.startDay, pm.today);
    var cm = VM.cardModels(pm, range);
    var kp = VM.patientKpis(pm);
    var ctx = function () { return ILARS_CHARTS.ctx({ mode: axis, ref: axis === 'study' ? pm.startDay : axis === 'surgery' ? pm.surgery.day : null }); };
    var T = ctx().tok;
    var code = d.detail.patient_code || this.code, name = d.name, status = pm.status;
    var reveal = function (i) { return o.quiet ? '' : ' ui-reveal" data-i="' + i; };
    var tp = function (key, n, params) { return U.tp(key, n, Object.assign({ n: n }, params || {})); };
    var withSign = function (v) { return (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v); };
    // a sentence that ends with a date which already ends with a full stop (lt "2026 m. liep. 5 d.") keeps one stop
    var oneStop = function (s) { return s.replace(/([^.])\.\.$/, '$1.'); };
    /** Phone line breaks: never inside "3–5", "10 = worst", "7-day", a short date ("8 Jan", "saus. 8") or a number
        with its word ("30 days", "day 14", "level 1"); a " · " separator ends a line, never starts one. Text or
        escaped HTML in, same out (only the text between tags changes). */
    var nb = function (str) {
      return String(str).split(/(<[^>]*>)/).map(function (s, i) {
        return i % 2 ? s : s.replace(/(\d)–(\d)/g, '$1\u2060–\u2060$2').replace(/(\d+) = /g, '$1\u00a0=\u00a0').replace(/ · /g, '\u00a0· ')
          .replace(/(\d)-(?=\p{L})/gu, '$1-\u2060').replace(/(\d) (?=\p{L})/gu, '$1\u00a0').replace(/([\p{L}.]) (?=\d)/gu, '$1\u00a0');
      }).join('');
    };

    // ---------------------------------------------------------- header
    var surgeryLine = '';
    var lk = d.regFailed ? null : d.linked;
    if (lk && (lk.operation_date || lk.index_operation_date)) {
      var opDay = M.parseDay(lk.operation_date || lk.index_operation_date), clDay = M.parseDay(lk.ileostomy_closure_date);
      var since = clDay != null ? clDay : opDay;
      surgeryLine = '<div class="pd-meta pd-meta--surgery"><div class="pd-meta__in">' +
        '<span class="pd-meta__item">' + U.esc(U.t('doctor.ui.patient.surgery_line', { operation: lk.operation_type || '', date: U.fmtDay(opDay, 'long') }).trim()) + '</span>' +
        (clDay != null ? '<span class="pd-meta__item">' + U.esc(U.t('doctor.ui.patient.stoma_closed', { date: U.fmtDay(clDay, 'long') })) + '</span>' : '') +
        (since != null && since <= pm.today && status !== 'dead' ? '<span class="pd-meta__item">' + U.esc(U.t(clDay != null ? 'doctor.ui.patient.months_since_closure' : 'doctor.ui.patient.months_since_surgery',
          { months: U.fmtUnit(Math.max(0, Math.round((pm.today - since) / 30.44)), 'month') })) + '</span>' : '') + '</div></div>';
    }
    var lastAct = M.lastActivity(pm.act);
    var head =
      '<header class="pd-head' + reveal(0) + '"><div class="pd-head__id">' +
        '<span class="ui-avatar ui-avatar--lg" aria-hidden="true">' + (name ? U.esc(this.initials(name)) : U.icon('user')) + '</span>' +
        // the edit button sits beside the <h1>, not in it: the heading's name is the patient's name only
        '<div class="pd-head__text"><div class="pd-head__title"><h1 class="pd-head__name" tabindex="-1"><span' + (name ? ' class="pd-vt-name"' : '') + ' id="patient-detail-name-display">' +
          (name ? U.esc(name) : '<span class="code">' + U.fmtCode(code) + '</span>') + '</span></h1>' +
          (d.canEditName ? '<button class="ui-icon-btn" type="button" id="btn-edit-patient-name" aria-label="' + U.esc(U.t('doctor.ui.patient.edit_name')) + '" title="' + U.esc(U.t('doctor.ui.patient.edit_name')) + '">' + U.icon('pencil', 'i--sm') + '</button>' : '') + '</div>' +
          '<div class="pd-meta"><div class="pd-meta__in">' +
            '<span class="pd-meta__item"><span class="ui-code" id="patient-detail-code">' + U.fmtCode(code) +
              '<button class="ui-icon-btn" type="button" data-act="copy" aria-label="' + U.esc(U.t('doctor.ui.patient.copy_code')) + '" title="' + U.esc(U.t('doctor.ui.patient.copy_code')) + '">' + U.icon('copy') + '</button></span></span>' +
            // a deceased patient: the time in study ends at the status change (no count while the date is unknown)
            (status !== 'dead' ? '<span class="pd-meta__item"><b>' + U.esc(U.t('doctor.ui.patient.day_in_study', { n: pm.today - pm.startDay })) + '</b></span>'
              : pm.deathDay != null ? '<span class="pd-meta__item"><b>' + U.esc(this.tx('doctor.ui.patient.in_study_until', { days: U.fmtDays(pm.deathDay - pm.startDay), date: U.fmtDay(pm.deathDay, 'long') })) + '</b></span>' : '') +
            '<span class="pd-meta__item">' + U.esc(U.t('doctor.ui.patient.registered', { date: U.fmtDay(pm.startDay, 'long') })) + '</span>' +
            '<span class="pd-meta__item" data-part="doctor" hidden></span>' +
            (d.readOnly ? '<span class="pd-meta__item" data-part="hospital" hidden></span>' : '') +
            (lastAct ? '<span class="pd-meta__item">' + U.esc(U.t('doctor.ui.patient.last_entry', { when: this.relativeInline(lastAct.day, pm.today) })) + '</span>' : '') +
          '</div></div>' + surgeryLine +
        '</div></div>' +
        '<div class="pd-head__actions">' +
          '<div class="pd-status" id="patient-status-bar"><span class="ui-pstatus ui-pstatus--pill ui-pstatus--' + (status === 'dead' ? 'deceased' : status) + '" id="patient-status-indicator">' + U.esc(this.statusWord(status)) + '</span>' +
            (d.readOnly ? '<span class="pd-status__ro" title="' + U.esc(U.t('doctor.ui.patient.view_only_hint')) + '">' + U.icon('eye', 'i--xs') + U.esc(U.t('doctor.ui.patient.view_only')) + '</span></div>'
              : '<button class="pd-status__btn" type="button" id="patient-change-status" aria-haspopup="menu" aria-expanded="false">' + U.esc(U.t('doctor.ui.patient.change_status')) + U.icon('chev-down', 'i--xs') + '</button></div>') +
          (d.lt && !d.regFailed ? '<div class="pd-reglink" id="patient-registry-link"' + (d.regPending ? ' aria-busy="true"><span class="ui-skel ui-skel--pill pd-reglink__skel" aria-hidden="true"></span>' : '>') + '</div>' : '') +
          '<button class="ui-icon-btn ui-icon-btn--round" type="button" data-act="more" aria-haspopup="menu" aria-expanded="false" aria-label="' + U.esc(U.t('doctor.ui.common.more')) + '" title="' + U.esc(U.t('doctor.ui.common.more')) + '">' + U.icon('more') + '</button>' +
        '</div></header>';

    // ---------------------------------------------------------- KPI row (range-independent snapshot)
    var cur = kp.currentLars, lc = cur.value != null ? M.larsCategory(cur.value) : null;
    var firstCat = pm.larsFirst ? M.larsCategory(pm.larsFirst.first) : null;
    // §3.4 Delta: the arrow and number are for the eye; a screen reader gets one sentence with the direction (sr)
    var deltaHtml = function (delta, colored, betterIfNegative, sr) {
      if (delta == null || delta === 0) return '<span class="ui-delta">±0</span>';
      var cls = colored ? (((delta < 0) === betterIfNegative) ? ' ui-delta--better' : ' ui-delta--worse') : '';
      return '<span class="ui-delta' + cls + '">' + U.icon(delta < 0 ? 'arrow-down' : 'arrow-up') + '<span aria-hidden="true">' + U.fmtNum(Math.abs(delta)) + '</span>' +
        '<span class="sr-only">' + U.esc(sr) + '</span></span>';
    };
    var dec = function (v) { return v % 1 ? 1 : 0; };
    // a LARS figure that uses a total calculated from the answers says so, as the LARS table does
    var calcNote = function (on) { return on ? '<span>' + U.esc(U.t('doctor.cm.lars.calculated')) + '</span>' : ''; };
    var tiles = [];
    tiles.push('<article class="ui-kpi ui-kpi--hero' + (cur.calculated ? ' pd-kpi--calc' : '') + reveal(1) + '"><div class="ui-kpi__label">' + U.icon('line') + U.esc(U.t('doctor.cm.kpi.current_lars')) +
      (cur.day != null ? '<span class="ui-kpi__date">' + U.esc(U.fmtDay(cur.day, 'short')) + '</span>' : '') + '</div>' +
      (cur.value == null ? '<div class="ui-kpi__value is-empty">—</div><div class="ui-kpi__meta">' + U.esc(U.t('doctor.cm.kpi.no_lars')) + '</div>' :
        '<div class="ui-kpi__value"><span data-count="' + cur.value + '">' + cur.value + '</span>' + this.larsChip(lc) + '</div>' +
        '<div class="ui-kpi__meta">' + (cur.delta != null ? deltaHtml(cur.delta, firstCat !== lc, true,
          U.t(cur.delta < 0 ? 'doctor.cm.list.delta_sr_down' : 'doctor.cm.list.delta_sr_up', { n: Math.abs(cur.delta) }) + ' (' + pm.larsFirst.first + ')') +
          '<span' + (cur.delta ? ' aria-hidden="true"' : '') + '>' + U.esc(U.t('doctor.cm.delta.vs_first') + ' (' + pm.larsFirst.first + ')') + '</span>' : '') + calcNote(cur.calculated) + '</div>' +
        '<div class="ui-kpi__spark" aria-hidden="true">' + O.sparklineSVG(cur.spark, T, 104, 32) + '</div>') + '</article>');
    if (!kp.median4w.hidden) {
      var m4 = kp.median4w;
      tiles.push('<article class="ui-kpi' + reveal(2) + '"><div class="ui-kpi__label">' + U.icon('line') + U.esc(U.t('doctor.cm.kpi.median_4w')) + '</div>' +
        '<div class="ui-kpi__value"><span data-count="' + m4.value + '" data-dec="' + dec(m4.value) + '">' + U.fmtNum(m4.value, dec(m4.value)) + '</span>' + this.larsChip(m4.category) + '</div>' +
        '<div class="ui-kpi__meta">' + (m4.previous == null ? U.esc(U.t('doctor.cm.kpi.prev_4w_none')) : m4.change === 'same'
          ? '<span>' + U.esc(U.t('doctor.cm.kpi.same_category')) + ' · ' + U.esc(U.t('doctor.cm.kpi.prev_4w', { median: U.fmtNum(m4.previous, dec(m4.previous)), category: U.t('doctor.cm.lars.band_' + m4.previousCategory) })) + '</span>'
          : '<span class="ui-delta ' + (m4.change === 'better' ? 'ui-delta--better' : 'ui-delta--worse') + '">' + U.esc(U.t('doctor.cm.kpi.moved_to', { category: U.t('doctor.cm.lars.band_' + m4.category) })) + '</span>') + calcNote(m4.calculated) + '</div></article>');
    }
    if (!kp.vas.hidden) {
      tiles.push('<article class="ui-kpi' + reveal(3) + '"' + (kp.vas.deltaFirst != null && !kp.vas.beyondMid ? ' title="' + U.esc(U.t('doctor.cm.delta.within_mid')) + '"' : '') + '><div class="ui-kpi__label">' + U.icon('heart') + U.esc(U.t('doctor.cm.kpi.eq_vas')) + '</div>' +
        '<div class="ui-kpi__value"><span data-count="' + kp.vas.value + '">' + kp.vas.value + '</span><span class="ui-kpi__unit">' + U.esc(U.t('doctor.ui.patient.vas_unit')) + '</span></div>' +
        '<div class="ui-kpi__meta">' + (kp.vas.deltaFirst != null ? '<span class="pd-kpi-pair">' + deltaHtml(kp.vas.deltaFirst, kp.vas.beyondMid, false,
          tp(kp.vas.deltaFirst < 0 ? 'doctor.ui.patient.take_vas_down' : 'doctor.ui.patient.take_vas_up', Math.abs(kp.vas.deltaFirst), { point: kp.vas.firstPoint })) +
          '<span' + (kp.vas.deltaFirst ? ' aria-hidden="true"' : '') + '>' + U.esc(U.t('doctor.cm.delta.vs_first')) + '</span></span>' : '') +
          '<span>' + U.esc(U.t('doctor.cm.kpi.visit_meta', { point: kp.vas.point, date: U.fmtDay(kp.vas.day, 'short') })) + '</span></div></article>');
    }
    // adherence: level colour only for active patients; a deceased patient is not tracked (§4.4 states)
    var a = kp.adherence, app = status === 'dead' ? null : M.percentParts(a.ratio), lvl = status === 'active' ? M.adherenceLevel(a.ratio) : null;
    var adhPrefix = app ? (a.monthlyKnown ? app.prefix : '≥ ') : '';            // A26: today's API = lower bound
    tiles.push('<article class="ui-kpi' + reveal(4) + '"' + (!a.monthlyKnown && app ? ' title="' + U.esc(U.t('doctor.cm.kpi.adherence_monthly_note')) + '"' : '') + '><div class="ui-kpi__label">' + U.icon('calendar') + U.esc(U.t('doctor.cm.kpi.adherence')) + '</div>' +
      (app ? '<div class="ui-kpi__value"><span data-count="' + app.value + '" data-prefix="' + U.esc(adhPrefix) + '" data-suffix="%">' + U.esc(adhPrefix) + app.value + '%</span></div>' +
        '<div class="ui-kpi__meta"><span class="ui-meter' + (lvl ? ' ui-meter--' + lvl : '') + '" style="--v:' + app.value + '%" aria-hidden="true"></span><span>' + U.esc(tp('doctor.cm.kpi.adherence_meta', a.expected, { done: a.done, expected: a.expected })) + '</span></div>'
        : '<div class="ui-kpi__value is-empty">—</div><div class="ui-kpi__meta">' + U.esc(U.t(status === 'dead' ? 'doctor.cm.list.not_tracked' : 'doctor.cm.kpi.too_early_meta')) + '</div>') + '</article>');
    var le = kp.lastEntry;
    tiles.push('<article class="ui-kpi' + reveal(5) + '"><div class="ui-kpi__label">' + U.icon('clock') + U.esc(U.t('doctor.cm.kpi.last_entry')) + '</div>' +
      (le.empty ? '<div class="ui-kpi__value is-empty">—</div><div class="ui-kpi__meta">' + U.esc(U.t('doctor.cm.kpi.no_entries')) + '</div>' :
        '<div class="ui-kpi__value pd-kpi-rel">' + U.esc(U.fmtRelative(le.day, pm.today)) + '</div>' +
        '<div class="ui-kpi__meta">' + (le.warn ? '<span class="warn">' + U.icon('alert', 'i--xs') + '</span>' : '') +
          '<span>' + U.esc(U.t('doctor.cm.kpi.last_meta', { type: U.t('doctor.cm.q.type_' + le.type), date: U.fmtDay(le.day, 'short') })) + '</span></div>') + '</article>');

    // secondary figures: one quiet card (hidden cells are not rendered)
    var stats = [], ms = kp.eqVisits, dead = status === 'dead';
    var lastDone = pm.visits.filter(function (v) { return v.status === 'done'; }).slice(-1)[0];
    var eqMeta = dead ? (lastDone ? U.t('doctor.cm.kpi.visit_meta', { point: lastDone.point, date: U.fmtDay(lastDone.day, 'short') }) : U.t('doctor.cm.list.not_tracked'))
      : ms.open && ms.open.status === 'overdue' ? U.t('doctor.cm.kpi.eq_overdue', { point: ms.open.point, days: U.fmtDays(ms.open.overdueDays) })
      : ms.open ? U.t('doctor.cm.kpi.eq_due', { point: ms.open.point })
      : ms.next ? U.t('doctor.cm.kpi.eq_next', { point: ms.next.point, date: U.fmtDay(ms.next.dueDay, 'short') }) : U.t('doctor.cm.kpi.eq_all_done');
    stats.push('<div class="ui-stats__cell"><div class="ui-stats__label">' + U.esc(U.t('doctor.cm.kpi.eq_visits')) + '</div><div class="ui-stats__value">' + U.esc(U.t('doctor.cm.common.of_total', { done: ms.done, total: ms.arrived })) + '</div>' +
      '<div class="ui-stats__meta' + (!dead && ms.open && ms.open.status === 'overdue' ? ' warn' : '') + '">' + U.esc(eqMeta) + '</div></div>');
    if (!kp.stool7.hidden) stats.push('<div class="ui-stats__cell"><div class="ui-stats__label">' + U.esc(U.t('doctor.cm.kpi.stool_7d')) + '</div><div class="ui-stats__value">' + U.fmtNum(kp.stool7.value, 1) + '<small>' + U.esc(U.t('doctor.ui.patient.unit_per_day')) + '</small></div>' +
      '<div class="ui-stats__meta">' + (kp.stool7.firstWeek != null ? U.esc(U.t('doctor.ui.patient.take_stool_first', { v: U.fmtNum(kp.stool7.firstWeek, 1) })) : '&nbsp;') + '</div></div>');
    if (!kp.bristol30.hidden) {
      var bp = M.percentParts(kp.bristol30.ratio);
      stats.push('<div class="ui-stats__cell"><div class="ui-stats__label">' + U.esc(U.t('doctor.cm.kpi.bristol_30d')) + '</div><div class="ui-stats__value">' + U.esc(bp.prefix + bp.value) + '%</div><div class="ui-stats__meta">' + U.esc(tp('doctor.cm.kpi.bristol_meta', kp.bristol30.n)) + '</div></div>');
    }
    if (!kp.steps7.hidden) stats.push('<div class="ui-stats__cell"><div class="ui-stats__label">' + U.esc(U.t('doctor.cm.kpi.steps_7d')) + '</div><div class="ui-stats__value">' + U.fmtNum(Math.round(kp.steps7.value)) + '</div>' +
      '<div class="ui-stats__meta">' + (kp.steps7.prevRatio != null ? U.esc(U.t('doctor.cm.kpi.vs_prev_7d', { delta: withSign(Math.round(kp.steps7.prevRatio * 100)) + '%' })) : '&nbsp;') + '</div></div>');

    stats = stats.map(nb);                                 // phone line breaks in the strip's labels and notes
    var hadFocus = document.activeElement && root.contains(document.activeElement) && document.activeElement.matches('h1');
    // a quiet re-render (late registry row, status change, language) keeps the focus on the same control
    var keepFocus = !o.focus && o.quiet ? this.focusKey(document.activeElement, root) : null;
    root.innerHTML = this.backRow() + head +
      '<section class="ui-kpi-row pd-kpis" style="--cols:' + tiles.length + '" aria-label="' + U.esc(U.t('doctor.ui.a11y.key_figures')) + '">' + tiles.join('') + '</section>' +
      // only the EQ-5D-5L cell left (no recent diary, e.g. DEMO20 or a deceased patient): no strip, as in golden —
      // one cell in a full-width card is mostly empty; the visits are in the EQ-5D-5L card and "Coming up"
      (stats.length >= 2 ? '<section class="ui-stats pd-stats' + reveal(6) + '" style="--cols:' + stats.length + '" aria-label="' + U.esc(U.t('doctor.ui.patient.more_figures')) + '">' + stats.join('') + '</section>' : '') +
      '<div class="pd-range-slot"><div class="pd-range ui-glass-float" role="toolbar" aria-label="' + U.esc(U.t('doctor.cm.range.label')) + '">' + this.rangeBarInner(rangeKey, axis, surgeryKind) + '</div></div>' +
      '<section class="app-grid pd-grid" id="pd-grid" aria-label="' + U.esc(U.t('doctor.ui.a11y.charts')) + '"></section>';
    var grid = root.querySelector('#pd-grid');
    var rangeLabel = function () { root.querySelector('[data-part="range-label"] span').textContent = U.fmtDay(range.from, 'short') + ' – ' + U.fmtDay(range.to, 'long'); };
    rangeLabel();

    // ---------------------------------------------------------- chart cards
    var cards = this.cards = [];
    var add = function (spec) {
      if (keptViews[spec.id] && spec.views.some(function (v) { return v.v === keptViews[spec.id]; })) spec.view = keptViews[spec.id];
      // per-view card chrome: a view with its own hint (Monthly QoL: items 1–4 vs scores 0–10), and a "not available
      // yet" line that belongs to one view only (spec.naView). card.js paints the takeaway on every view switch, so
      // both follow the view there. Hints, takeaways and notes get phone-safe line breaks (nb).
      var card = null, first = spec.views.filter(function (v) { return v.v === spec.view; })[0] || spec.views[0];
      var chrome = spec.naView || spec.views.some(function (v) { return v.hint; });
      if (spec.hint) spec.hint = nb(spec.hint);
      if (spec.notes) spec.notes = spec.notes.map(nb);
      spec.views.forEach(function (v) {
        var take = v.takeaway, notes = v.notes;
        if (v.hint) v.hint = nb(v.hint);
        v.takeaway = function () {
          var h = chrome && card && card.el.querySelector('.ui-card__hint'), na = card && card.el.querySelector('[data-part="na"]');
          if (h) h.textContent = v.hint || spec.hint;
          if (na && spec.naView) na.hidden = v.v !== spec.naView;
          return take ? nb(take()) : '';
        };
        if (typeof notes === 'function') v.notes = function () { return notes().map(nb); };
        else if (notes) v.notes = notes.map(nb);
      });
      card = ILARS_CHARTS.card(Object.assign({}, spec, { hint: first.hint || spec.hint }));
      if (o.quiet) card.el.classList.remove('ui-reveal');
      if (keptTables[spec.id]) card.el.querySelector('[data-act="table"]').click();
      grid.appendChild(card.el); cards.push(card); return card;
    };
    var inR = function (p) { return p.day >= range.from && p.day <= range.to; };
    // A24: the diary cards (charts, their table twins and sentences) start at the 730-day diary window
    var inD = function (p) { var dr = M.diaryRange(range, pm.startDay, pm.today); return p.day >= dr.from && p.day <= dr.to; };
    var diaryNote = function () { return M.diaryRange(range, pm.startDay, pm.today).clipped ? [U.esc(U.t('doctor.cm.common.diary_window'))] : []; };
    // a calendar shows at most the last 53 weeks (fewer on a very narrow phone, charts/base.js calendarFrom): when
    // it is cut, it says so (CHARTS-METRICS §3.5) instead of the diary-window note (it starts inside that window)
    // a calendar's box is exactly as tall as the calendar it draws (+ the key row under the stool calendar) at the
    // canvas width: no blank band under a phone's small cells. build() runs again on a width change and refits it.
    var calCanvas = function (id) { return document.querySelector('#card-' + id + ' .ui-chart__canvas'); };
    var calH = function (id, extra) {
      var c = calCanvas(id), w = (c && c.clientWidth) || 600, dr = M.diaryRange(range, pm.startDay, pm.today);
      return O._.calendarHeight(O.calendarFrom(dr.from, dr.to, w).from, dr.to, w) + extra;
    };
    var fitCal = function (id, extra) { var c = calCanvas(id); if (c) c.style.setProperty('--chart-h', calH(id, extra) + 'px'); };
    var calendarNote = function (id) {
      var c = document.querySelector('#card-' + id + ' .ui-chart__canvas'), dr = M.diaryRange(range, pm.startDay, pm.today);
      return O.calendarFrom(dr.from, dr.to, (c && c.clientWidth) || 600).clipped ? [U.esc(self.tx('doctor.cm.common.showing_last_year'))] : diaryNote();
    };
    // a deceased patient: the blank days after the status change are not tracked (no "missed" marks there)
    var endNote = function () {
      return status === 'dead' && pm.deathDay != null && range.to >= pm.deathDay
        ? [U.esc(self.tx('doctor.ui.patient.not_tracked_from', { date: U.fmtDay(pm.deathDay, 'long'), status: self.statusWord('dead') }))] : [];
    };
    var catName = function (c) { return U.t('doctor.cm.lars.cat_' + (c || 'nodata')); };

    // LARS -----------------------------------------------------------------
    var larsIn = function () { return pm.lars.filter(inR); };
    var larsSummary = function () {
      var L = larsIn(); if (!L.length) return U.t('doctor.cm.lars.empty');
      var last = L[L.length - 1], sc = L.map(function (p) { return p.score; });
      return tp('doctor.cm.lars.summary', L.length, { score: last.score, category: catName(M.larsCategory(last.score)), date: U.fmtDay(last.day, 'long'),
        min: Math.min.apply(null, sc), max: Math.max.apply(null, sc) });
    };
    var ITEMS = C.LARS_ITEM_KEYS;
    var ITEM_LABEL = { urgency_to_toilet: 'item_urgency', repeat_bowel_opening: 'item_clustering', flatus_control: 'item_flatus', bowel_frequency: 'item_frequency', liquid_stool_leakage: 'item_liquid' };
    var ITEM_SLOT = { urgency_to_toilet: 0, repeat_bowel_opening: 1, flatus_control: 2, bowel_frequency: 3, liquid_stool_leakage: 4 };
    var ITEM_MAX = { urgency_to_toilet: 16, repeat_bowel_opening: 11, flatus_control: 7, bowel_frequency: 5, liquid_stool_leakage: 3 };
    var ANS3 = ['app.lars_no_never', 'app.lars_yes_less_once_week', 'app.lars_yes_at_least_once_week'];
    var ANSF = ['app.lars_more_7_times_day', 'app.lars_4_7_times_day', 'app.lars_1_3_times_day', 'app.lars_less_once_day'];
    var answer = function (p, k) {                                    // A18: the answer text per item (+ its points)
      var idx = p.answers ? p.answers[k] : null, list = k === 'bowel_frequency' ? ANSF : ANS3;
      if (idx == null || !list[idx]) return p.items ? String(p.items[k]) : '–';
      return U.t(list[idx]) + ' · ' + (p.items ? p.items[k] : '');
    };
    var larsTable = function () {
      var med = {}; pm.larsMedian.forEach(function (m) { med[m.day] = m.value; });
      return { caption: U.t('doctor.cm.lars.caption'),
        head: [U.t('doctor.cm.lars.th_date'), U.t('doctor.cm.lars.th_score'), U.t('doctor.cm.lars.th_category'), U.t('doctor.cm.lars.th_median')]
          .concat(ext.items ? ITEMS.map(function (k) { return U.t('doctor.cm.lars.' + ITEM_LABEL[k]); }) : []),
        num: [1, 3],
        rows: larsIn().slice().reverse().map(function (p) {
          return [U.fmtDay(p.day, 'long'), p.calculated ? p.score + ' (' + U.t('doctor.cm.lars.calculated') + ')' : p.score, catName(M.larsCategory(p.score)),
            med[p.day] == null ? '–' : U.fmtNum(med[p.day], dec(med[p.day]))].concat(ext.items ? ITEMS.map(function (k) { return answer(p, k); }) : []);
        }) };
    };
    var larsTake = function () {
      var f = pm.larsFirst; if (!f) return '';
      var cat = M.larsCategory(f.latest), changed = M.larsCategory(f.first) !== cat;
      var txt = f.delta == null ? U.t('doctor.ui.patient.take_lars_only', { date: U.fmtDay(f.firstDay, 'short') })
        : f.delta === 0 ? U.t('doctor.ui.patient.take_lars_same', { first: f.first, date: U.fmtDay(f.firstDay, 'short') })
        : tp(f.delta < 0 ? 'doctor.ui.patient.take_lars_lower' : 'doctor.ui.patient.take_lars_higher', Math.abs(f.delta), { first: f.first, date: U.fmtDay(f.firstDay, 'short') });
      var med = kp.median4w.hidden ? '' : ' · ' + U.esc(U.t('doctor.ui.patient.take_median', { v: U.fmtNum(kp.median4w.value, dec(kp.median4w.value)) }));
      return '<span class="ui-chart__num">' + f.latest + '</span>' + self.larsChip(cat) + '<span class="ui-chart__text">' + (changed ? '<b>' + U.esc(txt) + '</b>' : U.esc(txt)) + med + '</span>';
    };
    var drivers = function () {
      var h = '<div class="pd-drivers"><div class="pd-drivers__h">' + U.esc(U.t('doctor.ui.patient.drivers_title')) + '</div>';
      if (!ext.items) return h + '<p class="ui-na pd-drivers__na">' + U.icon('clock') + '<span><b>' + U.esc(U.t('doctor.ui.common.not_available')) + '.</b> ' + U.esc(U.t('doctor.ui.patient.na_items')) + '</span></p></div>';
      var last = pm.lars.length ? pm.lars[pm.lars.length - 1].day : null;
      var win = pm.lars.filter(function (p) { return p.items && last != null && p.day > last - C.LARS_MEDIAN_WINDOW_DAYS; });
      if (win.length < C.LARS_MEDIAN_MIN_N) return h + '<p class="pd-drivers__say">' + U.esc(U.t('doctor.ui.patient.drivers_few')) + '</p></div>';
      var means = ITEMS.map(function (k) { return { k: k, v: M.mean(win.map(function (p) { return p.items[k]; })) }; });
      var total = means.reduce(function (s, x) { return s + x.v; }, 0);
      var top = means.slice().sort(function (x, y) { return y.v - x.v; });
      return h + means.map(function (x) {
        return '<div class="pd-drivers__row"><span>' + U.esc(U.t('doctor.cm.lars.' + ITEM_LABEL[x.k])) + '</span><b>' + U.fmtNum(x.v, 1) + ' <small>/ ' + ITEM_MAX[x.k] + '</small></b>' +
          '<span class="pd-drivers__bar" aria-hidden="true"><i style="--v:' + Math.round(x.v / ITEM_MAX[x.k] * 100) + '%;--c:' + T.chart[ITEM_SLOT[x.k]] + '"></i></span></div>';
      }).join('') +
        (total > 0 ? '<p class="pd-drivers__say">' + U.t('doctor.ui.patient.drivers_sentence', { a: '<b>' + U.esc(U.t('doctor.cm.lars.' + ITEM_LABEL[top[0].k])) + '</b>',
          b: '<b>' + U.esc(U.t('doctor.cm.lars.' + ITEM_LABEL[top[1].k])) + '</b>', pct: '<b>' + O._.pct((top[0].v + top[1].v) / total) + '</b>' }).replace(/<(?!\/?b>)/g, '&lt;') + '</p>' : '') +
        '<p class="ui-chart__note pd-drivers__hint">' + U.esc(U.t('doctor.ui.patient.drivers_hint')) + '</p></div>';
    };
    var larsViews = [{ v: 'trend', label: U.t('doctor.cm.lars.view_trend'), icon: 'line', coord: 'cartesian', group: 'pd-time', height: 300,
      build: function () { return O.larsTrend(cm.lars, ctx(), larsSummary()); }, summary: larsSummary, table: larsTable, takeaway: larsTake,
      legend: [{ name: U.t('doctor.cm.lars.series_weekly'), key: 'dot', color: T.metricLars, toggle: true }, { name: U.t('doctor.cm.lars.series_median'), key: 'line', color: T.metricLars, toggle: true },
        { name: this.tx(pm.preop != null && pm.preop !== (pm.larsFirst && pm.larsFirst.first) ? 'doctor.cm.lars.ref_lines' : 'doctor.cm.lars.ref_line'), key: 'dash', color: T.refLine }] }];
    if (ext.items) larsViews.push({ v: 'items', label: U.t('doctor.cm.lars.view_items'), icon: 'bars', coord: 'cartesian', group: 'pd-time', height: 300,
      build: function () { return O.larsItems(cm.lars, ctx(), larsSummary()); }, summary: larsSummary, table: larsTable, takeaway: larsTake,
      legend: ITEMS.map(function (k) { return { name: U.t('doctor.cm.lars.' + ITEM_LABEL[k]), color: T.chart[ITEM_SLOT[k]], toggle: true }; }),
      notes: function () { return larsIn().filter(function (p) { return p.items; }).length > C.LARS_ITEMS_MAX_BARS ? [U.esc(U.t('doctor.cm.lars.items_block_note'))] : []; } });
    // Share view: its chart name says what its takeaway says (§3.6), not the trend sentence
    var shareSentence = function () {
      var L = larsIn(), k = L.filter(function (p) { return M.larsCategory(p.score) === 'major'; }).length;
      return { k: k, text: tp('doctor.ui.patient.take_share', L.length, { k: k }) };
    };
    larsViews.push({ v: 'share', label: U.t('doctor.cm.lars.view_share'), icon: 'donut', coord: 'pie', height: 300,
      build: function () { return O.larsShare(cm.lars, ctx(), shareSentence().text + '.'); }, summary: function () { return shareSentence().text + '.'; }, table: larsTable,
      takeaway: function () {
        var sh = shareSentence();
        return '<span class="ui-chart__num">' + sh.k + '</span><span class="ui-chart__text">' + U.esc(sh.text.replace(/^\s*\d+\s+/, '')) + '</span>';
      },
      legend: ['none', 'minor', 'major'].map(function (c) { return { name: catName(c), color: 'var(--color-lars-' + c + ')' }; }) });
    add({ id: 'pd-lars', span: 'span-8', reveal: 7, title: U.t('doctor.cm.lars.title'), hint: U.t('doctor.cm.lars.hint'), info: U.t('doctor.cm.lars.info'),
      views: larsViews, aside: drivers,
      empty: function () {
        if (!pm.lars.length) return U.esc(U.t('doctor.cm.lars.empty'));
        if (!larsIn().length) { var l = pm.lars[pm.lars.length - 1]; return U.esc(U.t('doctor.cm.lars.empty_range', { score: l.score, date: U.fmtDay(l.day, 'long') })); }
        return null;
      } });

    // Summary (status history · surgery · questionnaires) ----------------------
    var sumEl = document.createElement('article');
    sumEl.className = 'ui-card pd-summary span-4 lg-full' + (o.quiet ? '' : ' ui-reveal');
    sumEl.dataset.i = 8;
    sumEl.setAttribute('aria-label', U.t('doctor.ui.patient.summary'));
    grid.appendChild(sumEl);
    this.sumEl = sumEl; this.pm = pm;
    this.paintSummary();

    // EQ-5D-5L (all visits, range-independent) ---------------------------------
    var eqSummary = function () {
      var v = pm.vas, s = pm.milestoneSummary; if (!v) return '';
      return oneStop(tp('doctor.cm.eq.summary', s.arrived, { n: s.done, arrived: s.arrived, vas: v.latest, date: U.fmtDay(v.latestDay, 'long'),
        change: v.deltaFirst != null ? U.t('doctor.cm.eq.summary_change', { delta: withSign(v.deltaFirst) }) : '' }));
    };
    // VAS change in words, named by its real reference visit ("than day 14" when day 0 has no VAS, DATA-14).
    // A single VAS visit has nothing to compare with: no words (never "Same as day 0" for the visit itself).
    var vasWord = function (v) {
      var dl = v.deltaFirst, p = { point: v.firstPoint };
      if (dl == null) return '';
      return dl === 0 ? U.t('doctor.ui.patient.take_vas_same', p) : tp(dl > 0 ? 'doctor.ui.patient.take_vas_up' : 'doctor.ui.patient.take_vas_down', Math.abs(dl), p);
    };
    // the VAS chart beside the profile has its own name (two images with one label would read twice, §3.6)
    var vasSummary = function () {
      var v = pm.vas; if (!v) return '';
      var word = vasWord(v);
      return oneStop(U.t('doctor.cm.kpi.eq_vas') + ' ' + v.latest + ' ' + U.t('doctor.ui.patient.vas_unit') + ', ' + U.fmtDay(v.latestDay, 'long') + '.') + (word ? ' ' + word + '.' : '');
    };
    var DIMS = ['app.eq_mobility', 'app.eq_self_care', 'app.eq_usual_activities', 'app.eq_pain_discomfort', 'app.eq_anxiety_depression'];
    var eqTable = function () {
      return { caption: U.t('doctor.cm.eq.caption'),
        head: [U.t('doctor.cm.eq.th_visit'), U.t('doctor.cm.eq.th_date')].concat(ext.dims ? DIMS.map(function (k) { return U.t(k); }).concat([U.t('doctor.cm.eq.profile_code')]) : [])
          .concat([U.t('doctor.cm.eq.vas'), pm.eqBaselinePoint ? U.t('doctor.cm.eq.pchc_row_n', { n: pm.eqBaselinePoint }) : U.t('doctor.cm.eq.th_change')]),
        num: ext.dims ? [2, 3, 4, 5, 6, 8] : [2],
        rows: pm.visits.map(function (v) {
          // today's API sends VAS rows only: a gap may be an EQ-5D-5L filled without a VAS, so it is not called "missed"
          return [U.t('doctor.cm.eq.visit', { n: v.point }), v.day == null ? (ext.dims ? U.t('doctor.cm.eq.missed') : '–') : U.fmtDay(v.day, 'long')]
            .concat(ext.dims ? (v.levels ? v.levels.concat([M.eqProfileCode(v.levels)]) : ['–', '–', '–', '–', '–', '–']) : [])
            .concat([v.vas == null ? '–' : v.vas, v.pchc ? U.t('doctor.cm.eq.pchc_' + v.pchc) : '–']);
        }) };
    };
    var eqBase = pm.visits.filter(function (v) { return v.levels; })[0];
    var eqTake = function () {
      var v = pm.vas; if (!v) return '';
      var word = vasWord(v);
      var lastLv = pm.visits.filter(function (x) { return x.levels; }).slice(-1)[0];
      return '<span class="ui-chart__num">' + v.latest + '</span><span class="ui-chart__unit">' + U.esc(U.t('doctor.cm.eq.vas')) + '</span><span class="ui-chart__text">' +
        (v.beyondMid ? '<b>' + U.esc(word) + '</b> (' + U.esc(U.t('doctor.ui.patient.take_vas_noticeable')) + ')' : U.esc(word)) +
        (lastLv && eqBase && lastLv !== eqBase ? ' · ' + U.esc(U.t('doctor.ui.patient.take_state', { now: M.eqProfileCode(lastLv.levels), first: M.eqProfileCode(eqBase.levels), point: eqBase.point })) : '') + '</span>';
    };
    var vasLegend = '<span class="ui-legend"><span class="ui-legend__item"><span class="ui-key" style="--c:var(--viz-band-neutral)"></span>' + U.esc(U.t('doctor.cm.eq.vas_band')) + '</span></span>';
    var eqViews = ext.dims ? [
      { v: 'profile', label: U.t('doctor.cm.eq.view_profile'), icon: 'grid', coord: 'heatmap', height: mobile ? 236 : 200, widthDependent: true,   // phones: wrapped dimension names need taller rows
        build: function (w) { return O.eqProfile(cm.eq, ctx(), eqSummary(), w); }, summary: eqSummary, table: eqTable, takeaway: eqTake,
        legend: [1, 2, 3, 4, 5].map(function (l) { return { name: U.t('doctor.cm.eq.level_n', { n: l }), color: T.eqLevel[l - 1] }; }).concat([{ name: U.t('doctor.cm.q.none'), key: 'empty', color: 'transparent' }]) },
      { v: 'levels', label: U.t('doctor.cm.eq.view_levels'), icon: 'bars', coord: 'cartesian', height: 214, widthDependent: true,
        build: function (w) { return O.eqLevels(cm.eq, ctx(), eqSummary(), w); }, summary: eqSummary, table: eqTable, takeaway: eqTake,
        legend: [1, 2, 3, 4, 5].map(function (l) { return { name: U.t('doctor.cm.eq.level_n', { n: l }), color: T.eqLevel[l - 1] }; }) }
    ] : [{ v: 'vas', label: U.t('doctor.cm.eq.vas'), coord: 'cartesian', height: 200, widthDependent: true,
      build: function (w) { return O.eqVas(cm.eq, ctx(), eqSummary(), w); }, summary: eqSummary, table: eqTable, takeaway: eqTake,
      legend: [{ name: U.t('doctor.cm.eq.vas_band'), color: 'var(--viz-band-neutral)' }] }];
    // a visit that is due now comes first; none after death. A visit whose due date has passed reads as due /
    // overdue, never as "Next visit" with a past date (the stats strip and "Coming up" say the same).
    var eqv = VM.eqVisitNotice(pm);
    var eqNote = !eqv ? '' : eqv.kind === 'overdue' ? U.t('doctor.cm.kpi.eq_overdue', { point: eqv.point, days: U.fmtDays(eqv.overdueDays) })
      : eqv.kind === 'due' ? U.t('doctor.cm.kpi.eq_due', { point: eqv.point }) + ' · ' + U.fmtDay(eqv.dueDay, 'long')
      : U.t('doctor.cm.eq.next_visit', { point: eqv.point, date: U.fmtDay(eqv.dueDay, 'long') });
    // one or two visits: the profile column is narrow (views/patient.css .pd-eq--few) and the VAS line fills the rest
    var eqFew = ext.dims && pm.visits.length <= 2;
    var eqCard = add({ id: 'pd-eq', span: ext.dims ? 'span-12' : 'span-6', fill: !ext.dims, reveal: 9, title: U.t('doctor.cm.eq.title'),
      hint: U.t(ext.dims ? 'doctor.cm.eq.hint' : 'doctor.cm.eq.hint_vas'), info: U.t('doctor.cm.eq.info'),
      mainSub: ext.dims ? '<span>' + nb(U.esc(U.t('doctor.ui.patient.eq_dims_sub'))) + '</span>' : '',
      views: eqViews, na: ext.dims ? null : U.t('doctor.ui.patient.na_dims'),
      // the VAS line stays beside both views (Profile and Summary), so the card never keeps an empty half
      extra: ext.dims ? { side: true, when: function () { return true; }, height: 200, widthDependent: true,
        sub: '<span>' + U.esc(U.t('doctor.cm.eq.hint_vas')) + '</span>' + vasLegend,
        build: function (w) { return O.eqVas(eqFew ? Object.assign({ fill: true }, cm.eq) : cm.eq, ctx(), vasSummary(), w); }, summary: vasSummary } : null,
      notes: eqNote ? [U.esc(eqNote)] : [],
      empty: function () {
        return pm.visits.some(function (v) { return v.status === 'done'; }) ? null
          : !eqv ? U.esc(self.tx('doctor.ui.patient.eq_none'))
          : eqv.kind !== 'next' ? U.esc(oneStop(self.tx('doctor.ui.patient.eq_none') + ' ' + eqNote + '.'))
          : U.esc(U.t('doctor.cm.eq.empty', { point: eqv.point, date: U.fmtDay(eqv.dueDay, 'long') }));
      } });
    if (eqFew) { eqCard.el.classList.add('pd-eq--few'); eqCard.el.style.setProperty('--eq-n', pm.visits.length); }

    // Bowel movements (+ pads, + symptom raster) --------------------------------
    var stoolIn = function () { return pm.stool.filter(inD); };
    var sSummary = function () {
      var s = stoolIn(); if (!s.length) return U.t('doctor.cm.stool.empty');
      return U.t('doctor.cm.stool.summary', { mean: U.fmtNum(M.mean(s.map(function (p) { return p.value; })), 1), n: tp('doctor.cm.common.n_diary_days', s.length) });
    };
    var sTable = function () {
      var byDay = {}; pm.daily.forEach(function (r) { byDay[r.day] = r; });
      var yn = function (v) { return v == null ? '–' : U.t('doctor.cm.sym.' + (v === 'Yes' ? 'yes' : v === 'No' ? 'no' : v === 'Liquid' ? 'leak_liquid' : v === 'Solid' ? 'leak_solid' : 'leak_none')); };
      return { caption: U.t('doctor.cm.stool.caption'),
        head: [U.t('doctor.cm.stool.th_date'), U.t('doctor.cm.stool.th_count')].concat(ext.sym ? [U.t('doctor.cm.stool.pads'), U.t('doctor.cm.sym.urgency'), U.t('doctor.cm.sym.night'), U.t('doctor.cm.sym.incomplete'), U.t('doctor.cm.sym.leakage')] : [])
          .concat([U.t('doctor.cm.bristol.th_type')]),
        num: ext.sym ? [1, 2, 7] : [1, 2],
        rows: stoolIn().slice().reverse().map(function (p) {
          var r = byDay[p.day] || {};
          return [U.fmtDay(p.day, 'long'), p.value].concat(ext.sym ? [r.pads_used, yn(r.urgency), yn(r.night_stools), yn(r.incomplete_evacuation), yn(r.leakage)] : [])
            .concat([r.bristol_scale == null ? '–' : r.bristol_scale]);
        }) };
    };
    var sTake = function () {
      if (kp.stool7.hidden) {                         // too few entries in the last 7 days: the mean of the range
        var s = stoolIn(); if (!s.length) return '';
        return '<span class="ui-chart__num">' + U.fmtNum(M.mean(s.map(function (p) { return p.value; })), 1) + '</span><span class="ui-chart__text">' + U.esc(self.tx('doctor.ui.patient.take_stool_range')) + '</span>';
      }
      return '<span class="ui-chart__num">' + U.fmtNum(kp.stool7.value, 1) + '</span><span class="ui-chart__text">' + U.esc(U.t('doctor.ui.patient.take_stool')) +
        (kp.stool7.firstWeek != null ? ' · ' + U.esc(U.t('doctor.ui.patient.take_stool_first', { v: U.fmtNum(kp.stool7.firstWeek, 1) })) : '') + '</span>';
    };
    var weeklyRange = function () { return M.diaryRange(range, pm.startDay, pm.today).days > C.DAILY_MAX_DAYS; };
    var rasterSummary = function () {
      var rows = cm.raster.rows, list = [['urgency', 'urgency'], ['night_stools', 'night'], ['incomplete_evacuation', 'incomplete'], ['leakage', 'leakage']].map(function (f) {
        var k = rows.filter(function (r) { return f[0] === 'leakage' ? r.leakage === 'Liquid' || r.leakage === 'Solid' : r[f[0]] === 'Yes'; }).length;
        return U.t('doctor.cm.sym.' + f[1]) + ' ' + k;
      });
      return self.tx('doctor.cm.sym.raster_summary', { n: tp('doctor.cm.common.n_diary_days', rows.length), list: list.join(', ') });
    };
    // the raster uses the trend's x-axis and grid, so each column sits under its bar; under the week-by-weekday
    // calendar it would be a second day scale
    var rasterExtra = ext.sym && cm.raster ? { when: function (v) { return v === 'trend'; }, height: 168, widthDependent: true, summary: rasterSummary,
      sub: function () {
        var daily = M.diaryRange(range, pm.startDay, pm.today).days <= C.RASTER_DAILY_MAX_DAYS;
        var keys = daily ? [[U.t('doctor.cm.sym.no'), T.seq[0]], [U.t('doctor.cm.sym.yes'), T.seq[4]], [U.t('doctor.cm.sym.leak_liquid'), T.seq[3]], [U.t('doctor.cm.sym.leak_solid'), T.seq[5]]]
          : [['0%', T.seq[0]], ['1–25%', T.seq[1]], ['26–50%', T.seq[2]], ['51–75%', T.seq[4]], ['76–100%', T.seq[5]]];     // the values' style ("80%")
        return '<span>' + U.esc(daily ? U.t('doctor.cm.sym.raster_hint_daily') : U.t('doctor.cm.sym.raster_hint_weekly')) + '</span><span class="ui-legend">' +
          keys.map(function (k) { return '<span class="ui-legend__item"><span class="ui-key" style="--c:' + k[1] + '"></span>' + U.esc(k[0]) + '</span>'; }).join('') + '</span>';
      },
      build: function (w) { return O.symptomRaster(cm.raster, ctx(), rasterSummary(), w); } } : null;
    add({ id: 'pd-stool', span: 'span-12', reveal: 11, title: U.t('doctor.cm.stool.title'), hint: U.t('doctor.cm.stool.hint'),
      na: ext.sym ? null : U.t('doctor.ui.patient.na_symptoms'), naView: 'trend', extra: rasterExtra,      // the raster's place: under the trend
      empty: function () { return stoolIn().length ? null : U.esc(U.t('doctor.cm.stool.empty')); },
      views: [
        { v: 'trend', label: U.t('doctor.cm.stool.view_trend'), icon: 'bars', coord: 'cartesian', group: 'pd-time', height: pm.pads && pm.pads.length ? 300 : 240,
          build: function () { return O.stoolTrend(cm.stool, ctx(), sSummary()); }, summary: sSummary, table: sTable, takeaway: sTake,
          legend: function () {
            return (weeklyRange() ? [{ name: U.t('doctor.cm.stool.series_weekly'), color: T.metricDiary }]
              : [{ name: U.t('doctor.cm.stool.series_daily'), color: 'color-mix(in srgb, ' + T.metricDiary + ' 35%, white)' }, { name: U.t('doctor.cm.stool.series_mean'), key: 'line', color: T.metricDiary }])
              .concat(pm.pads && pm.pads.length ? [{ name: U.t('doctor.cm.stool.pads'), color: T.metricDiary }] : []);
          },
          notes: function () { return diaryNote().concat(weeklyRange() ? [U.esc(U.t('doctor.cm.common.faint_low_n'))] : []); } },
        { v: 'calendar', label: U.t('doctor.cm.stool.view_calendar'), icon: 'calendar', coord: 'calendar', get height() { return calH('pd-stool', 40); }, widthDependent: true,
          build: function (w) { fitCal('pd-stool', 40); return O.stoolCalendar(cm.stool, ctx(), sSummary(), w); }, summary: sSummary, table: sTable, takeaway: sTake,
          legend: [{ name: U.t('doctor.cm.common.missing_vs_zero'), key: 'missed', color: 'transparent' }, { name: U.t('doctor.cm.stool.other_q'), key: 'dot', color: T.otherQ }],
          notes: function () { return calendarNote('pd-stool').concat(endNote()); } }
      ] });

    // Stool form (Bristol) ------------------------------------------------------
    var bst = function () { return cm.bristol.stats; };
    var bSummary = function () { var s = bst(), p = M.percentParts(s.normalShare); return p ? tp('doctor.cm.bristol.summary', s.n, { pct: p.value + '%' }) : ''; };
    var bTable = function () {
      var s = bst();
      return { caption: U.t('doctor.cm.bristol.caption'), head: [U.t('doctor.cm.bristol.th_type'), U.t('doctor.cm.bristol.th_desc'), U.t('doctor.cm.bristol.th_days'), U.t('doctor.cm.bristol.th_share')], num: [0, 2, 3],
        rows: s.counts.map(function (c, i) { return [i + 1, U.t('doctor.cm.bristol.desc_' + (i + 1)), c, s.n ? O._.pct(c / s.n) : '–']; }) };
    };
    var bTake = function () { var p = M.percentParts(bst().normalShare); return p ? '<span class="ui-chart__num">' + p.value + '%</span><span class="ui-chart__text">' + U.esc(U.t('doctor.ui.patient.take_bristol')) + '</span>' : ''; };
    var zoneLegend = [['hard', 'var(--viz-bristol-hard-zone)'], ['normal', 'var(--viz-bristol-normal-zone)'], ['loose', 'var(--viz-bristol-loose-zone)']]
      .map(function (z) { return { name: U.t('doctor.cm.bristol.zone_' + z[0] + '_range'), color: z[1] }; });
    var bNotes = function () { return diaryNote(); };
    add({ id: 'pd-bristol', span: 'span-6', fill: true, reveal: 10, title: U.t('doctor.cm.bristol.title'), hint: U.t('doctor.cm.bristol.hint'),
      notes: [U.esc(U.t('doctor.cm.bristol.default_note'))],
      empty: function () {
        if (!bst().n && !stoolIn().length) return U.esc(U.t('doctor.cm.stool.empty'));
        return bst().n < C.BRISTOL_MIN_N ? U.esc(U.t('doctor.cm.bristol.too_few', { n: bst().n })) : null;
      },
      views: [
        { v: 'types', label: U.t('doctor.cm.bristol.view_types'), icon: 'bars', coord: 'cartesian', height: 260, widthDependent: true,
          build: function (w) { return O.bristolTypes(cm.bristol, ctx(), bSummary(), w); }, summary: bSummary, table: bTable, takeaway: bTake, legend: zoneLegend, notes: bNotes },
        { v: 'zones', label: U.t('doctor.cm.bristol.view_zones'), icon: 'donut', coord: 'pie', height: 260,
          build: function () { return O.bristolZones(cm.bristol, ctx(), bSummary()); }, summary: bSummary, table: bTable, takeaway: bTake, legend: zoneLegend, notes: bNotes },
        { v: 'time', label: U.t('doctor.cm.bristol.view_time'), icon: 'calendar', coord: 'cartesian', group: 'pd-time', height: 260,
          build: function () { return O.bristolWeekly(cm.bristol, ctx(), bSummary()); }, summary: bSummary, table: bTable, takeaway: bTake, legend: zoneLegend, notes: bNotes }
      ] });

    // Bloating and impact -------------------------------------------------------
    var symIn = function (pts) { return pts.filter(inD); };
    var smMean = function (pts) { return U.fmtNum(M.mean(pts.map(function (p) { return p.value; })), 1); };
    var smSummary = function () {
      var b = symIn(pm.bloating), i = symIn(pm.impact); if (!b.length) return '';
      var k = b.filter(function (p) { return p.value >= 7; }).length;
      return self.tx('doctor.cm.symptoms.summary', { b: smMean(b), i: smMean(i), n: tp('doctor.cm.common.n_diary_days', b.length), k: k,
        high: U.tp('doctor.cm.symptoms.high_days', k, { k: k }) });
    };
    var smTake = function () { var b = symIn(pm.bloating), i = symIn(pm.impact); return b.length ? '<span class="ui-chart__text">' + U.esc(U.t('doctor.ui.patient.take_symptoms', { b: smMean(b), i: smMean(i) })) + '</span>' : ''; };
    var smTable = function () {
      var im = {}; pm.impact.forEach(function (p) { im[p.day] = p.value; });
      return { caption: U.t('doctor.cm.symptoms.caption'), head: [U.t('doctor.cm.symptoms.th_date'), U.t('doctor.cm.symptoms.bloating'), U.t('doctor.cm.symptoms.impact')], num: [1, 2],
        rows: symIn(pm.bloating).slice().reverse().map(function (p) { return [U.fmtDay(p.day, 'long'), p.value, im[p.day]]; }) };
    };
    add({ id: 'pd-sym', span: ext.monthly ? 'span-6' : 'span-12', fill: true, reveal: 12, title: U.t('doctor.cm.symptoms.title'), hint: U.t('doctor.cm.symptoms.hint'),
      empty: function () { return symIn(pm.bloating).length ? null : U.esc(U.t('doctor.cm.stool.empty')); },
      views: [
        { v: 'trend', label: U.t('doctor.cm.symptoms.view_trend'), icon: 'line', coord: 'cartesian', group: 'pd-time', height: 240,
          build: function () { return O.symptomsTrend(cm.symptoms, ctx(), smSummary()); }, summary: smSummary, table: smTable, takeaway: smTake, notes: diaryNote,
          legend: [{ name: U.t('doctor.cm.symptoms.bloating'), key: 'line', color: T.chart[3], toggle: true }, { name: U.t('doctor.cm.symptoms.impact'), key: 'line', color: T.chart[4], toggle: true }] },
        { v: 'dist', label: U.t('doctor.cm.symptoms.view_dist'), icon: 'bars', coord: 'cartesian', height: 240,
          build: function () { return O.symptomsDistribution(cm.symptoms, ctx(), smSummary()); }, summary: smSummary, table: smTable, takeaway: smTake, notes: diaryNote,
          legend: ['sev_none', 'sev_mild', 'sev_moderate', 'sev_severe'].map(function (k, i) { return { name: U.t('doctor.cm.symptoms.' + k), color: T.seq[[0, 2, 3, 5][i]] }; }) }
      ] });

    // Monthly quality of life (API v2 only) ------------------------------------
    if (ext.monthly) {
      var mIn = function () { return (pm.monthly || []).filter(inR); };
      var BURDEN = ['avoid_travel', 'avoid_social', 'embarrassed', 'worry_notice', 'depressed'];
      // the end keys of the answer scale ("1 not at all … 4 very much"), from the patient app's "1 = …, 4 = …"
      var scaleEnds = U.t('app.desc_1_4').match(/^1\s*=\s*(.+?),\s*4\s*=\s*(.+)$/) || [];
      var moSummary = function () {
        var r = mIn(); if (!r.length) return U.t('doctor.cm.monthly.empty');
        var l = r[r.length - 1];
        return U.t('doctor.cm.monthly.summary', { c: l.control, s: l.satisfaction, b: U.fmtNum(M.mean(BURDEN.map(function (k) { return l[k]; })), 1) });
      };
      var moTake = function () { var r = mIn(); if (!r.length) return ''; var l = r[r.length - 1]; return '<span class="ui-chart__text">' + U.esc(U.t('doctor.ui.patient.take_monthly', { c: l.control, s: l.satisfaction, month: U.fmtDay(l.day, 'short') })) + '</span>'; };
      var moTable = function () {
        return { caption: U.t('doctor.cm.monthly.caption'),
          head: [U.t('doctor.cm.stool.th_date'), U.t('app.avoid_traveling'), U.t('app.avoid_social'), U.t('app.feel_embarrassed'), U.t('app.worry_others_notice'), U.t('app.feel_depressed'),
            U.t('app.feel_in_control'), U.t('app.satisfaction'), self.tx('doctor.cm.monthly.th_qol')],
          num: [1, 2, 3, 4, 5, 6, 7, 8],
          rows: mIn().slice().reverse().map(function (r) { return [U.fmtDay(r.day, 'long'), r.avoid_travel, r.avoid_social, r.embarrassed, r.worry_notice, r.depressed, r.control, r.satisfaction, r.qol_score]; }) };
      };
      add({ id: 'pd-monthly', span: 'span-6', fill: true, reveal: 13, title: U.t('doctor.cm.monthly.title'), hint: U.t('doctor.cm.monthly.hint_burden'),
        empty: function () { return mIn().length ? null : U.esc(U.t('doctor.cm.monthly.empty')); },
        views: [
          { v: 'items', label: U.t('doctor.cm.monthly.view_items'), icon: 'grid', coord: 'heatmap', height: 196, widthDependent: true, hint: U.t('doctor.cm.monthly.hint_burden'),
            build: function (w) { return O.monthlyBurden(cm.monthly, ctx(), moSummary(), w); }, summary: moSummary, table: moTable, takeaway: moTake,
            legend: [1, 2, 3, 4].map(function (l) { return { name: String(l) + (l === 1 && scaleEnds[1] ? ' ' + scaleEnds[1] : l === 4 && scaleEnds[2] ? ' ' + scaleEnds[2] : ''), color: T.seq[[0, 2, 3, 5][l - 1]] }; }) },
          { v: 'scores', label: U.t('doctor.ui.patient.view_scores'), icon: 'line', coord: 'cartesian', group: 'pd-time', height: 196, hint: U.t('doctor.cm.monthly.hint_scores'),
            build: function () { return O.monthlyScores(cm.monthly, ctx(), moSummary()); }, summary: moSummary, table: moTable, takeaway: moTake,
            legend: [{ name: U.t('app.feel_in_control'), key: 'line', color: T.chart[2], toggle: true }, { name: U.t('app.satisfaction'), key: 'line', color: T.chart[3], toggle: true }] }
        ] });
    }

    // Questionnaires (adherence over the range) ---------------------------------
    var qPrefix = function (p) { return ext.monthly ? p.prefix : '≥ '; };                 // A26
    var qSummary = function () { var q = cm.q.adherence, p = M.percentParts(q.ratio); return p ? tp('doctor.cm.q.summary', q.expected, { done: q.done, expected: q.expected, pct: qPrefix(p) + p.value + '%' }) : ''; };
    var qTake = function () { var q = cm.q.adherence, p = M.percentParts(q.ratio); return p ? '<span class="ui-chart__num">' + U.esc(qPrefix(p)) + p.value + '%</span><span class="ui-chart__text">' + U.esc(U.t('doctor.ui.patient.take_q', { done: q.done, expected: q.expected })) + '</span>' : ''; };
    var qLegend = ['daily', 'weekly', 'monthly', 'eq5d5l'].filter(function (k) { return k !== 'monthly' || ext.monthly; })
      .map(function (k) { return { name: U.t('doctor.cm.q.type_' + k), color: T.q[k], key: 'q-' + k }; })
      .concat([{ name: U.t('doctor.cm.q.none'), key: 'missed', color: 'transparent' }]);
    var qTable = function () {
      var dr = M.diaryRange(range, pm.startDay, pm.today), out = [];
      var lastDay = Math.min(dr.to, pm.trackEnd - 1);                                        // a deceased patient: until the status change
      for (var w = M.isoWeekStart(lastDay); lastDay >= dr.from && w + 6 >= dr.from; w -= 7) {
        var n = 0, exp = 0;
        for (var dd = Math.max(w, dr.from); dd < w + 7 && dd <= lastDay; dd++) { exp++; if (pm.act.has(dd)) n++; }
        out.push([U.fmtDay(Math.max(w, dr.from), 'long'), n, exp]);
      }
      return { caption: U.t('doctor.cm.q.caption'), head: [U.t('doctor.cm.q.th_week'), U.t('doctor.cm.q.th_days'), U.t('doctor.cm.q.th_expected')], num: [1, 2], rows: out };
    };
    add({ id: 'pd-q', span: ext.monthly ? 'span-6' : 'span-12', fill: true, reveal: 14, title: U.t('doctor.cm.q.title'), hint: U.t('doctor.cm.q.hint'),
      notes: ext.monthly ? [] : [U.esc(U.t('doctor.cm.q.monthly_missing'))],
      empty: function () {
        var any = false; pm.act.forEach(function (t, day) { if (day >= range.from && day <= range.to) any = true; });
        return any ? null : U.esc(dead ? self.tx('doctor.ui.patient.q_empty_ended') : U.t('doctor.ui.patient.q_empty'));   // no "yet" after death
      },
      views: [
        { v: 'calendar', label: U.t('doctor.cm.q.view_calendar'), icon: 'calendar', coord: 'calendar', get height() { return calH('pd-q', 16); }, widthDependent: true,
          build: function (w) { fitCal('pd-q', 16); return O.questionnaireCalendar(cm.q, ctx(), qSummary(), w); }, summary: qSummary, table: qTable, takeaway: qTake, legend: qLegend,
          notes: function () { return calendarNote('pd-q').concat(endNote()); } },
        { v: 'weekly', label: U.t('doctor.cm.q.view_weekly'), icon: 'bars', coord: 'cartesian', group: 'pd-time', height: 180,
          build: function () { return O.questionnaireWeekly(cm.q, ctx(), qSummary()); }, summary: qSummary, table: qTable, takeaway: qTake, legend: qLegend.slice(0, -1),
          notes: function () { return diaryNote().concat(endNote()); } }
      ] });

    // Steps (hidden when the patient never synced steps) ------------------------
    if (pm.steps.length) {
      var stIn = function () { return pm.steps.filter(inD); };
      var stSummary = function () {
        var s = stIn(); if (!s.length) return U.t('doctor.cm.steps.empty_range');
        return tp('doctor.cm.steps.summary', s.length, { mean: U.fmtNum(Math.round(M.mean(s.map(function (p) { return p.value; })))), m7: kp.steps7.hidden ? '–' : U.fmtNum(Math.round(kp.steps7.value)) });
      };
      var stTake = function () { return kp.steps7.hidden ? '' : '<span class="ui-chart__num">' + U.fmtNum(Math.round(kp.steps7.value)) + '</span><span class="ui-chart__text">' + U.esc(U.t('doctor.ui.patient.take_steps')) + '</span>'; };
      var stTable = function () {
        var mean = {}; cm.steps.mean.forEach(function (m) { mean[m.day] = m.value; });
        return { caption: U.t('doctor.cm.steps.caption'), head: [U.t('doctor.cm.steps.th_date'), U.t('doctor.cm.steps.th_steps'), U.t('doctor.cm.steps.series_mean')], num: [1, 2],
          rows: stIn().slice().reverse().map(function (p) { return [U.fmtDay(p.day, 'long'), U.fmtNum(p.value), mean[p.day] == null ? '–' : U.fmtNum(Math.round(mean[p.day]))]; }) };
      };
      var longSteps = function () { return M.diaryRange(range, pm.startDay, pm.today).days > C.DAILY_MAX_DAYS; };
      add({ id: 'pd-steps', span: 'span-12', reveal: 15, title: U.t('doctor.cm.steps.title'), hint: U.t('doctor.cm.steps.hint'),
        empty: function () { return stIn().length ? null : U.esc(U.t('doctor.cm.steps.empty_range')); },
        views: [
          { v: 'daily', label: U.t('doctor.cm.steps.view_daily'), icon: 'bars', coord: 'cartesian', group: 'pd-time', height: 220,
            build: function () { return O.stepsDaily(cm.steps, ctx(), stSummary()); }, summary: stSummary, table: stTable, takeaway: stTake,
            legend: function () {
              return longSteps() ? [{ name: U.t('doctor.cm.steps.series_mean'), key: 'line', color: T.metricSteps }]
                : [{ name: U.t('doctor.cm.steps.series_daily'), color: 'color-mix(in srgb, ' + T.metricSteps + ' 35%, white)', toggle: true }, { name: U.t('doctor.cm.steps.series_mean'), key: 'line', color: T.metricSteps, toggle: true }];
            },
            notes: function () { return diaryNote().concat(longSteps() ? [U.esc(U.t('doctor.cm.steps.long_range_note'))] : []); } },
          { v: 'weekly', label: U.t('doctor.cm.steps.view_weekly'), icon: 'calendar', coord: 'cartesian', group: 'pd-time', height: 220,
            build: function () { return O.stepsWeekly(cm.steps, ctx(), stSummary()); }, summary: stSummary, table: stTable, takeaway: stTake, notes: diaryNote,
            legend: [{ name: U.t('doctor.cm.steps.series_weekly'), color: T.metricSteps }] }
        ] });
    }

    // Food and drinks — last (least clinically urgent); phones default to "How often" --------------
    var dRows = function () { return cm.diet.rows; };
    var dSummary = function () {
      var rows = dRows(); if (!rows.length) return U.t('doctor.cm.stool.empty');
      var st = O.DIET_ROWS.map(function (r) { return { label: U.t(r[2]), s: M.dietItemStats(rows, r[0], r[1]) }; })
        .filter(function (x) { return x.s.share != null; }).sort(function (x, y) { return y.s.share - x.s.share; }).slice(0, 3);
      return U.t('doctor.cm.diet.summary', { list: st.map(function (x) { return x.label + ' ' + O._.pct(x.s.share); }).join(', '), n: tp('doctor.cm.common.n_diary_days', rows.length) });
    };
    var dTable = function () {
      var rows = dRows();
      return { caption: U.t('doctor.cm.diet.caption'), head: [U.t('doctor.cm.diet.th_item'), U.t('doctor.cm.diet.th_unit'), U.t('doctor.cm.diet.th_days'), U.t('doctor.cm.diet.th_share'), U.t('doctor.cm.diet.th_mean'), U.t('doctor.cm.diet.th_max')], num: [2, 3, 4, 5],
        rows: O.DIET_ROWS.map(function (r) {
          var s = M.dietItemStats(rows, r[0], r[1]);
          return [U.t(r[2]), U.t('doctor.cm.unit.' + r[3]), s.daysConsumed, s.share == null ? '–' : O._.pct(s.share), s.meanPerDay == null ? '–' : U.fmtNum(s.meanPerDay, 1), s.max == null ? '–' : s.max];
        }) };
    };
    var dTake = function () { return '<span class="ui-chart__text">' + U.esc(dSummary()) + '</span>'; };
    var R = T.seq;
    add({ id: 'pd-diet', span: 'span-12', reveal: 16, title: U.t('doctor.cm.diet.title'), hint: U.t('doctor.cm.diet.hint'), info: U.t('doctor.cm.diet.info'),
      view: mobile ? 'freq' : 'heat', empty: function () { return dRows().length ? null : U.esc(U.t('doctor.cm.stool.empty')); },
      views: [
        { v: 'heat', label: U.t('doctor.cm.diet.view_heat'), icon: 'grid', coord: 'heatmap', height: 420, widthDependent: true,
          build: function (w) { return O.dietHeat(cm.diet, ctx(), dSummary(), w); }, summary: dSummary, table: dTable, takeaway: dTake, notes: diaryNote,
          legend: [['0', R[0]], ['≤ 1', R[1]], ['≤ 2', R[2]], ['≤ 4', R[3]], ['≤ 6', R[4]], ['> 6', R[5]]].map(function (x) { return { name: x[0], color: x[1] }; })
            .concat([{ name: U.t('doctor.cm.common.missing_vs_zero'), key: 'empty', color: 'transparent' }]) },
        { v: 'freq', label: U.t('doctor.cm.diet.view_freq'), icon: 'bars', coord: 'cartesian', height: 420,
          build: function () { return O.dietFrequency(cm.diet, ctx(), dSummary()); }, summary: dSummary, table: dTable, takeaway: dTake, notes: diaryNote }
      ] });

    // today's API (no EQ dimensions): the VAS-only EQ card pairs with Bristol on one row
    if (!ext.dims) grid.insertBefore(grid.querySelector('#card-pd-bristol'), grid.querySelector('#card-pd-stool'));

    // ---------------------------------------------------------- draw (the chart library loads in parallel with the data)
    cards.forEach(function (c) { c.render(); });
    ILARS_CHARTS.load().then(function () {
      if (self.cards !== cards) return;
      cards.forEach(function (c) { c.refresh(); });
    }, function () {
      if (self.cards !== cards) return;
      cards.forEach(function (c) { c.failed(); });
    });
    if (!o.quiet) { U.reveal(root); U.countAll(root.querySelector('.pd-kpis')); }
    // the link group is filled before the focus moves: after link / unlink the focus goes to its new button
    if (d.lt && !d.regFailed && !d.regPending) this.renderRegistryLink(root.querySelector('#patient-registry-link'), code, d.linked);
    if (hadFocus) { var h1 = root.querySelector('h1'); if (h1) h1.focus({ preventScroll: true }); }   // focus survives the data render
    if (o.focus || keepFocus) { var f = root.querySelector(o.focus || keepFocus); if (f) f.focus({ preventScroll: true }); }

    // ---------------------------------------------------------- range / axis / patterns
    var rerange = function () {
      range = M.rangeWindow(rangeKey, pm.startDay, pm.today);
      cm = VM.cardModels(pm, range);
      rangeLabel();
      cards.forEach(function (c) { c.refresh(); });
    };
    U.seg(root.querySelector('#pd-range-seg'), function (v) { rangeKey = v; self.store('ilars_pd_range', v); rerange(); }, { debounce: 150 });
    var axisSeg = U.seg(root.querySelector('#pd-axis-seg'), function (v) { axis = v; self.store('ilars_pd_axis', v); rerange(); }, { debounce: 150 });
    var more = root.querySelector('[data-act="range-more"]');
    more.addEventListener('click', function (e) {
      e.stopPropagation();
      var items = [{ id: 'pd-patterns-item', label: U.t('doctor.cm.common.patterns'), checked: !!ILARS_CHARTS.patterns,
        onSelect: function () { ILARS_CHARTS.patterns = !ILARS_CHARTS.patterns; self.store('ilars_chart_patterns', ILARS_CHARTS.patterns ? '1' : '0'); rerange(); } }];
      // the axis choice is hidden below 960 px (views/patient.css): the menu carries it then
      if (!root.querySelector('#pd-axis-seg').getClientRects().length) {
        items = [{ head: U.t('doctor.cm.axis.label') }].concat(['date', 'study'].concat(surgeryKind ? ['surgery'] : []).map(function (k) {
          return { label: U.t('doctor.cm.axis.' + (k === 'surgery' && surgeryKind === 'closure' ? 'closure' : k)), checked: axis === k,
            onSelect: function () { axis = k; self.store('ilars_pd_axis', k); axisSeg.select(k); rerange(); } };
        })).concat([{ sep: true }], items);
      }
      var menu = U.menu(more, items, { align: 'end', label: U.t('doctor.ui.range.more') });
      // "Patterns" is an on/off toggle, not one of a set of choices (UI.menu marks every checked item as a radio)
      var pi = menu && menu.querySelector('#pd-patterns-item');
      if (pi) pi.setAttribute('role', 'menuitemcheckbox');
    });

    // ---------------------------------------------------------- header actions
    root.querySelector('[data-act="copy"]').addEventListener('click', function () { self.copyCode(code); });
    var sbtn = root.querySelector('#patient-change-status');
    if (sbtn) sbtn.addEventListener('click', function (e) {
      e.stopPropagation();
      U.menu(sbtn, [{ head: U.t('doctor.ui.patient.status_menu') }].concat(['active', 'inactive', 'dead'].map(function (k) {
        return { label: self.statusWord(k), checked: status === k, onSelect: function () { if (k !== status) self.changeStatus(root, status, k); } };
      })), { label: U.t('doctor.ui.patient.change_status') });
    });
    var mb = root.querySelector('[data-act="more"]');
    mb.addEventListener('click', function (e) {
      e.stopPropagation();
      U.menu(mb, [].concat(d.canEditName ? [{ label: U.t('doctor.ui.patient.edit_name'), icon: 'pencil', onSelect: function () { self.editName(mb); } }] : [])
        .concat([{ label: U.t('doctor.ui.patient.copy_code'), icon: 'copy', onSelect: function () { self.copyCode(code); } }]), { align: 'end', label: U.t('doctor.ui.common.more') });
    });
    var en = root.querySelector('#btn-edit-patient-name');
    if (en) en.addEventListener('click', function () { self.editName(en); });

    // ---------------------------------------------------------- after render: doctor label, stepper (lists load in parallel)
    var seq = this.seq;
    ILARS_DATA.store.patients().then(function (list) {
      if (seq !== self.seq) return;
      var r = ((list && list.rows) || []).filter(function (x) { return x.patient_code === code; })[0];
      var el = root.querySelector('[data-part="doctor"]');
      if (!r || !el) return;
      var mine = d.me && r.doctor_code && r.doctor_code === d.me.doctor_code;
      var f = (r.doctor_first_name || '').trim(), l = (r.doctor_last_name || '').trim();
      var label = mine ? U.t('doctor.ui.common.you') : (l || f ? (f ? f.charAt(0).toUpperCase() + '. ' : '') + l : (r.doctor_code || ''));
      var hel = root.querySelector('[data-part="hospital"]');
      if (hel && r.hospital_name) { hel.textContent = r.hospital_name; hel.hidden = false; }
      if (!label) return;
      el.textContent = label; el.hidden = false;
    }, function () { /* the doctor label is optional */ });
    this.listOrder().then(function (order) { if (seq === self.seq) self.paintStepper(root, order); });
  }

  // ================================================================== summary card
  paintSummary() {
    var el = this.sumEl;
    if (!el || !this.d || !document.contains(el)) return;
    el.innerHTML = this.summaryHtml(this.d, this.pm);
    this.bindSummary(el);
  }

  summaryHtml(d, pm) {
    var U = ILARS_UI, M = ILARS_METRICS, self = this;
    var dot = function (s) { return s === 'active' ? 'var(--color-patient-active-dot)' : s === 'dead' ? 'var(--color-patient-deceased-dot)' : 'var(--color-patient-inactive-dot)'; };
    var registered = '<li style="--c:var(--color-accent)"><span class="pd-timeline__dot"></span><span class="pd-timeline__what"><b>' + U.esc(this.tx('doctor.ui.patient.registered_row')) + '</b>' +
      (this.hist.state === 'ok' && !this.hist.rows.length ? '<span class="t-secondary">' + U.esc(U.t('doctor.ui.patient.no_status_changes')) + '</span>' : '') + '</span>' +
      '<span class="pd-timeline__when">' + U.esc(U.fmtDay(pm.startDay, 'long')) + '</span></li>';
    var timeline;
    if (this.hist.state === 'loading') {
      timeline = '<ol class="pd-timeline" id="patient-status-history" aria-busy="true"><li class="pd-timeline__skel" aria-hidden="true"><span class="ui-skel ui-skel--circle"></span><span class="ui-skel ui-skel--text"></span><span class="ui-skel ui-skel--text"></span></li>' + registered + '</ol>';
    } else if (this.hist.state === 'failed') {
      timeline = '<div class="pd-hist-failed" id="patient-status-history" role="status"><span>' + U.esc(U.t('doctor.ui.patient.history_failed')) + '</span>' +
        '<button class="ui-btn ui-btn--secondary ui-btn--sm" type="button" data-act="hist-retry">' + U.icon('refresh', 'i--sm') + '<span>' + U.esc(U.t('doctor.ui.common.retry')) + '</span></button></div>';
    } else {
      var hist = this.hist.rows.slice().sort(function (x, y) { return x.changed_at < y.changed_at ? 1 : -1; });
      timeline = '<ol class="pd-timeline" id="patient-status-history">' + hist.map(function (h, i) {
        var day = M.dayFromTimestamp(h.changed_at);
        return '<li style="--c:' + dot(h.new_status) + '"><span class="pd-timeline__dot"></span><span class="pd-timeline__what"><b>' + U.esc(self.statusWord(h.new_status)) + '</b>' +
          (i === 0 ? '<span class="ui-badge pd-timeline__tag">' + U.esc(U.t('doctor.ui.patient.current')) + '</span>' : '') +
          (h.reason ? '<span class="t-secondary">' + U.esc(h.reason) + '</span>' : '') + '</span>' +
          '<span class="pd-timeline__when">' + U.esc(day != null ? U.fmtDay(day, 'long') : '') +
          (d.readOnly ? '' : '<button class="ui-icon-btn ui-icon-btn--sm" type="button" data-del="' + U.esc(h.id) + '" aria-label="' + U.esc(U.t('doctor.ui.patient.delete_change')) + '" title="' + U.esc(U.t('doctor.ui.patient.delete_change')) + '">' + U.icon('trash', 'i--xs') + '</button>') + '</span></li>';
      }).join('') + registered + '</ol>';
    }
    var reg = '', r = d.regFailed ? null : d.linked;
    if (r) {
      var op = M.parseDay(r.operation_date || r.index_operation_date), cl = M.parseDay(r.ileostomy_closure_date);
      reg = '<div class="pd-summary__sec"><div class="pd-summary__h"><span>' + U.esc(U.t('doctor.ui.patient.surgery_title')) + '</span><span class="ui-badge">' + U.esc(U.t('doctor.ui.patient.linked_record')) + '</span></div><dl class="pd-kv">' +
        (op != null ? '<dt>' + U.esc(U.t('doctor.ui.patient.operation')) + '</dt><dd>' + U.esc((r.operation_type ? r.operation_type + ' · ' : '') + U.fmtDay(op, 'long')) + '</dd>' : '') +
        (cl != null ? '<dt>' + U.esc(U.t('doctor.ui.patient.stoma_closure')) + '</dt><dd>' + U.esc(U.fmtDay(cl, 'long')) + '</dd>' : '') +
        (r.lars_baseline != null ? '<dt>' + U.esc(U.t('doctor.ui.patient.preop_lars')) + '</dt><dd>' + U.esc(r.lars_baseline) + ' ' + this.larsChip(M.larsCategory(r.lars_baseline)) + '</dd>' : '') + '</dl></div>';
    }
    // 30-day tracker: one cell per completed day, the day's priority type (EQ-5D > monthly > weekly > daily), colour AND pattern.
    // Not missed (quiet slot, no dashed cell): days before registration, and every day of a deceased patient (not tracked, §4.4).
    var cells = [], kinds = {}, monthlyKnown = pm.caps.monthly, dead = pm.status === 'dead', notTracked = U.t('doctor.cm.list.not_tracked');
    for (var day = pm.today - 30; day <= pm.today - 1; day++) {
      var before = day < pm.startDay, ty = before ? null : pm.act.get(day);
      var kind = before ? 'pre' : ty ? 't-' + ty : dead ? 'off' : 'none';
      kinds[kind] = 1;
      var tip = U.fmtDay(day, 'long') + ' · ' + (before ? this.tx('doctor.ui.patient.before_registration') : ty ? U.t('doctor.cm.q.type_' + ty) : dead ? notTracked : U.t('doctor.cm.q.none'));
      cells.push('<span class="' + kind + '"' + (ty ? ' style="--c:var(--viz-cal-' + (ty === 'eq5d5l' ? 'eq5d' : ty) + ')"' : '') + ' title="' + U.esc(tip) + '"></span>');
    }
    var adh = M.adherence30(pm.act, pm.startDay, pm.today);
    var countTxt = dead ? notTracked : adh.ratio == null ? U.t('doctor.cm.common.too_early')
      : (monthlyKnown ? '' : '≥ ') + U.tp('doctor.ui.patient.q_days', adh.expected, { done: adh.done, expected: adh.expected });
    // legend: only the kinds that are drawn
    var legend = ['daily', 'weekly', 'monthly', 'eq5d5l'].filter(function (k) { return kinds['t-' + k]; }).map(function (k) {
      return '<span><span class="ui-key t-' + k + '" style="--c:var(--viz-cal-' + (k === 'eq5d5l' ? 'eq5d' : k) + ')"></span>' + U.esc(U.t('doctor.cm.q.type_' + k)) + '</span>';
    }).join('') + (kinds.none ? '<span><span class="ui-key ui-key--missed"></span>' + U.esc(U.t('doctor.cm.q.none')) + '</span>' : '') +
      (kinds.pre ? '<span><span class="ui-key pd-key-pre"></span>' + U.esc(this.tx('doctor.ui.patient.before_registration_key')) + '</span>' : '');
    // none after death; a visit past its due date never reads as plain "coming up" with a past date
    var ev = ILARS_VIEW_MODELS.eqVisitNotice(pm), next = '';
    if (ev && ev.kind === 'overdue') next = '<li class="warn"><span>' + U.esc(U.t('doctor.ui.patient.next_eq', { point: ev.point })) + '</span><span>' +
      U.esc(U.t('doctor.ui.patient.due_overdue', { date: U.fmtDay(ev.dueDay, 'short') })) + '</span></li>';
    else if (ev && ev.kind === 'due') next = '<li><span>' + U.esc(U.t('doctor.cm.kpi.eq_due', { point: ev.point })) + '</span><span>' + U.esc(U.fmtDay(ev.dueDay, 'short')) + '</span></li>';
    else if (ev) next = '<li><span>' + U.esc(U.t('doctor.ui.patient.next_eq', { point: ev.point })) + '</span><span>' + U.esc(U.fmtDay(ev.dueDay, 'long')) + '</span></li>';
    return '<div class="pd-summary__sec"><div class="pd-summary__h"><span>' + U.esc(U.t('doctor.ui.patient.status_history')) + '</span></div>' + timeline + '</div>' + reg +
      '<div class="pd-summary__sec"><div class="pd-summary__h"><span>' + U.esc(U.t('doctor.ui.patient.q_last30')) + '</span><span class="pd-summary__value"' + (monthlyKnown || dead ? '' : ' title="' + U.esc(U.t('doctor.cm.kpi.adherence_monthly_note')) + '"') + '>' + U.esc(countTxt) + '</span></div>' +
        '<div class="pd-tracker" role="img" aria-label="' + U.esc(dead || adh.ratio == null ? countTxt : U.tp('doctor.cm.kpi.adherence_meta', adh.expected, { done: adh.done, expected: adh.expected })) + '">' + cells.join('') + '</div>' +
        (legend ? '<div class="pd-tracker-legend">' + legend + '</div>' : '') +
        (next ? '<div class="pd-summary__h pd-summary__h--sub">' + U.esc(U.t('doctor.ui.patient.coming_up')) + '</div><ul class="pd-next">' + next + '</ul>' : '') + '</div>';
  }

  bindSummary(el) {
    var self = this, U = ILARS_UI;
    var retry = el.querySelector('[data-act="hist-retry"]');
    if (retry) retry.addEventListener('click', function () { self.loadHistory(self.code, self.seq); });
    el.querySelectorAll('[data-del]').forEach(function (b) {
      b.addEventListener('click', function () {
        var h = self.hist.rows.filter(function (x) { return String(x.id) === b.dataset.del; })[0];
        if (!h) return;
        // only deleting the newest change reverts the status (backend delete_patient_status_change: is_latest);
        // an older row goes from the history and the current status stays
        var newest = self.hist.rows.every(function (x) { return x === h || x.changed_at < h.changed_at; });
        var text = newest ? U.t('doctor.ui.status.delete_text', { status: self.statusWord(h.previous_status) })
          : self.tx('doctor.ui.status.delete_text_keep', { status: self.statusWord(self.pm ? self.pm.status : self.d.detail.patient_status) });
        U.confirm({ title: U.t('doctor.ui.status.delete_title'), text: text,
          confirmLabel: U.t('doctor.ui.status.delete_btn'), danger: true, failTitle: U.t('doctor.ui.status.delete_failed'),
          action: function () { return self.api.deletePatientStatusChange(h.id); } })
          .then(function (ok) {
            if (!ok) return;
            ILARS_DATA.store.invalidate('patients');
            self.load(self.code);                         // the status may have gone back: reload the patient
            // the trash button is gone with the reload: the focus goes to the patient's name (kept by render)
            var h1 = document.querySelector('#patient-detail-view h1');
            if (h1) h1.focus({ preventScroll: true });
          });
      });
    });
  }

  // ================================================================== status, name
  changeStatus(root, from, to) {
    var U = ILARS_UI, self = this, d = this.d;
    var today = U.fmtDay(this.pm ? this.pm.today : ILARS_METRICS.todayDay(d.detail.server_today), 'long');   // server's today, as the page and the history row
    // same wording style as the delete confirm (curly quotes, a statement under the question title)
    var text = this.tx('doctor.ui.status.confirm_text', { old_status: this.statusWord(from), new_status: this.statusWord(to), date: today });
    U.confirm({ title: U.t('doctor.ui.status.confirm_title'), text: text, confirmLabel: U.t('doctor.ui.status.confirm_btn'), icon: 'user',
      failTitle: U.t('doctor.ui.status.failed_title'), action: function () { return self.api.updatePatientStatus(d.detail.patient_code || self.code, to); } })
      .then(function (ok) {
        if (!ok || self.d !== d) return;
        ILARS_DATA.store.invalidate('patients');
        d.detail.patient_status = to;
        d.deathHint = to === 'dead' && self.pm ? self.pm.today : null;     // the new history row is dated today
        self.render(root, d, { quiet: true, focus: '#patient-change-status' });
        self.loadHistory(self.code, self.seq);
        U.toast(U.t('doctor.ui.status.changed', { status: self.statusWord(to) }));
      });
  }

  editName(opener) {
    var U = ILARS_UI, self = this, dlg = document.getElementById('edit-patient-name-modal');
    if (!dlg || !this.d) return;
    var first = document.getElementById('edit-patient-first-name'), last = document.getElementById('edit-patient-last-name');
    first.value = this.d.first || ''; last.value = this.d.last || '';           // the stored split, never re-split from the display name
    document.getElementById('edit-patient-name-error').hidden = true;
    if (!dlg._pdBound) {
      dlg._pdBound = true;
      U.dialogForm(dlg, { error: document.getElementById('edit-patient-name-error'), errorTitle: U.t('doctor.ui.edit.failed'),
        submit: function () {
          var code = self.code, d = self.d, f = first.value.trim(), l = last.value.trim();
          var auth = window.ILARS_AUTH, user = auth && auth.getCurrentUser && auth.getCurrentUser();
          if (!auth || !auth.db || !user) return Promise.reject(new Error(U.t('doctor.ui.common.error_generic')));
          return auth.db.collection('patients').doc(code).set({ firstName: f, lastName: l, doctorUid: user.uid }, { merge: true }).then(function () {
            var full = [f, l].filter(Boolean).join(' ');
            self.names[code] = full;
            var pl = window.PatientListView, nm = pl && (pl.names || (pl.data && pl.data.names));
            if (nm) nm[code] = full;                                   // the list shows the new name without a reload
            ILARS_DATA.store.invalidate('names');
            U.toast(U.t('doctor.ui.toast.name_saved'));
            if (self.d !== d || self.code !== code) return;
            d.name = full; d.first = f; d.last = l;
            var root = document.getElementById('patient-detail-view');
            setTimeout(function () { self.render(root, d, { quiet: true, focus: '#btn-edit-patient-name' }); }, 0);   // after the dialog returned focus
          });
        } });
    }
    U.openDialog(dlg, { focus: '#edit-patient-first-name' });
  }

  // ================================================================== LT registry link (same calls and Lithuanian strings as before)
  renderRegistryLink(cont, code, linked) {
    var U = ILARS_UI, self = this;
    if (!cont) return;
    cont.lang = 'lt';                                   // the registry wording stays Lithuanian in every UI language (WCAG 3.1.2)
    if (linked) {
      var label = function () { return 'Registras: ' + self.registryName(linked) + (linked.is_mine ? '' : ' (kito gydytojo įrašas)'); };
      cont.innerHTML = '<a class="reg-chip reg-chip-linked" href="#registry/' + encodeURIComponent(linked.id) + '"><span class="reg-chip__ic" aria-hidden="true">' + U.icon('link') + '</span><span data-part="reg-name">' + U.esc(label()) + '</span></a>' +
        (linked.is_mine ? '<button type="button" class="reg-btn reg-btn-link" id="pd-unlink-registry">Atsieti</button>' : '');
      var b = cont.querySelector('#pd-unlink-registry');
      if (b) b.addEventListener('click', function () { self.unlinkRegistry(cont, code, linked.id, b); });
      // the chip names the record as the picker does, also before the registry list was opened: once the doctor's
      // record names are read, only the label changes (the focus on Atsieti stays)
      if (linked.is_mine && !this.regNames && !(window.RegistryListView && window.RegistryListView.names && Object.keys(window.RegistryListView.names).length)) {
        this.registryNames().then(function () {
          var el = cont.querySelector('[data-part="reg-name"]');
          if (el && cont.isConnected) el.textContent = label();
        });
      }
    } else if (this.d && this.d.readOnly) {
      cont.hidden = true;                                 // another hospital's patient: linking is its own hospital's
    } else {
      cont.innerHTML = '<button type="button" class="reg-btn reg-btn-link pd-reglink__add" id="pd-link-registry">' + U.icon('link', 'i--sm') + '<span>Susieti su registru</span></button>';
      cont.querySelector('#pd-link-registry').addEventListener('click', function () { self.openRegistryPicker(cont, code); });
    }
  }

  /** The doctor's name for an own record: the registry list's names, else the ones registryNames() read (FUNC-19). */
  registryName(rec) {
    var R = window.RegistryListView, names = R && R.names && R.names[rec.id] ? R.names : this.regNames;
    if (rec.is_mine && names && names[rec.id]) {
      var d = names[rec.id], nm = [d.firstName, d.lastName].filter(Boolean).join(' ').trim();
      if (nm) return nm;
    }
    return rec.lin || rec.personal_id_code || 'įrašas';
  }

  /** After a link change: wait for the registry reload (RegistryListView.load(true) when the list exists), then
      re-render in place with the new row — chip, surgery section, surgery axis and pre-op line (no page reload). */
  afterLinkChange(code, focusSel) {
    var self = this, R = window.RegistryListView;
    var reload = R ? Promise.resolve(R.load(true)).then(function () { return R.cached || []; }) : this.api.getRegistryPatients().then(function (r) { return (r && r.patients) || []; });
    return reload.then(function (rows) {
      var d = self.d; if (!d || self.code !== code) return;
      d.linked = (rows || []).filter(function (x) { return x.study_patient_code === code; })[0] || null;
      self.render(document.getElementById('patient-detail-view'), d, { quiet: true, focus: focusSel });
    });
  }

  unlinkRegistry(cont, code, registryId, btn) {
    var U = ILARS_UI, self = this;
    btn.classList.add('is-loading'); btn.setAttribute('aria-busy', 'true');
    this.api.unlinkRegistryFromStudy(registryId)
      .then(function () { return self.afterLinkChange(code, '#pd-link-registry'); })
      .catch(function (e) {
        btn.classList.remove('is-loading'); btn.removeAttribute('aria-busy');
        U.toast('Klaida atsiejant: ' + ((e && e.message) || ''), 'error');
      });
  }

  /**
   * Names of the doctor's own registry records (Firestore registry_patients, the same query as the registry list),
   * so the picker and the chip read the same whether or not the registry list was opened first. A read is kept in
   * this.regNames for the chip (registryName). A failed read = no names.
   */
  registryNames() {
    var self = this, R = window.RegistryListView, auth = window.ILARS_AUTH, user = auth && auth.getCurrentUser && auth.getCurrentUser();
    if (R && R.names && Object.keys(R.names).length) return Promise.resolve(R.names);
    if (!auth || !auth.db || !user) return Promise.resolve({});
    return auth.db.collection('registry_patients').where('doctorUid', '==', user.uid).get().then(function (snap) {
      var out = {}; snap.forEach(function (doc) { out[doc.id] = doc.data(); }); self.regNames = out; return out;
    }, function (e) { console.warn('[patient] registry names read failed', e); return {}; });
  }

  openRegistryPicker(cont, code) {
    var U = ILARS_UI, self = this;
    Promise.all([this.api.getLinkableRegistryPatients(), this.registryNames()]).then(function (r) {
      var res = r[0], recs = (res && res.records) || [];
      var names = r[1] || {};
      var dlg = document.createElement('dialog');
      dlg.lang = 'lt';                                  // Lithuanian registry wording in every UI language (WCAG 3.1.2)
      dlg.className = 'registry-picker ui-dialog';
      dlg.setAttribute('aria-labelledby', 'pd-pick-title');
      dlg.innerHTML = '<div class="registry-picker-content"><div class="registry-picker-title" id="pd-pick-title">Pasirinkite registro įrašą</div><div class="registry-picker-list">' +
        (recs.map(function (r) {
          var n = names[r.id], nm = n ? [n.firstName, n.lastName].filter(Boolean).join(' ').trim() : '';
          return '<button type="button" class="reg-pick-item" data-id="' + U.esc(r.id) + '">' + U.esc(nm || r.lin || r.personal_id_code || 'Įrašas be LIN') + '</button>';   // never a raw id
        }).join('') || '<p class="reg-empty">Nėra laisvų registro įrašų.</p>') +
        '</div><button type="button" class="reg-btn reg-btn-secondary registry-picker-cancel">Atšaukti</button></div>';
      document.body.appendChild(dlg);
      U.openDialog(dlg, { onClose: function () { setTimeout(function () { dlg.remove(); }, 400); } });
      dlg.querySelector('.registry-picker-cancel').addEventListener('click', function () { U.closeDialog(dlg); });
      dlg.querySelectorAll('.reg-pick-item').forEach(function (it) {
        it.addEventListener('click', function () {
          if (dlg._busy) return;
          dlg._busy = true; it.setAttribute('aria-busy', 'true');
          self.api.linkRegistryToStudy(it.dataset.id, code)
            .then(function () { return self.afterLinkChange(code, null); })   // waits for the registry reload (bug fix)
            .then(function () {
              // the page behind the modal is inert until it closes: close first, then focus the new chip's
              // Atsieti (the picker's opener, "Susieti", is gone with the re-render)
              U.closeDialog(dlg, 'ok');
              var f = document.querySelector('#pd-unlink-registry') || document.querySelector('#patient-registry-link .reg-chip');
              if (f) f.focus({ preventScroll: true });
            }, function (e) {
              dlg._busy = false; it.removeAttribute('aria-busy');
              U.toast('Klaida susiejant: ' + ((e && e.message) || ''), 'error');
            });
        });
      });
    }, function (e) {
      console.error('Registry picker failed', e);
      U.toast(U.t('doctor.ui.common.error_generic'), 'error');
    });
  }
}

/** How long the page waits for the LT registry read after the patient data before it shows the skeleton chip. */
PatientDetailView.REG_GRACE_MS = 200;
/** How long the first paint of a deceased patient waits for the status history (the day tracking ended). */
PatientDetailView.HIST_GRACE_MS = 1000;

/** English defaults of the keys added by this view (design/i18n-additions/WP3.en.json) until en.json carries them. */
PatientDetailView.EN = {
  'doctor.cm.sym.raster_summary': 'Symptom days in this range ({n}): {list}.',
  'doctor.ui.patient.take_stool_range': 'per diary day, mean in this range',
  'doctor.ui.patient.before_registration_key': 'Before registration',
  'doctor.ui.patient.eq_none': 'No EQ-5D-5L questionnaire was filled in.',
  'doctor.cm.lars.ref_line': 'Reference line (first score)',
  'doctor.cm.lars.ref_lines': 'Reference lines (first score, pre-op)',
  'doctor.cm.monthly.th_qol': 'QoL score',
  'doctor.ui.patient.registered_row': 'Registered',
  'doctor.ui.patient.before_registration': 'before registration',
  'doctor.ui.patient.in_study_until': 'In study for {days}, until {date}',
  'doctor.ui.patient.q_empty_ended': 'No questionnaire in this time range.',
  'doctor.ui.patient.not_tracked_from': 'Not tracked from {date} ({status}).',
  'doctor.ui.status.confirm_text': 'The status changes from “{old_status}” to “{new_status}”, starting {date}.'
};
