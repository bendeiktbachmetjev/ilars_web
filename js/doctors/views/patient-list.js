/* views/patient-list.js — iLARS "Patients" tab (DESIGN-SPEC §4.2, CHARTS-METRICS §6 with Appendix A22/A23) and the
   create-patient dialog (#create-patient-modal, §4.7). Golden reference: design/golden/js/doctors/views/patients.js
   (list part) and golden-demo.js (create part).

   Data:  ILARS_DATA.store.patients()  one cached GET /getPatients?status=all, adapted (data/api-adapter.js)
          ILARS_DATA.store.names()     {code: "First Last"} from Firestore (the doctor's own patients)
          window.ILARS_PROFILE()       the one cached GET /doctors/me
          ILARS_VIEW_MODELS            data/cohort-model.js (scope, counts, filters, sorts — tested)
   Contract (tabs.js / app.js): window.PatientListView = new PatientListView(api); .show('patients', {restore}) on
   every #patients route render; .load(force) re-reads the list (force = the cached request is dropped first).
   State: sessionStorage.ilars_pl_state = {status, attention, sort}; localStorage.ilars_scope_v2 (shared with overview.js).
   Shared with overview.js and the patient page: PatientListView.data(), PatientListView.readScope() and the cell
   helpers larsChip() / attnChips() (global functions, as in the golden reference).
   Rule: untrusted text (names, codes, API strings) reaches HTML only through ILARS_UI.esc / fmtCode / textContent. */
/* global ILARS_UI, ILARS_DATA, ILARS_METRICS, ILARS_VIEW_MODELS, ILARS_CHART_OPTIONS, ILARS_CHARTS, OverviewView */
// v2: the first redesign build saved an automatic "My patients" default under 'ilars_scope'; that value is ignored
var SCOPE_KEY = 'ilars_scope_v2';
class PatientListView {
  constructor(api) {
    this.api = api;
    this.data = null;          // {list, me, today, names}
    this.back = null;          // {code, y, inner}: where the list was when a patient was opened
    this.st = PatientListView.readState();
    var self = this;
    // below 1440 px the Attention column moves next to Patient, so the reason never scrolls out of view
    this.narrow = window.matchMedia('(max-width: 1439px)');
    this.narrow.addEventListener('change', function () { if (self.data && self.visible()) self.renderList(); });
    window.addEventListener('resize', function () { self.fade(); }, { passive: true });
  }

  // ------------------------------------------------------------ shared state + data (also used by overview.js)
  /** sessionStorage outlives code changes: a stored state is trusted only as far as it is valid. */
  static readState() {
    var VM = ILARS_VIEW_MODELS, saved = {};
    try { saved = JSON.parse(sessionStorage.getItem('ilars_pl_state') || '{}') || {}; } catch (e) { saved = {}; }
    return { status: VM.validStatus(saved.status), attention: saved.attention === true, q: '', sort: VM.validSort(saved.sort),
      scope: PatientListView.readScope() };
  }
  /** 'mine' | 'all' | null (null = not chosen yet: the default follows the data, see scopeFor). */
  static readScope() {
    var s = null;
    try { s = localStorage.getItem(SCOPE_KEY); } catch (e) { /* private mode */ }
    return s === 'mine' || s === 'all' ? s : null;
  }
  static writeScope(scope) { try { localStorage.setItem(SCOPE_KEY, scope); } catch (e) { /* private mode */ } }
  /** Default scope: "All visible" (the doctor's own patients and the hospital's), as the portal always showed. */
  static scopeFor(stored) {
    return stored || 'all';
  }
  /** Overview "Show all N in the patient list": the list opens on Active with the attention toggle on. */
  static showAttentionOnly() {
    try {
      var saved = JSON.parse(sessionStorage.getItem('ilars_pl_state') || '{}') || {};
      saved.attention = true; saved.status = 'active';
      sessionStorage.setItem('ilars_pl_state', JSON.stringify(saved));
    } catch (e) { /* private mode */ }
    var inst = window.PatientListView;
    if (inst && inst instanceof PatientListView) { inst.st.attention = true; inst.st.status = 'active'; }
  }
  /** Everything both iLARS tabs need, from the shared caches: {list, me, today, names}. */
  static data() {
    var S = ILARS_DATA.store, M = ILARS_METRICS;
    return Promise.all([S.patients(), window.ILARS_PROFILE(), S.names().catch(function () { return {}; })]).then(function (r) {
      var list = r[0], me = (r[1] && r[1].profile) || {};
      var today = M.todayDay(list.today);
      ILARS_UI._today = today;          // relative dates follow the server's as_of_date when the API sends it
      return { list: list, me: me, today: today, names: Object.assign({}, r[2] || {}) };
    });
  }

