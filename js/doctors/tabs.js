/**
 * Workspace controller for the doctor list screen (DESIGN-SPEC §4.1.1).
 * Lithuanian doctors get an "iLARS / Registras" switch in the top bar; everyone else sees only iLARS.
 * The URL hash is the only source of truth: app.js parses it and calls show(api, {mode, tab}).
 * DOM contract kept: #table-mode-bar, #study-mode, #registry-mode and the two create buttons are shown and
 * hidden through element.style.display (never the hidden attribute — DESIGN-SPEC §7.2 rule L1);
 * #table-mode-toggle buttons carry .is-active (+ aria-pressed).
 */
(function (global) {
  'use strict';

  var api = null;
  var inited = false;
  var mode = null;

  /** Once, after the gate: bind the switch and the registry create button, show the switch for LT doctors. */
  function init(apiSvc) {
    api = apiSvc;
    if (inited) return;
    inited = true;
    bindToggle();
    bindRegistryCreate();
    detect();
  }

  /** Switch click: on a list route add one history entry; on a detail route replace it. */
  function bindToggle() {
    var toggle = document.getElementById('table-mode-toggle');
    if (!toggle) return;
    toggle.querySelectorAll('button[data-mode]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var m = btn.getAttribute('data-mode');
        var target = m === 'registry' ? 'registry' : 'patients';
        var detail = !!global.location.hash.slice(1).split('/')[1];
        if (detail) { global.history.replaceState(null, '', '#' + target); global.app.handleRoute(); }
        else if (m !== mode) global.location.hash = target;
      });
    });
    // one Tab stop (roving tabindex, DESIGN-SPEC §3.2); arrows move focus, Enter/Space switch the workspace
    toggle.addEventListener('keydown', function (e) {
      var btns = Array.prototype.slice.call(toggle.querySelectorAll('button[data-mode]'));
      var i = btns.indexOf(document.activeElement);
      var n = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: btns.length - 1 }[e.key];
      if (i < 0 || n == null) return;
      e.preventDefault();
      var b = btns[(n + btns.length) % btns.length];
      btns.forEach(function (x) { x.tabIndex = x === b ? 0 : -1; });
      b.focus();
    });
  }

  function bindRegistryCreate() {
    var btn = document.getElementById('registry-create-btn');
    if (btn) btn.addEventListener('click', function () {
      if (global.RegistryListView) global.RegistryListView.createPatient();
    });
  }

  /** Only shows or hides the switch; the default workspace is decided by app.js (route rule 2). */
  function detect() {
    global.ILARS_PROFILE().then(function (data) {
      var bar = document.getElementById('table-mode-bar');
      if (bar) bar.style.display = data && data.is_lithuania ? '' : 'none';
    });
  }

  function setMode(m) {
    mode = m;
    var registry = (m === 'registry');
    var studyEl = document.getElementById('study-mode');
    var regEl = document.getElementById('registry-mode');
    var studyCreate = document.getElementById('btn-create-patient');
    var regCreate = document.getElementById('registry-create-btn');
    if (studyEl) studyEl.style.display = registry ? 'none' : 'block';
    if (regEl) regEl.style.display = registry ? 'block' : 'none';
    if (studyCreate) studyCreate.style.display = registry ? 'none' : '';
    if (regCreate) regCreate.style.display = registry ? '' : 'none';

    var toggle = document.getElementById('table-mode-toggle');
    if (toggle) toggle.querySelectorAll('button[data-mode]').forEach(function (btn) {
      var on = btn.getAttribute('data-mode') === m;
      btn.classList.toggle('is-active', on);
      btn.setAttribute('aria-pressed', String(on));
      btn.tabIndex = on ? 0 : -1;
    });
  }

  /** iLARS section links (route links, not ARIA tabs): aria-current + which region shows. */
  function setTab(tab) {
    document.querySelectorAll('#ilars-tabs [data-tab]').forEach(function (a) {
      if (a.getAttribute('data-tab') === tab) a.setAttribute('aria-current', 'page');
      else a.removeAttribute('aria-current');
    });
    var list = document.getElementById('ilars-patients'), ov = document.getElementById('ilars-overview');
    if (list) list.hidden = tab !== 'patients';
    if (ov) ov.hidden = tab !== 'overview';
  }

  /**
   * o = {mode: 'study' | 'registry', tab: 'patients' | 'overview', restore: bool (back navigation)}
   * Contract for the views: RegistryListView.load(); PatientListView.show(tab, {restore}); OverviewView.load().
   */
  function show(apiSvc, o) {
    init(apiSvc);
    setMode(o.mode);
    if (o.mode === 'registry') {
      if (!global.RegistryListView) global.RegistryListView = new RegistryListView(api);
      global.RegistryListView.load();
      return;
    }
    setTab(o.tab);
    if (o.tab === 'overview' && typeof OverviewView === 'function') {
      if (!global.OverviewView) global.OverviewView = new OverviewView(api);
      global.OverviewView.load();
      return;
    }
    if (!global.PatientListView) global.PatientListView = new PatientListView(api);
    // Interim (until the WP2 rewrite lands): the legacy list view has load() only.
    if (typeof global.PatientListView.show === 'function') global.PatientListView.show(o.tab, { restore: !!o.restore });
    else global.PatientListView.load();
  }

  global.ILARS_TABS = { init: init, show: show, setMode: setMode };
})(typeof window !== 'undefined' ? window : this);
