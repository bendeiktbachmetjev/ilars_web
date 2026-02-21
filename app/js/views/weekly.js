/**
 * iLARS Patient Web App — Weekly (LARS) questionnaire view
 * Same 5 questions and scoring as mobile app
 */
(function (global) {
  'use strict';

  var API = global.ILARS_APP_API;

  function _t(key) {
    return global.ILARS_I18N && global.ILARS_I18N.t ? global.ILARS_I18N.t(key) : key;
  }

  var container = null;
  var opts = {};

  function larsOptions() {
    return {
      flatus: [_t('app.lars_no_never'), _t('app.lars_yes_less_once_week'), _t('app.lars_yes_at_least_once_week')],
      liquid: [_t('app.lars_no_never'), _t('app.lars_yes_less_once_week'), _t('app.lars_yes_at_least_once_week')],
      frequency: [_t('app.lars_more_7_times_day'), _t('app.lars_4_7_times_day'), _t('app.lars_1_3_times_day'), _t('app.lars_less_once_day')],
      repeat: [_t('app.lars_no_never'), _t('app.lars_yes_less_once_week'), _t('app.lars_yes_at_least_once_week')],
      urgency: [_t('app.lars_no_never'), _t('app.lars_yes_less_once_week'), _t('app.lars_yes_at_least_once_week')]
    };
  }

  var LARS_SCORES = [
    [0, 4, 7],
    [0, 3, 3],
    [4, 2, 0, 5],
    [0, 9, 11],
    [0, 11, 16]
  ];

  function todayStr() {
    var d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  function totalScore(flatus, liquid, frequency, repeat, urgency) {
    return LARS_SCORES[0][flatus] + LARS_SCORES[1][liquid] + LARS_SCORES[2][frequency] + LARS_SCORES[3][repeat] + LARS_SCORES[4][urgency];
  }

  function buildForm() {
    return (
      '<a href="#" class="app-back-link" id="weekly-back">' + _t('app.back_to_dashboard') + '</a>' +
      '<div class="app-section">' +
      '<h1 class="app-form-title">' + _t('app.weekly_title') + '</h1>' +
      '<form id="weekly-form">' +
      '<div class="app-form-group app-form-group-with-icon">' +
      '<div class="app-form-label-wrap"><span class="app-form-icon">💨</span><label>' + _t('app.flatus_control') + '</label></div>' +
      '<div class="app-form-options" id="weekly-flatus"></div>' +
      '</div>' +
      '<div class="app-form-group app-form-group-with-icon">' +
      '<div class="app-form-label-wrap"><span class="app-form-icon">💧</span><label>' + _t('app.liquid_stool_leakage') + '</label></div>' +
      '<div class="app-form-options" id="weekly-liquid"></div>' +
      '</div>' +
      '<div class="app-form-group app-form-group-with-icon">' +
      '<div class="app-form-label-wrap"><span class="app-form-icon">📊</span><label>' + _t('app.bowel_frequency') + '</label></div>' +
      '<div class="app-form-options" id="weekly-frequency"></div>' +
      '</div>' +
      '<div class="app-form-group app-form-group-with-icon">' +
      '<div class="app-form-label-wrap"><span class="app-form-icon">🔄</span><label>' + _t('app.repeat_bowel_opening') + '</label></div>' +
      '<div class="app-form-options" id="weekly-repeat"></div>' +
      '</div>' +
      '<div class="app-form-group app-form-group-with-icon">' +
      '<div class="app-form-label-wrap"><span class="app-form-icon">⚡</span><label>' + _t('app.urgency_to_toilet') + '</label></div>' +
      '<div class="app-form-options" id="weekly-urgency"></div>' +
      '</div>' +
      '<div class="app-form-group app-form-score">' +
      '<div class="app-score-card">' +
      '<p class="app-score-label">' + _t('app.total_lars_score') + '</p>' +
      '<p class="app-score-value"><span id="weekly-total">0</span></p>' +
      '</div>' +
      '</div>' +
      '<div class="app-form-actions"><button type="submit" class="app-btn app-btn-primary">' + _t('app.submit') + '</button></div>' +
      '</form>' +
      '</div>'
    );
  }

  function renderOptions(parentId, options, namePrefix) {
    var parent = document.getElementById(parentId);
    if (!parent) return;
    parent.innerHTML = '';
    options.forEach(function (label, i) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'app-form-option app-form-option-large';
      btn.textContent = label;
      btn.dataset.index = String(i);
      btn.addEventListener('click', function () {
        parent.querySelectorAll('.app-form-option').forEach(function (b) { b.classList.remove('selected'); });
        btn.classList.add('selected');
        updateTotal();
      });
      parent.appendChild(btn);
    });
  }

  function getSelectedIndex(parentId) {
    var parent = document.getElementById(parentId);
    if (!parent) return 0;
    var sel = parent.querySelector('.app-form-option.selected');
    return sel ? parseInt(sel.dataset.index, 10) : 0;
  }

  function updateTotal() {
    var t = totalScore(
      getSelectedIndex('weekly-flatus'),
      getSelectedIndex('weekly-liquid'),
      getSelectedIndex('weekly-frequency'),
      getSelectedIndex('weekly-repeat'),
      getSelectedIndex('weekly-urgency')
    );
    var el = document.getElementById('weekly-total');
    if (el) el.textContent = t;
  }

  function show() {
    container = document.getElementById('app-screen-weekly');
    if (!container) return;
    container.innerHTML = buildForm();

    var opts_ = larsOptions();
    renderOptions('weekly-flatus', opts_.flatus);
    renderOptions('weekly-liquid', opts_.liquid);
    renderOptions('weekly-frequency', opts_.frequency);
    renderOptions('weekly-repeat', opts_.repeat);
    renderOptions('weekly-urgency', opts_.urgency);
    updateTotal();

    document.getElementById('weekly-back').addEventListener('click', function (e) {
      e.preventDefault();
      if (opts.showScreen) opts.showScreen('dashboard');
    });

    document.getElementById('weekly-form').addEventListener('submit', function (e) {
      e.preventDefault();
      var flatus = getSelectedIndex('weekly-flatus');
      var liquid = getSelectedIndex('weekly-liquid');
      var frequency = getSelectedIndex('weekly-frequency');
      var repeat = getSelectedIndex('weekly-repeat');
      var urgency = getSelectedIndex('weekly-urgency');
      var payload = {
        flatus_control: flatus,
        liquid_stool_leakage: liquid,
        bowel_frequency: frequency,
        repeat_bowel_opening: repeat,
        urgency_to_toilet: urgency,
        entry_date: todayStr(),
        raw_data: { total_score: totalScore(flatus, liquid, frequency, repeat, urgency) }
      };
      API.sendWeekly(null, payload, function (err) {
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

  global.ILARS_APP_WEEKLY = {
    init: init,
    show: show
  };
})(typeof window !== 'undefined' ? window : this);