  save() {
    try { sessionStorage.setItem('ilars_pl_state', JSON.stringify({ status: this.st.status, attention: this.st.attention, sort: this.st.sort })); } catch (e) { /* ignore */ }
    if (this.st.scope) PatientListView.writeScope(this.st.scope);
  }
  visible() {
    var region = document.getElementById('ilars-patients'), mode = document.getElementById('study-mode');
    return !!(region && !region.hidden && mode && mode.style.display !== 'none' && mode.offsetParent !== null);
  }
  /** Re-read the list. force: drop the cached request first (after create patient / a status change). Renders only
      when the list is on screen; otherwise the next show() fetches the fresh data. */
  load(force) {
    if (force) { ILARS_DATA.store.invalidate('patients'); this.data = null; }
    if (this.visible() || !force) return this.show('patients');
    return Promise.resolve();
  }

  // ------------------------------------------------------------ route entry + skeleton timing
  show(tab, opts) {
    opts = opts && typeof opts === 'object' ? opts : { force: !!opts };
    if (tab === 'overview' && typeof OverviewView === 'function') {   // tabs.js normally calls OverviewView itself
      if (!(window.OverviewView instanceof OverviewView)) window.OverviewView = new OverviewView(this.api);
      return window.OverviewView.load(opts.force);
    }
    var self = this, U = ILARS_UI;
    if (opts.force) { ILARS_DATA.store.invalidate('patients'); this.data = null; }
    // the stored state may have been changed by the overview ("Show all N in the patient list")
    var fresh = PatientListView.readState();
    this.st.status = fresh.status; this.st.attention = fresh.attention; this.st.sort = fresh.sort;
    this.st.scope = fresh.scope || this.st.scope;
    var err = document.getElementById('patient-list-error'), card = document.querySelector('.pl-card');
    var region = document.getElementById('ilars-patients');
    err.hidden = true; card.hidden = false;
    PatientListView.head('patients');
    return U.withSkeleton(function () { self.skeleton(); }, function () { return PatientListView.data(); }, function (d) {
      self.data = d;
      self.st.scope = PatientListView.scopeFor(self.st.scope, d.list.rows, d.me);
      region.removeAttribute('aria-busy');
      self.renderList();
      if (opts.restore) self.restore();
    }).catch(function (e) {
      region.removeAttribute('aria-busy');
      console.error('[patients] list failed:', e);
      PatientListView.showError(e, function () { self.show('patients', { force: true }); });
      document.getElementById('pl-body').innerHTML = '';
      card.hidden = true;
    });
  }
  /** Page head while a tab loads: its own title at once; the other tab's sub line is not left standing. */
  static head(tab) {
    var U = ILARS_UI, sub = document.getElementById('study-sub');
    document.getElementById('study-title').textContent = U.t(tab === 'overview' ? 'doctor.ui.overview.title' : 'doctor.ui.patients.title');
    sub.hidden = false;                                   // the placeholder line keeps the head still while loading
    if (sub.dataset.tab !== tab) { sub.textContent = '\u00a0'; sub.dataset.tab = tab; }
  }
  /** The page sub line. Without text it is hidden, so the head action lines up with the title, not a blank line. */
  static sub(text) {
    var sub = document.getElementById('study-sub');
    sub.textContent = text || '\u00a0';
    sub.hidden = !text;
  }
  /** #patient-list-error (shared by both iLARS tabs): title + detail + Try again at the right, as on the patient page. */
  static showError(e, retry) {
    var U = ILARS_UI, err = document.getElementById('patient-list-error');
    U.alert(err, U.t('doctor.ui.patients.error'), e);
    var actions = document.createElement('div'); actions.className = 'ui-alert__actions';
    actions.innerHTML = '<button class="ui-btn ui-btn--secondary ui-btn--sm" type="button">' + U.icon('refresh', 'i--sm') + '<span>' + U.esc(U.t('doctor.ui.common.retry')) + '</span></button>';
    actions.querySelector('button').addEventListener('click', retry);
    err.appendChild(actions);
    if (!document.getElementById('study-sub').textContent.trim()) PatientListView.sub('');
  }
  /** Back from a patient: the list returns where it was and focus lands on that patient's row link. */
  restore() {
    var b = this.back; if (!b) return;
    var box = document.querySelector('.pl-scroll'); if (box) box.scrollTop = b.inner || 0;
    window.scrollTo(0, b.y || 0);
    var a = document.querySelector('#pl-body .ui-row-link[href="#patient/' + encodeURIComponent(b.code) + '"]');
    if (a) a.focus({ preventScroll: true });
  }
  /** 8 content-shaped rows (avatar + 2 lines + the column rhythm); geometry in classes, widths as --w hand-offs. */
  skeleton() {
    var U = ILARS_UI, widths = [80, 60, 72, 66, 90, 58, 76, 64];
    document.getElementById('ilars-patients').setAttribute('aria-busy', 'true');
    document.getElementById('pl-body').innerHTML = '<p class="sr-only" role="status">' + U.esc(U.t('doctor.ui.common.loading')) + '</p>' +
      '<div class="pl-skel" aria-hidden="true">' + widths.map(function (w) {
        return '<div class="pl-skel__row"><span class="ui-skel ui-skel--circle pl-skel__avatar"></span>' +
          '<span class="pl-skel__who"><span class="ui-skel ui-skel--text" style="--w:' + w + '%"></span><span class="ui-skel ui-skel--text pl-skel__sub"></span></span>' +
          [6, 12, 8, 10, 14].map(function (c) { return '<span class="ui-skel ui-skel--text pl-skel__col" style="--w:' + c + '%"></span>'; }).join('') + '</div>';
      }).join('') + '</div>';
  }

