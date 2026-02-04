/**
 * iLARS Patient Web App — Monthly quality of life questionnaire
 * Same sliders and qol_score as mobile app
 */
(function (global) {
  'use strict';

  var API = global.ILARS_APP_API;

  var opts = {};

  function todayStr() {
    var d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  function buildForm() {
    return (
      '<a href="#" class="app-back-link" id="monthly-back">← Back to dashboard</a>' +
      '<div class="app-section">' +
      '<h1 class="app-form-title">Monthly quality of life</h1>' +
      '<form id="monthly-form">' +
      '<div class="app-form-group"><label>Avoid traveling (1–4)</label><input type="range" id="monthly-avoid-travel" min="1" max="4" value="1"><span id="monthly-avoid-travel-v">1</span></div>' +
      '<div class="app-form-group"><label>Avoid social activities (1–4)</label><input type="range" id="monthly-avoid-social" min="1" max="4" value="1"><span id="monthly-avoid-social-v">1</span></div>' +
      '<div class="app-form-group"><label>Feel embarrassed (1–4)</label><input type="range" id="monthly-embarrassed" min="1" max="4" value="1"><span id="monthly-embarrassed-v">1</span></div>' +
      '<div class="app-form-group"><label>Worry others notice (1–4)</label><input type="range" id="monthly-worry" min="1" max="4" value="1"><span id="monthly-worry-v">1</span></div>' +
      '<div class="app-form-group"><label>Feel depressed (1–4)</label><input type="range" id="monthly-depressed" min="1" max="4" value="1"><span id="monthly-depressed-v">1</span></div>' +
      '<div class="app-form-group"><label>Feel in control (0–10)</label><input type="range" id="monthly-control" min="0" max="10" value="0"><span id="monthly-control-v">0</span></div>' +
      '<div class="app-form-group"><label>Satisfaction (0–10)</label><input type="range" id="monthly-satisfaction" min="0" max="10" value="0"><span id="monthly-satisfaction-v">0</span></div>' +
      '<div class="app-form-actions"><button type="submit" class="app-btn app-btn-primary">Submit</button></div>' +
      '</form>' +
      '</div>'
    );
  }

  function bindSliders() {
    var ids = ['monthly-avoid-travel', 'monthly-avoid-social', 'monthly-embarrassed', 'monthly-worry', 'monthly-depressed', 'monthly-control', 'monthly-satisfaction'];
    ids.forEach(function (id) {
      var el = document.getElementById(id);
      var valEl = document.getElementById(id + '-v');
      if (el && valEl) {
        el.addEventListener('input', function () { valEl.textContent = el.value; });
      }
    });
  }

  function show() {
    var container = document.getElementById('app-screen-monthly');
    if (!container) return;
    container.innerHTML = buildForm();
    bindSliders();

    document.getElementById('monthly-back').addEventListener('click', function (e) {
      e.preventDefault();
      if (opts.showScreen) opts.showScreen('dashboard');
    });

    document.getElementById('monthly-form').addEventListener('submit', function (e) {
      e.preventDefault();
      var avoidTravel = parseFloat(document.getElementById('monthly-avoid-travel').value, 10) || 1;
      var avoidSocial = parseFloat(document.getElementById('monthly-avoid-social').value, 10) || 1;
      var embarrassed = parseFloat(document.getElementById('monthly-embarrassed').value, 10) || 1;
      var worryNotice = parseFloat(document.getElementById('monthly-worry').value, 10) || 1;
      var depressed = parseFloat(document.getElementById('monthly-depressed').value, 10) || 1;
      var control = parseFloat(document.getElementById('monthly-control').value, 10) || 0;
      var satisfaction = parseFloat(document.getElementById('monthly-satisfaction').value, 10) || 0;
      var qolScore = Math.round((control + satisfaction) / 2);
      var payload = {
        entry_date: todayStr(),
        qol_score: qolScore,
        raw_data: {
          avoid_travel: avoidTravel,
          avoid_social: avoidSocial,
          embarrassed: embarrassed,
          worry_notice: worryNotice,
          depressed: depressed,
          control: control,
          satisfaction: satisfaction
        }
      };
      API.sendMonthly(null, payload, function (err) {
        if (err) {
          if (opts.showToast) opts.showToast('Submit failed: ' + (err.message || 'error'));
          return;
        }
        if (opts.showToast) opts.showToast('Submitted successfully.');
        if (opts.showScreen) opts.showScreen('dashboard');
        if (global.ILARS_APP_DASHBOARD && global.ILARS_APP_DASHBOARD.refresh) {
          global.ILARS_APP_DASHBOARD.refresh();
        }
      });
    });
  }

  function init(options) {
    opts = options || {};
  }

  global.ILARS_APP_MONTHLY = {
    init: init,
    show: show
  };
})(typeof window !== 'undefined' ? window : this);
