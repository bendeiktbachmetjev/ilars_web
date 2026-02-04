/**
 * iLARS Patient Web App — Daily questionnaire view
 * Same fields and payload as mobile app: raw_data + food_consumption + drink_consumption + bristol_scale
 */
(function (global) {
  'use strict';

  var API = global.ILARS_APP_API;

  var FOOD_KEYS = [
    'vegetables_all_types', 'root_vegetables', 'whole_grains', 'whole_grain_bread',
    'nuts_and_seeds', 'legumes', 'fruits_with_skin', 'berries_any',
    'soft_fruits_without_skin', 'muesli_and_bran_cereals'
  ];
  var DRINK_KEYS = [
    'water', 'coffee', 'tea', 'alcohol', 'carbonated_drinks', 'juices', 'dairy_drinks', 'energy_drinks'
  ];

  var container = null;
  var opts = {};

  function todayStr() {
    var d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  function buildForm() {
    return (
      '<a href="#" class="app-back-link" id="daily-back">← Back to dashboard</a>' +
      '<div class="app-section">' +
      '<h1 class="app-form-title">Daily questionnaire</h1>' +
      '<form id="daily-form">' +
      '<div class="app-form-group">' +
      '<label>Stool per day</label>' +
      '<input type="number" id="daily-stool" min="0" max="100" value="0">' +
      '</div>' +
      '<div class="app-form-group">' +
      '<label>Pads used</label>' +
      '<input type="number" id="daily-pads" min="0" max="100" value="0">' +
      '</div>' +
      '<div class="app-form-group">' +
      '<label>Urgent need to defecate?</label>' +
      '<div class="app-form-options" id="daily-urgency"></div>' +
      '</div>' +
      '<div class="app-form-group">' +
      '<label>Stools at night?</label>' +
      '<div class="app-form-options" id="daily-night"></div>' +
      '</div>' +
      '<div class="app-form-group">' +
      '<label>Leakage</label>' +
      '<div class="app-form-options" id="daily-leakage"></div>' +
      '</div>' +
      '<div class="app-form-group">' +
      '<label>Incomplete evacuation?</label>' +
      '<div class="app-form-options" id="daily-incomplete"></div>' +
      '</div>' +
      '<div class="app-form-group">' +
      '<label>Bloating (0–10)</label>' +
      '<div class="app-form-slider-wrap"><input type="range" id="daily-bloating" min="0" max="10" value="0"></div>' +
      '<span id="daily-bloating-val">0</span>' +
      '</div>' +
      '<div class="app-form-group">' +
      '<label>Impact score (0–10)</label>' +
      '<div class="app-form-slider-wrap"><input type="range" id="daily-impact" min="0" max="10" value="0"></div>' +
      '<span id="daily-impact-val">0</span>' +
      '</div>' +
      '<div class="app-form-group">' +
      '<label>Activity interference (0–10)</label>' +
      '<div class="app-form-slider-wrap"><input type="range" id="daily-activity" min="0" max="10" value="0"></div>' +
      '<span id="daily-activity-val">0</span>' +
      '</div>' +
      '<div class="app-form-group">' +
      '<label>Bristol scale (1–7)</label>' +
      '<input type="number" id="daily-bristol" min="1" max="7" value="1">' +
      '</div>' +
      '<div class="app-form-group">' +
      '<label>Food consumption (servings per item, 0–10)</label>' +
      '<div id="daily-food"></div>' +
      '</div>' +
      '<div class="app-form-group">' +
      '<label>Drink consumption</label>' +
      '<div id="daily-drink"></div>' +
      '</div>' +
      '<div class="app-form-actions">' +
      '<button type="submit" class="app-btn app-btn-primary">Submit</button>' +
      '</div>' +
      '</form>' +
      '</div>'
    );
  }

  function renderOptions(parentId, options, selectedValue, namePrefix) {
    var parent = document.getElementById(parentId);
    if (!parent) return;
    parent.innerHTML = '';
    options.forEach(function (opt) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'app-form-option' + (opt.value === selectedValue ? ' selected' : '');
      btn.textContent = opt.label;
      btn.dataset.value = opt.value;
      btn.addEventListener('click', function () {
        parent.querySelectorAll('.app-form-option').forEach(function (b) { b.classList.remove('selected'); });
        btn.classList.add('selected');
      });
      parent.appendChild(btn);
    });
  }

  function renderFoodDrink() {
    var foodEl = document.getElementById('daily-food');
    var drinkEl = document.getElementById('daily-drink');
    if (foodEl) {
      foodEl.innerHTML = FOOD_KEYS.map(function (k) {
        return '<div class="app-form-group"><label>' + k.replace(/_/g, ' ') + '</label><input type="number" min="0" max="10" value="0" data-food="' + k + '"></div>';
      }).join('');
    }
    if (drinkEl) {
      drinkEl.innerHTML = DRINK_KEYS.map(function (k) {
        return '<div class="app-form-group"><label>' + k.replace(/_/g, ' ') + '</label><input type="number" min="0" max="10" value="0" data-drink="' + k + '"></div>';
      }).join('');
    }
  }

  function collectPayload() {
    var raw = {
      stool_count: parseInt(document.getElementById('daily-stool').value, 10) || 0,
      pads_used: parseInt(document.getElementById('daily-pads').value, 10) || 0,
      urgency: (document.querySelector('#daily-urgency .app-form-option.selected') || {}).dataset?.value || 'No',
      night_stools: (document.querySelector('#daily-night .app-form-option.selected') || {}).dataset?.value || 'No',
      leakage: (document.querySelector('#daily-leakage .app-form-option.selected') || {}).dataset?.value || 'None',
      incomplete_evacuation: (document.querySelector('#daily-incomplete .app-form-option.selected') || {}).dataset?.value || 'No',
      bloating: parseFloat(document.getElementById('daily-bloating').value, 10) || 0,
      impact_score: parseFloat(document.getElementById('daily-impact').value, 10) || 0,
      activity_interfere: parseFloat(document.getElementById('daily-activity').value, 10) || 0
    };
    var bristol = parseInt(document.getElementById('daily-bristol').value, 10) || 1;
    var food = {};
    document.querySelectorAll('[data-food]').forEach(function (inp) {
      food[inp.dataset.food] = parseInt(inp.value, 10) || 0;
    });
    var drink = {};
    document.querySelectorAll('[data-drink]').forEach(function (inp) {
      drink[inp.dataset.drink] = parseInt(inp.value, 10) || 0;
    });
    return {
      entry_date: todayStr(),
      bristol_scale: bristol,
      food_consumption: food,
      drink_consumption: drink,
      raw_data: raw
    };
  }

  function show() {
    container = document.getElementById('app-screen-daily');
    if (!container) return;
    container.innerHTML = buildForm();
    renderOptions('daily-urgency', [{ value: 'Yes', label: 'Yes' }, { value: 'No', label: 'No' }], 'No');
    renderOptions('daily-night', [{ value: 'Yes', label: 'Yes' }, { value: 'No', label: 'No' }], 'No');
    renderOptions('daily-leakage', [{ value: 'None', label: 'None' }, { value: 'Liquid', label: 'Liquid' }, { value: 'Solid', label: 'Solid' }], 'None');
    renderOptions('daily-incomplete', [{ value: 'Yes', label: 'Yes' }, { value: 'No', label: 'No' }], 'No');
    renderFoodDrink();

    var bloatingEl = document.getElementById('daily-bloating');
    var impactEl = document.getElementById('daily-impact');
    var activityEl = document.getElementById('daily-activity');
    if (bloatingEl) {
      bloatingEl.addEventListener('input', function () {
        var v = document.getElementById('daily-bloating-val');
        if (v) v.textContent = bloatingEl.value;
      });
    }
    if (impactEl) {
      impactEl.addEventListener('input', function () {
        var v = document.getElementById('daily-impact-val');
        if (v) v.textContent = impactEl.value;
      });
    }
    if (activityEl) {
      activityEl.addEventListener('input', function () {
        var v = document.getElementById('daily-activity-val');
        if (v) v.textContent = activityEl.value;
      });
    }

    document.getElementById('daily-back').addEventListener('click', function (e) {
      e.preventDefault();
      if (opts.showScreen) opts.showScreen('dashboard');
    });

    document.getElementById('daily-form').addEventListener('submit', function (e) {
      e.preventDefault();
      var payload = collectPayload();
      API.sendDaily(null, payload, function (err) {
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
    if (global.ILARS_APP && global.ILARS_APP.showScreen) {
      var originalShow = global.ILARS_APP.showScreen;
      global.ILARS_APP.showScreen = function (id) {
        if (id === 'daily') show();
        originalShow(id);
      };
    }
  }

  global.ILARS_APP_DAILY = {
    init: init,
    show: show
  };
})(typeof window !== 'undefined' ? window : this);