  // ------------------------------------------------------------ list
  renderList() {
    var self = this, U = ILARS_UI, M = ILARS_METRICS, VM = ILARS_VIEW_MODELS, d = this.data, st = this.st;
    var mod = VM.cohortModel(d.list.rows, { today: d.today, meDoctorCode: d.me.doctor_code, scope: st.scope });
    var r = VM.listRows(mod.scoped, st, d.names);
    var caps = (d.list.rows[0] && M.listRowCaps(d.list.rows[0])) || {};
    var ext = !!caps.adherence;
    this.byCode = {};
    d.list.rows.forEach(function (x) { self.byCode[x.patient_code] = x; });

    // page head (shared with the overview, which writes its own title)
    var activeN = mod.scoped.filter(function (s) { return s.status === 'active'; }).length;
    document.getElementById('study-title').textContent = U.t('doctor.ui.patients.title');
    // nobody in scope: no "0 active · 0 need attention · 0 in total" line; a wrapped line never starts with '·' (VIS-25)
    PatientListView.sub(mod.scoped.length ? [U.tp('doctor.ui.patients.sub_active', activeN),
      U.tp('doctor.ui.patients.sub_attention', r.attentionN), U.tp('doctor.ui.patients.sub_total', mod.scoped.length)].join('\u00a0· ') : '');
    document.getElementById('tab-count-patients').textContent = mod.scoped.length;

    var tb = document.getElementById('pl-toolbar');
    // nobody at all (both scopes): one empty state with Create patient, no filters to play with
    if (!mod.all.length) {
      tb.hidden = true; tb.innerHTML = ''; delete tb.dataset.lang;
      document.getElementById('pl-body').innerHTML = '<div class="ui-empty pl-empty"><div class="ui-empty__icon">' + U.icon('users') + '</div>' +
        '<div class="ui-empty__title">' + U.esc(U.t('doctor.cm.list.empty_none')) + '</div>' +
        // secondary: the page head already has the one primary (gradient) action of the view
        '<button class="ui-btn ui-btn--secondary" type="button" data-act="create">' + U.icon('plus') + '<span>' + U.esc(U.t('doctor.create_patient')) + '</span></button></div>';
      document.querySelector('#pl-body [data-act="create"]').addEventListener('click', function () { document.getElementById('btn-create-patient').click(); });
      this.save();
      return;
    }
    tb.hidden = false;
    this.renderToolbar(tb);
    var segBtns = document.querySelectorAll('#pl-status > button');
    ['active', 'inactive', 'dead', 'all'].forEach(function (k, i) { segBtns[i].querySelector('.count').textContent = r.counts[k]; });
    this.segStatus.select(st.status); this.segScope.select(st.scope);
    this.segStatus.place(); this.segScope.place();
    document.querySelector('#pl-sort span').textContent = U.t('doctor.ui.patients.sort_label', { order: st.sort ? this.sortLabel() : U.t('doctor.ui.patients.sort_default_short') });
    var attn = document.getElementById('pl-attn');
    attn.querySelector('.count').textContent = r.attentionN;
    attn.setAttribute('aria-pressed', String(st.attention));

    // columns (CHARTS-METRICS §6.2 with A23): the same set for every status and scope. Status (under "All") and the
    // colleague's name (under "All visible") are line 2 of the Patient cell; Attention is column 2 below 1440 px.
    var attnCol = { k: 'attention', label: U.t('doctor.cm.list.th_attention') };
    var cols = [{ k: 'patient', sort: true, label: U.t('doctor.cm.list.th_patient') }];
    if (this.narrow.matches) cols.push(attnCol);
    cols.push({ k: 'day', sort: true, label: U.t('doctor.cm.list.th_day') }, { k: 'lars', sort: true, label: U.t('doctor.cm.list.th_lars') });
    if (caps.larsRecent) cols.push({ k: 'trend', label: U.t('doctor.cm.list.th_trend') });
    cols.push({ k: 'vas', sort: true, label: U.t('doctor.cm.list.th_vas') }, { k: 'adherence', sort: true, label: U.t('doctor.cm.list.th_adherence') });
    if (caps.lastActivity) cols.push({ k: 'last', sort: true, label: U.t('doctor.cm.list.th_last') });
    if (!this.narrow.matches) cols.push(attnCol);

    var head = '<tr>' + cols.map(function (c) {
      if (!c.sort) return '<th scope="col" data-col="' + c.k + '">' + U.esc(c.label) + '</th>';
      var on = st.sort && st.sort.key === c.k;
      return '<th scope="col" data-col="' + c.k + '"' + (on ? ' aria-sort="' + (st.sort.dir === 'asc' ? 'ascending' : 'descending') + '"' : '') + '>' +
        '<button type="button" class="ui-th-sort" data-sort="' + c.k + '">' + U.esc(c.label) +
        U.icon(on ? (st.sort.dir === 'asc' ? 'arrow-up' : 'arrow-down') : 'chev-updown') + '</button></th>';
    }).join('') + '</tr>';
    var body = r.rows.length ? r.rows.map(function (s) { return self.rowHtml(s, cols); }).join('') :
      '<tr class="pl-empty-row"><td colspan="' + cols.length + '"><div class="ui-empty"><div class="ui-empty__icon">' + U.icon('search') + '</div><div class="ui-empty__title">' +
        U.esc(st.q ? U.t('doctor.cm.list.empty_search', { q: st.q }) : U.t('doctor.cm.list.empty_filter')) + '</div>' +
        (st.q ? '<button class="ui-btn ui-btn--secondary ui-btn--sm" type="button" data-act="clear-search">' + U.esc(U.t('doctor.cm.list.clear_search')) + '</button>' : '') + '</div></td></tr>';
    document.getElementById('pl-body').innerHTML =
      '<div class="pl-scroll-box"><div class="pl-scroll"><table class="ui-table pl-table"><caption class="sr-only">' + U.esc(U.t('doctor.ui.patients.title')) + '</caption><thead>' + head + '</thead><tbody>' + body + '</tbody></table></div></div>' +
      '<div class="pl-foot"><span>' + U.esc(U.t('doctor.ui.patients.foot_order', { order: st.sort ? this.sortLabel() : U.t('doctor.ui.patients.sort_default_short') })) + '</span>' +
        '<span>' + U.esc(U.t(ext ? 'doctor.ui.patients.foot_adherence' : 'doctor.ui.patients.foot_adherence_approx')) + '</span>' +
        (caps.larsRecent ? '<span>' + U.esc(U.t('doctor.ui.patients.foot_trend')) + '</span>' : '') +
        '<span>' + U.esc(U.t('doctor.ui.patients.foot_names')) + '</span></div>';

    document.querySelectorAll('#pl-body .ui-th-sort').forEach(function (b) {
      b.addEventListener('click', function () {
        var k = b.dataset.sort;
        self.update(function () { st.sort = VM.nextSort(st.sort, k); }, false, '#pl-body .ui-th-sort[data-sort="' + k + '"]');
      });
    });
    document.querySelector('#pl-body .pl-scroll').addEventListener('scroll', function () { self.fade(); }, { passive: true });
    this.fade();
    var clear = document.querySelector('#pl-body [data-act="clear-search"]');
    if (clear) clear.addEventListener('click', function () {
      var input = document.getElementById('pl-search'); input.value = '';
      self.update(function () { st.q = ''; }, true); input.focus();
    });
    // the whole row opens the patient (delegated: the sticky first cell cannot carry a stretched link);
    // Cmd/Ctrl/Shift/middle click = new tab (ILARS_UI.rowLinks)
    var tbody = document.querySelector('#pl-body .pl-table tbody');
    U.rowLinks(tbody);
    tbody.addEventListener('click', function (e) {
      var a = e.target.closest('.ui-row-link'); if (!a || e.metaKey || e.ctrlKey || e.shiftKey) return;
      var code = decodeURIComponent(a.getAttribute('href').split('/')[1]);
      // shared element: the clicked name morphs into the patient header (only a real name; codes stay)
      document.querySelectorAll('.is-vt-source').forEach(function (n) { n.classList.remove('is-vt-source'); });
      var n = a.querySelector('.pl-who__name'); if (n && d.names[code]) n.classList.add('is-vt-source');
      var box = document.querySelector('.pl-scroll');
      self.back = { code: code, y: window.scrollY, inner: box ? box.scrollTop : 0 };
    });
    this.save();
  }
  /** Right-edge fade on the table box while columns are hidden to the right (the registry's cue, DESIGN-SPEC 4.2:
      768–1279 px scroll sideways inside the box); gone once the last column is in view. */
  fade() {
    var box = document.querySelector('#pl-body .pl-scroll');
    if (box) box.parentNode.classList.toggle('is-at-end', box.scrollLeft + box.clientWidth >= box.scrollWidth - 2);
  }
  /** Toolbar: rendered once per language, afterwards only synced (focus and the typed search stay put). */
  renderToolbar(tb) {
    var self = this, U = ILARS_UI, st = this.st;
    if (tb.dataset.lang === U.lang()) return;
    tb.dataset.lang = U.lang();
    tb.innerHTML =
      U.segHtml('pl-status', ['active', 'inactive', 'dead', 'all'].map(function (k) { return { v: k, label: U.t('doctor.cm.status.' + (k === 'dead' ? 'deceased' : k)), count: 0 }; }), st.status, { cls: '', label: U.t('doctor.cm.list.th_status') }) +
      U.segHtml('pl-scope', [{ v: 'mine', label: U.t('doctor.cm.scope.mine') }, { v: 'all', label: U.t('doctor.cm.scope.all') }], st.scope, { cls: '', label: U.t('doctor.cm.scope.label') }) +
      '<button class="ui-chip" type="button" id="pl-attn" aria-pressed="' + st.attention + '">' + U.icon('alert', 'i--sm') + '<span>' + U.esc(U.t('doctor.cm.list.attention_only')) + '</span> <span class="count"></span></button>' +
      // phones have no column headers: sorting goes through a menu (radio items, the same orders as the headers).
      // Before the search in the DOM: the search is drawn last (its own row below 1280 px), so Tab follows the eye.
      '<button class="ui-btn ui-btn--secondary ui-btn--sm pl-sort-btn" type="button" id="pl-sort" aria-haspopup="menu" aria-expanded="false">' + U.icon('sort') + '<span></span></button>' +
      '<label class="ui-search pl-toolbar__search">' + U.icon('search') + '<input class="ui-field" type="search" id="pl-search" autocomplete="off" placeholder="' + U.esc(U.t('doctor.cm.list.search')) + '" aria-label="' + U.esc(U.t('doctor.cm.list.search')) + '"></label>';
    document.getElementById('pl-search').value = st.q || '';
    this.segStatus = U.seg(document.getElementById('pl-status'), function (v) { self.update(function () { st.status = v; }); });
    this.segScope = U.seg(document.getElementById('pl-scope'), function (v) { self.update(function () { st.scope = v; }); });
    document.getElementById('pl-sort').addEventListener('click', function (e) { e.stopPropagation(); self.sortMenu(e.currentTarget); });
    document.getElementById('pl-attn').addEventListener('click', function (e) {
      var on = e.currentTarget.getAttribute('aria-pressed') !== 'true';
      self.update(function () { st.attention = on; if (on) st.status = 'active'; });
    });
    var timer;
    document.getElementById('pl-search').addEventListener('input', function (e) {
      clearTimeout(timer);
      var v = e.target.value;
      timer = setTimeout(function () { self.update(function () { st.q = v; }, true); }, 120);
    });
  }
  sortLabel() {
    var s = this.st.sort, U = ILARS_UI;
    if (!s) return U.t('doctor.cm.list.sort_default');
    return U.t('doctor.cm.list.th_' + s.key) + (s.dir === 'asc' ? ' ↑' : ' ↓');
  }
  /** Phone Sort menu: radio items with the same first-click directions as the headers (§3.7). */
  sortMenu(btn) {
    var self = this, U = ILARS_UI, s = this.st.sort;
    var caps = (this.data.list.rows[0] && ILARS_METRICS.listRowCaps(this.data.list.rows[0])) || {};
    var opts = [[null, null], ['patient', 'asc'], ['lars', 'desc'], ['vas', 'asc'], ['adherence', 'asc'], ['day', 'asc']].concat(caps.lastActivity ? [['last', 'asc']] : []);
    U.menu(btn, opts.map(function (o) {
      var on = o[0] ? !!(s && s.key === o[0] && s.dir === o[1]) : !s;
      var label = o[0] ? U.t('doctor.cm.list.th_' + o[0]) + (o[1] === 'asc' ? ' ↑' : ' ↓') : U.t('doctor.cm.list.sort_default');
      return { label: label, checked: on, onSelect: function () { self.update(function () { self.st.sort = o[0] ? { key: o[0], dir: o[1] } : null; }, false, '#pl-sort'); } };
    }), { label: U.t('doctor.ui.patients.sort_menu') });
  }
  /** One state change → save → re-render (cross-fade of the list card unless noTransition). refocus: a selector of
      the control that had focus, when the re-render replaced it (sort headers, the Sort menu button). */
  update(fn, noTransition, refocus) {
    var self = this;
    fn(); this.save();
    var after = function () { var el = refocus && document.querySelector(refocus); if (el) el.focus({ preventScroll: true }); };
    if (noTransition) { this.renderList(); after(); }
    else ILARS_UI.transition(function () { self.renderList(); }, 'list').then(after);
  }

