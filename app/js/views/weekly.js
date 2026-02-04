/**
 * iLARS Patient Web App — Weekly (LARS) questionnaire view
 * Same 5 questions and scoring as mobile app
 */
(function (global) {
  'use strict';

  var API = global.ILARS_APP_API;

  var container = null;
  var opts = {};

  var LARS_OPTIONS = {
    flatus: ['No never', 'Yes, less than once per week', 'Yes, at least once per week'],
    liquid: ['No never', 'Yes, less than once per week', 'Yes, at least once per week'],
    frequency: ['More than 7 times per day', '4–7 times per day', '1–3 times per day', 'Less than once per day'],
    repeat: ['No never', 'Yes, less than once per week', 'Yes, at least once per week'],
    urgency: ['No never', 'Yes, less than once per week', 'Yes, at least once per week']
  };

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
      '<a href="#" class="app-back-link" id="weekly-back">← Back to dashboard</a>' +
      '<div class="app-section">' +
      '<h1 class="app-form-title">Weekly LARS questionnaire</h1>' +
      '<form id="weekly-form">' +
      '<div class="app-form-group"><label>Flatus (gas) control</label><div class="app-form-options" id="weekly-flatus"></div></div>' +
      '<div class="app-form-group"><label>Liquid stool leakage</label><div class="app-form-options" id="weekly-liquid"></div></div>' +
      '<div class="app-form-group"><label>Bowel frequency</label><div class="app-form-options" id="weekly-frequency"></div></div>' +
      '<div class="app-form-group"><label>Repeat bowel opening</label><div class="app-form-options" id="weekly-repeat"></div></div>' +
      '<div class="app-form-group"><label>Urgency to toilet</label><div class="app-form-options" id="weekly-urgency"></div></div>' +
      '<div class="app-form-group"><p><strong>Total LARS score: <span id="weekly-total">0</span></strong></p></div>' +
      '<div class="app-form-actions"><button type="submit" class="app-btn app-btn-primary">Submit</button></div>' +
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
      btn.className = 'app-form-option';
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

    renderOptions('weekly-flatus', LARS_OPTIONS.flatus);
    renderOptions('weekly-liquid', LARS_OPTIONS.liquid);
    renderOptions('weekly-frequency', LARS_OPTIONS.frequency);
    renderOptions('weekly-repeat', LARS_OPTIONS.repeat);
    renderOptions('weekly-urgency', LARS_OPTIONS.urgency);
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

  global.ILARS_APP_WEEKLY = {
    init: init,
    show: show
  };
})(typeof window !== 'undefined' ? window : this);
