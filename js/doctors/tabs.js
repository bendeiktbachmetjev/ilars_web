/**
 * Table mode controller for the doctor patient-list screen.
 * Lithuanian doctors get a "Tyrimas / Registras" toggle (registry is default);
 * everyone else sees only the study list (unchanged behaviour).
 */
(function (global) {
  'use strict';

  var api = null;
  var inited = false;
  var mode = 'study';
  var isLT = false;

  function show(apiSvc) {
    api = apiSvc;
    if (inited) { setMode(mode); return; }
    inited = true;
    bindToggle();
    bindRegistryCreate();
    detect();
  }

  function bindToggle() {
    var toggle = document.getElementById('table-mode-toggle');
    if (!toggle) return;
    toggle.querySelectorAll('button[data-mode]').forEach(function (btn) {
      btn.addEventListener('click', function () { setMode(btn.getAttribute('data-mode')); });
    });
  }

  function bindRegistryCreate() {
    var btn = document.getElementById('registry-create-btn');
    if (btn) btn.addEventListener('click', function () {
      if (global.RegistryListView) global.RegistryListView.createPatient();
    });
  }

  function detect() {
    if (!api || !api.getDoctorProfile) { setMode('study'); return; }
    api.getDoctorProfile().then(function (data) {
      isLT = !!(data && data.is_lithuania);
      global.ILARS_IS_LT = isLT;
      var bar = document.getElementById('table-mode-bar');
      if (isLT) {
        if (bar) bar.style.display = '';
        setMode('registry'); // default to registry for Lithuanian doctors
      } else {
        if (bar) bar.style.display = 'none';
        setMode('study');
      }
    }).catch(function () { setMode('study'); });
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
      btn.classList.toggle('is-active', btn.getAttribute('data-mode') === m);
    });

    if (registry) {
      if (!global.RegistryListView) global.RegistryListView = new RegistryListView(api);
      global.RegistryListView.load();
    } else {
      if (!global.PatientListView) global.PatientListView = new PatientListView(api);
      global.PatientListView.load();
    }
  }

  global.ILARS_TABS = { show: show, setMode: setMode };
})(typeof window !== 'undefined' ? window : this);