  rowHtml(s, cols) {
    var self = this, U = ILARS_UI, M = ILARS_METRICS, C = M.C, today = this.data.today, st = this.st;
    var name = this.data.names[s.code], code = s.code;
    // §3.4 Delta: the arrow and number are for the eye; a screen reader hears one sentence with the direction (sr)
    var deltaHtml = function (delta, cls, sr) {
      return '<span class="ui-delta' + cls + '">' + U.icon(delta < 0 ? 'arrow-down' : 'arrow-up') + '<span aria-hidden="true">' + Math.abs(delta) + '</span>' +
        '<span class="sr-only"> ' + U.esc(sr) + '</span></span>';
    };
    var cells = {
      patient: function () {
        var extra = [];
        if (!s.isMine && st.scope === 'all') extra.push('<span class="pl-who__doc">' + U.esc(doctorLabel(self.byCode[code], code)) + '</span>');
        if (st.status === 'all') {
          var sk = s.status === 'dead' ? 'deceased' : s.status;
          extra.push('<span class="ui-pstatus ui-pstatus--' + sk + '">' + U.esc(U.t('doctor.cm.status.' + sk)) + '</span>');
        }
        var line2 = name ? '<span class="pl-who__code">' + U.fmtCode(code) + '</span>'
          : (s.isMine || st.scope !== 'all' ? '<span class="pl-who__note">' + U.esc(U.t(s.isMine ? 'doctor.ui.patients.no_name' : 'doctor.ui.patients.colleague')) + '</span>' : '');
        var items = [line2].concat(extra).filter(Boolean).map(function (x) { return '<span class="pl-who__item">' + x + '</span>'; }).join('');
        var who = (name ? '<span class="pl-who__name">' + U.esc(name) + '</span>' : '<span class="pl-who__name code">' + U.fmtCode(code) + '</span>') +
          (items ? '<span class="pl-who__sub"><span class="pl-who__in">' + items + '</span></span>' : '');
        var initials = name ? name.split(/\s+/).filter(Boolean).map(function (p) { return p.charAt(0); }).slice(0, 2).join('') : '';
        return '<a class="ui-row-link pl-who" href="#patient/' + encodeURIComponent(code) + '" aria-label="' + U.esc(U.t('doctor.ui.patients.open', { name: name || code })) + '">' +
          '<span class="ui-avatar" aria-hidden="true">' + (initials ? U.esc(initials) : U.icon('user')) + '</span>' +
          '<span class="pl-who__text">' + who + '</span></a>';
      },
      day: function () {
        // deceased: no study-day count (it would keep counting after death; the dashboard ends the study there)
        if (s.status === 'dead' && s.startDay != null) return '<span class="pl-muted" title="' + U.esc(U.t('doctor.cm.list.registered', { date: U.fmtDay(s.startDay, 'long') })) + '">—</span>';
        if (s.dayInStudy == null) return '<span class="pl-muted">—</span>';
        return '<span class="num" title="' + U.esc(U.t('doctor.cm.list.registered', { date: U.fmtDay(s.startDay, 'long') })) + '">' + U.esc(U.t('doctor.cm.common.day_n', { n: s.dayInStudy })) + '</span>';
      },
      lars: function () {
        var L = s.lars;
        if (L.latest == null) return '<span class="pl-muted">' + U.esc(U.t('doctor.cm.list.no_score')) + '</span>';
        // chip = category of the latest score (pairs with the number); line 2 = the 4-week median, with its own
        // category word only when it differs (the attention rules judge on the median)
        var med = L.trend && L.trend.current && L.trend.current.median != null ? L.trend.current : null;
        var delta = '';
        if (L.delta != null && L.delta !== 0) {
          var catChanged = L.first != null && M.larsCategory(L.first) !== L.category;
          var cls = catChanged ? (L.delta < 0 ? ' ui-delta--better' : ' ui-delta--worse') : '';
          delta = deltaHtml(L.delta, cls, U.tp(L.delta < 0 ? 'doctor.cm.list.delta_sr_down' : 'doctor.cm.list.delta_sr_up', Math.abs(L.delta)));
        }
        var sub = med ? U.t('doctor.ui.patients.median_4w', { v: U.fmtNum(med.median, med.median % 1 ? 1 : 0) }) +
          (med.category !== L.category ? ' (' + U.t('doctor.cm.lars.cat_' + med.category).replace(/ /g, '\u00a0') + ')' : '') + '\u00a0· ' : '';
        // the relative date and the category word never split ("12 days" / "ago", "(No" / "LARS)"), and a wrapped
        // line never starts with the dot
        return '<div class="pl-lars"><span class="pl-lars__n">' + L.latest + '</span>' + larsChip(L.category) + delta + '</div><div class="sub">' + U.esc(sub) +
          '<span class="pl-nowrap">' + U.esc(U.fmtRelative(L.latestDay, today)) + '</span></div>';
      },
      trend: function () {
        var rec = s.lars.recent || [];
        if (!rec.length) return '<span class="pl-muted">—</span>';
        return '<span class="pl-spark">' + ILARS_CHART_OPTIONS.sparklineSVG(rec, self.tok(), 96, 28) + '</span><span class="sr-only">' +
          U.esc(U.tp('doctor.cm.list.spark_sr', rec.length, { first: rec[0].score, last: rec[rec.length - 1].score })) + '</span>';
      },
      vas: function () {
        var V = s.vas;
        if (V.latest == null) return '<span class="pl-muted">—</span>';
        var ch = V.change, dl = '';
        if (ch && ch.deltaFirst != null && ch.deltaFirst !== 0) {
          var cls = Math.abs(ch.deltaFirst) >= C.VAS_MID ? (ch.deltaFirst > 0 ? ' ui-delta--better' : ' ui-delta--worse') : '';
          // the list compares with the first EQ-5D-5L entry (not always day 0), so its wording is neutral (DATA-14)
          dl = deltaHtml(ch.deltaFirst, cls, U.tp(ch.deltaFirst > 0 ? 'doctor.cm.list.vas_delta_up' : 'doctor.cm.list.vas_delta_down', Math.abs(ch.deltaFirst)));
        }
        return '<div class="pl-vas"><span class="pl-vas__n">' + V.latest + '</span>' + dl + '</div><div class="sub">' + U.esc(U.fmtRelative(V.latestDay, today)) + '</div>';
      },
      adherence: function () {
        var a = s.adherence;
        if (s.status === 'dead') return '<span class="pl-muted">' + U.esc(U.t('doctor.cm.list.not_tracked')) + '</span>';
        if (a.ratio == null) return '<span class="pl-muted" title="' + U.esc(U.t('doctor.cm.common.too_early_hint')) + '">' + U.esc(U.t('doctor.cm.common.too_early')) + '</span>';
        var pp = M.percentParts(a.ratio), lvl = s.status === 'active' ? M.adherenceLevel(a.ratio) : null;
        return '<div class="pl-adh"' + (a.approx ? ' title="' + U.esc(U.t('doctor.cm.common.approx_hint')) + '"' : '') + '>' +
          '<span class="ui-meter' + (lvl ? ' ui-meter--' + lvl : '') + '" style="--v:' + Math.round(a.ratio * 100) + '%"></span>' +
          '<span>' + (a.approx ? '≈ ' : '') + U.esc(pp.prefix) + pp.value + '%</span>' +
          (lvl === 'poor' ? '<span class="low">' + U.icon('alert', 'i--xs') + U.esc(U.t('doctor.cm.list.adherence_low')) + '</span>' : '') + '</div>';
      },
      last: function () {
        if (s.lastActivityDay == null) return '<span class="pl-muted">' + U.esc(U.t('doctor.cm.kpi.no_entries')) + '</span>';
        var warn = s.status === 'active' && today - s.lastActivityDay >= C.ATTN_NO_ENTRY_DAYS;
        var txt = U.esc(U.fmtRelative(s.lastActivityDay, today));
        return warn ? '<span class="pl-last warn">' + U.icon('alert', 'i--xs') + txt + '</span>' : '<span>' + txt + '</span>';
      },
      attention: function () { return attnChips(s.attention); }
    };
    return '<tr class="has-link">' + cols.map(function (c) {
      return '<td data-col="' + c.k + '"' + (c.k === 'adherence' ? ' data-label="' + U.esc(U.t('doctor.ui.patients.adherence_label')) + '"' : '') + '>' + cells[c.k]() + '</td>';
    }).join('') + '</tr>';
  }
  tok() { return this._tok || (this._tok = ILARS_CHARTS.ctx().tok); }
}

