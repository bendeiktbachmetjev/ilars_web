/**
 * iLARS Patient Web App — Monthly quality of life questionnaire
 * Same sliders and qol_score as mobile app
 */
(function (global) {
  'use strict';

  var API = global.ILARS_APP_API;

  var opts = {};

  function _t(key) {
    return global.ILARS_I18N && global.ILARS_I18N.t ? global.ILARS_I18N.t(key) : key;
  }

  function todayStr() {
    var d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  function buildForm() {
    return (
      '<a href="#" class="app-back-link" id="monthly-back">' + _t('app.back_to_dashboard') + '</a>' +
      '<div class="app-section">' +
      '<h1 class="app-form-title">' + _t('app.monthly_title') + '</h1>' +
      '<form id="monthly-form">' +
      '<div class="app-form-group app-form-group-with-icon">' +
        '<div class="app-slider-head">' +
          '<div class="app-form-label-wrap"><span class="app-form-icon">✈️</span><label for="monthly-avoid-travel">' + _t('app.avoid_traveling') + '</label></div>' +
          '<span class="app-value-chip" id="monthly-avoid-travel-v">1</span>' +
        '</div>' +
        '<input class="app-range" type="range" id="monthly-avoid-travel" min="1" max="4" value="1">' +
        '<p class="app-question-desc">' + _t('app.desc_1_4') + '</p>' +
      '</div>' +

      '<div class="app-form-group app-form-group-with-icon">' +
        '<div class="app-slider-head">' +
          '<div class="app-form-label-wrap"><span class="app-form-icon">🧑‍🤝‍🧑</span><label for="monthly-avoid-social">' + _t('app.avoid_social') + '</label></div>' +
          '<span class="app-value-chip" id="monthly-avoid-social-v">1</span>' +
        '</div>' +
        '<input class="app-range" type="range" id="monthly-avoid-social" min="1" max="4" value="1">' +
        '<p class="app-question-desc">' + _t('app.desc_1_4') + '</p>' +
      '</div>' +

      '<div class="app-form-group app-form-group-with-icon">' +
        '<div class="app-slider-head">' +
          '<div class="app-form-label-wrap"><span class="app-form-icon">😳</span><label for="monthly-embarrassed">' + _t('app.feel_embarrassed') + '</label></div>' +
          '<span class="app-value-chip" id="monthly-embarrassed-v">1</span>' +
        '</div>' +
        '<input class="app-range" type="range" id="monthly-embarrassed" min="1" max="4" value="1">' +
        '<p class="app-question-desc">' + _t('app.desc_1_4') + '</p>' +
      '</div>' +

      '<div class="app-form-group app-form-group-with-icon">' +
        '<div class="app-slider-head">' +
          '<div class="app-form-label-wrap"><span class="app-form-icon">👀</span><label for="monthly-worry">' + _t('app.worry_others_notice') + '</label></div>' +
          '<span class="app-value-chip" id="monthly-worry-v">1</span>' +
        '</div>' +
        '<input class="app-range" type="range" id="monthly-worry" min="1" max="4" value="1">' +
        '<p class="app-question-desc">' + _t('app.desc_1_4') + '</p>' +
      '</div>' +

      '<div class="app-form-group app-form-group-with-icon">' +
        '<div class="app-slider-head">' +
          '<div class="app-form-label-wrap"><span class="app-form-icon">😞</span><label for="monthly-depressed">' + _t('app.feel_depressed') + '</label></div>' +
          '<span class="app-value-chip" id="monthly-depressed-v">1</span>' +
        '</div>' +
        '<input class="app-range" type="range" id="monthly-depressed" min="1" max="4" value="1">' +
        '<p class="app-question-desc">' + _t('app.desc_1_4') + '</p>' +
      '</div>' +

      '<div class="app-form-group app-form-group-with-icon">' +
        '<div class="app-slider-head">' +
          '<div class="app-form-label-wrap"><span class="app-form-icon">🎛️</span><label for="monthly-control">' + _t('app.feel_in_control') + '</label></div>' +
          '<span class="app-value-chip" id="monthly-control-v">0</span>' +
        '</div>' +
        '<input class="app-range" type="range" id="monthly-control" min="0" max="10" value="0">' +
        '<p class="app-question-desc">' + _t('app.desc_0_10_control') + '</p>' +
      '</div>' +

      '<div class="app-form-group app-form-group-with-icon">' +
        '<div class="app-slider-head">' +
          '<div class="app-form-label-wrap"><span class="app-form-icon">😊</span><label for="monthly-satisfaction">' + _t('app.satisfaction') + '</label></div>' +
          '<span class="app-value-chip" id="monthly-satisfaction-v">0</span>' +
        '</div>' +
        '<input class="app-range" type="range" id="monthly-satisfaction" min="0" max="10" value="0">' +
        '<p class="app-question-desc">' + _t('app.desc_0_10_satisfaction') + '</p>' +
      '</div>' +

      '<div class="app-form-group app-form-score">' +
        '<div class="app-score-card">' +
          '<p class="app-score-label">' + _t('app.qol_score') + '</p>' +
          '<p class="app-score-value"><span id="monthly-qol-score">0</span></p>' +
        '</div>' +
      '</div>' +

      '<div class="app-form-actions"><button type="submit" class="app-btn app-btn-primary">' + _t('app.submit') + '</button></div>' +
      '</form>' +
      '</div>'
    );
  }

  function computeQolScore() {
    var control = parseFloat(document.getElementById('monthly-control').value, 10) || 0;
    var satisfaction = parseFloat(document.getElementById('monthly-satisfaction').value, 10) || 0;
    return Math.round((control + satisfaction) / 2);
  }

  function updateQolScoreUI() {
    var el = document.getElementById('monthly-qol-score');
    if (!el) return;
    el.textContent = String(computeQolScore());
  }

  function bindSliders() {
    var ids = ['monthly-avoid-travel', 'monthly-avoid-social', 'monthly-embarrassed', 'monthly-worry', 'monthly-depressed', 'monthly-control', 'monthly-satisfaction'];
    ids.forEach(function (id) {
      var el = document.getElementById(id);
      var valEl = document.getElementById(id + '-v');
      if (el && valEl) {
        el.addEventListener('input', function () {
          valEl.textContent = el.value;
          updateQolScoreUI();
        });
      }
    });
    updateQolScoreUI();
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
          if (opts.showToast) opts.showToast(_t('app.submit_failed') + ' ' + (err.message || 'error'));
          return;
        }
        if (opts.showToast) opts.showToast(_t('app.submitted_successfully'));
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