// ------------------------------------------------------------ shared cell helpers (overview.js and the patient page)
/** LARS category chip (pips + word); cat = none | minor | major | null (no score). */
function larsChip(cat, lg) {
  var U = ILARS_UI, k = cat || 'nodata';
  return '<span class="ui-lars ui-lars--' + k + (lg ? ' ui-lars--lg' : '') + '"><span class="ui-lars__pips" aria-hidden="true"><i></i><i></i><i></i></span>' + U.esc(U.t('doctor.cm.lars.cat_' + k)) + '</span>';
}
/** Attention reasons as chips (clinical / engagement / protocol tints); at most 2 + "+N" (the rest in its title). */
function attnChips(list) {
  var U = ILARS_UI;
  if (!list || !list.length) return '';
  var sev = { lars_worse: 'clinical', vas_drop: 'clinical', no_entry: 'engagement', no_lars: 'engagement', not_started: 'engagement', eq_overdue: 'protocol' };
  var txt = function (a) {
    var p = Object.assign({}, a);
    if (a.days != null) p.days = U.fmtDays(a.days);
    if (a.code === 'not_started') p.days = a.days;
    if (a.code === 'lars_worse') { p.from = U.t('doctor.cm.lars.band_' + a.from); p.to = U.t('doctor.cm.lars.band_' + a.to); }
    if (a.code === 'vas_drop') p.delta = Math.abs(a.delta);
    return U.t('doctor.cm.attn.' + (a.code === 'no_lars' && a.days == null ? 'no_lars_yet' : a.code), p);
  };
  var shown = list.slice(0, 2).map(function (a) { return '<span class="ui-attn ui-attn--' + (sev[a.code] || 'protocol') + '">' + U.esc(txt(a)) + '</span>'; }).join('');
  if (list.length > 2) shown += '<span class="ui-attn" title="' + U.esc(list.slice(2).map(txt).join(' · ')) + '">' + U.esc(U.t('doctor.cm.list.more_reasons', { n: list.length - 2 })) + '</span>';
  return '<span class="ui-attn-list">' + shown + '</span>';
}
/** "A. Testaitė" for a colleague's patient (replaces the Doctor column under "All visible"); the code if no name. */
function doctorLabel(row, code) {
  if (!row) return code || '—';
  var f = (row.doctor_first_name || '').trim(), l = (row.doctor_last_name || '').trim();
  return l || f ? (f ? f.charAt(0).toUpperCase() + '. ' : '') + l : (row.doctor_code || '—');
}

// ------------------------------------------------------------ create patient (#create-patient-modal, DESIGN-SPEC §4.7)
// Bound once at start-up (the dialog and #btn-create-patient are static markup and the button shows on both iLARS
// tabs). <form method="dialog">: the primary is the only submit, so Enter in a name field creates; the dialog stays
// open until POST /createPatient answered; on failure it keeps the typed names and shows #create-patient-modal-error;
// a name that Firestore refused still ends in the success state, with a "name not saved" note.
(function () {
  'use strict';
  var created = null, copiedTimer = null;
  function $(id) { return document.getElementById(id); }
  /** "Copy code" feedback for 2 s: the button reads "Code copied" with a check, and the status line inside the dialog
      announces it. on = false puts the button back (after the 2 s, or when the dialog opens again). */
  function copied(on) {
    var U = ILARS_UI, btn = $('create-patient-modal-copy');
    clearTimeout(copiedTimer);
    btn.querySelector('use').setAttribute('href', on ? '#i-check' : '#i-copy');
    btn.querySelector('span').textContent = U.t(on ? 'doctor.ui.toast.code_copied' : 'doctor.ui.create.copy');
    $('create-patient-modal-copy-status').textContent = on ? U.t('doctor.ui.toast.code_copied') : '';
    if (on) copiedTimer = setTimeout(function () { copied(false); }, 2000);
  }
  function open() {
    var U = ILARS_UI, dlg = $('create-patient-modal');
    $('create-patient-modal-confirm-state').hidden = false;
    $('create-patient-modal-success-state').hidden = true;
    $('create-patient-modal-error').hidden = true;
    $('create-patient-modal-name-warning').hidden = true;
    $('create-patient-first-name').value = ''; $('create-patient-last-name').value = '';
    copied(false);
    $('create-patient-modal-doctor-name').textContent = '—'; $('create-patient-modal-hospital').textContent = '—';
    $('create-patient-modal-date').textContent = new Date().toLocaleDateString(U.locale(), { day: 'numeric', month: 'long', year: 'numeric' });
    window.ILARS_PROFILE().then(function (me) {
      var p = (me && me.profile) || {};
      $('create-patient-modal-doctor-name').textContent = [p.first_name, p.last_name].filter(Boolean).join(' ').trim() || p.email || '—';
      $('create-patient-modal-hospital').textContent = p.hospital_name || '—';
    }, function () { /* the dialog still works without the profile line */ });
    created = null;
    // the "created" toast waits until the dialog closed: a toast under the modal backdrop is blurred and inert
    U.openDialog(dlg, { focus: '#create-patient-first-name', onClose: function () {
      if (created) U.toast(U.t('doctor.ui.toast.patient_created', { code: created }));
    } });
  }
  function saveName(code, first, last) {
    var auth = window.ILARS_AUTH, user = auth && auth.getCurrentUser && auth.getCurrentUser();
    if (!first && !last) return Promise.resolve(true);
    if (!user || !auth.db) return Promise.resolve(false);
    return auth.db.collection('patients').doc(code).set({
      firstName: first, lastName: last, doctorUid: user.uid,
      createdAt: window.firebase.firestore.FieldValue.serverTimestamp()
    }).then(function () { return true; }, function (e) { console.error('[create patient] name not saved:', e); return false; });
  }
  /** Re-render the iLARS tab on screen with the new patient (the cached list was dropped). */
  function refresh() {
    var h = (window.location.hash || '').slice(1);
    if (h === 'overview' && window.OverviewView && typeof window.OverviewView.load === 'function') window.OverviewView.load(true);
    else if (window.PatientListView && typeof window.PatientListView.load === 'function') window.PatientListView.load(true);
  }
  function bind() {
    var U = ILARS_UI, dlg = $('create-patient-modal'), btn = $('btn-create-patient');
    if (!dlg || !btn || dlg.dataset.bound) return;
    dlg.dataset.bound = '1';
    btn.addEventListener('click', open);
    U.dialogForm(dlg, {
      error: $('create-patient-modal-error'),
      errorTitle: function () { return U.t('doctor.ui.create.failed'); },
      submit: function () {
        var first = $('create-patient-first-name').value.trim(), last = $('create-patient-last-name').value.trim();
        return ILARS_DATA.store.api().createPatient().then(function (r) {
          if (!r || !r.patient_code) throw new Error(U.t('doctor.ui.create.failed'));
          created = r.patient_code;
          return saveName(created, first, last).then(function (nameOk) {
            var warn = $('create-patient-modal-name-warning');
            if (nameOk) warn.hidden = true;
            else U.alert(warn, U.t('doctor.ui.create.name_not_saved'), null);   // warning box: the alert icon
            $('create-patient-modal-code').innerHTML = U.fmtCode(created);
            $('create-patient-modal-confirm-state').hidden = true;
            $('create-patient-modal-success-state').hidden = false;
            $('create-patient-modal-done').focus();
            ILARS_DATA.store.invalidate('patients');
            if (nameOk && (first || last)) ILARS_DATA.store.invalidate('names');
            refresh();
            return false;                                     // stay open: the success state shows the code
          });
        });
      }
    });
    $('create-patient-modal-copy').addEventListener('click', function () {
      if (!created) return;
      // feedback inside the dialog: a toast would sit under the modal backdrop, blurred and outside the
      // accessibility tree (the rest of the page is inert while the dialog is modal)
      var ok = function () { copied(true); };
      var selectCode = function () {                          // no clipboard access: select the code for Cmd/Ctrl+C
        var range = document.createRange(); range.selectNodeContents($('create-patient-modal-code'));
        var sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(range);
      };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(created).then(ok, selectCode);
      else selectCode();
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind);
  else bind();
})();
