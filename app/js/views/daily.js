/**
 * iLARS Patient Web App — Daily questionnaire view
 * Same fields and payload as mobile app: raw_data + food_consumption + drink_consumption + bristol_scale
 */
(function (global) {
  'use strict';

  var API = global.ILARS_APP_API;

  function _t(key) {
    return global.ILARS_I18N && global.ILARS_I18N.t ? global.ILARS_I18N.t(key) : key;
  }

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
      '<a href="#" class="app-back-link" id="daily-back">' + _t('app.back_to_dashboard') + '</a>' +
      '<div class="app-section">' +
      '<h1 class="app-form-title">' + _t('app.daily_title') + '</h1>' +
      '<form id="daily-form">' +
      '<div class="app-form-group">' +
      '<label>' + _t('app.stool_per_day') + '</label>' +
      '<input type="number" id="daily-stool" min="0" max="100" value="0">' +
      '</div>' +
      '<div class="app-form-group">' +
      '<label>' + _t('app.pads_used') + '</label>' +
      '<input type="number" id="daily-pads" min="0" max="100" value="0">' +
      '</div>' +
      '<div class="app-form-group">' +
      '<label>' + _t('app.urgent_need') + '</label>' +
      '<div class="app-form-options" id="daily-urgency"></div>' +
      '</div>' +
      '<div class="app-form-group">' +
      '<label>' + _t('app.stools_at_night') + '</label>' +
      '<div class="app-form-options" id="daily-night"></div>' +
      '</div>' +
      '<div class="app-form-group">' +
      '<label>' + _t('app.leakage') + '</label>' +
      '<div class="app-form-options" id="daily-leakage"></div>' +
      '</div>' +
      '<div class="app-form-group">' +
      '<label>' + _t('app.incomplete_evacuation') + '</label>' +
      '<div class="app-form-options" id="daily-incomplete"></div>' +
      '</div>' +
      '<div class="app-form-group">' +
      '<label>' + _t('app.bloating') + ' (0–10)</label>' +
      '<div class="app-form-slider-wrap"><input type="range" id="daily-bloating" min="0" max="10" value="0"></div>' +
      '<span id="daily-bloating-val">0</span>' +
      '</div>' +
      '<div class="app-form-group">' +
      '<label>' + _t('app.impact_score') + ' (0–10)</label>' +
      '<div class="app-form-slider-wrap"><input type="range" id="daily-impact" min="0" max="10" value="0"></div>' +
      '<span id="daily-impact-val">0</span>' +
      '</div>' +
      '<div class="app-form-group">' +
      '<label>' + _t('app.activity_interference') + ' (0–10)</label>' +
      '<div class="app-form-slider-wrap"><input type="range" id="daily-activity" min="0" max="10" value="0"></div>' +
      '<span id="daily-activity-val">0</span>' +
      '</div>' +
      '<div class="app-form-group">' +
      '<label>' + _t('app.food_consumption') + '</label>' +
      '<div id="daily-food"></div>' +
      '</div>' +
      '<div class="app-form-group">' +
      '<label>' + _t('app.drink_consumption') + '</label>' +
      '<div id="daily-drink"></div>' +
      '</div>' +
      '<div class="app-form-group">' +
      '<label>' + _t('app.bristol_scale') + ' (1–7)</label>' +
      '<div class="app-bristol-scale" id="daily-bristol-scale"></div>' +
      '<input type="number" id="daily-bristol" min="1" max="7" value="1" style="display:none;">' +
      '</div>' +
      '<div class="app-form-actions">' +
      '<button type="submit" class="app-btn app-btn-primary">' + _t('app.submit') + '</button>' +
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

  var FOOD_ICONS = {
    vegetables_all_types: '🥬',
    root_vegetables: '🍠',
    whole_grains: '🌾',
    whole_grain_bread: '🍞',
    nuts_and_seeds: '🌰',
    legumes: '🌱',
    fruits_with_skin: '🍏',
    berries_any: '🫐',
    soft_fruits_without_skin: '🍌',
    muesli_and_bran_cereals: '🥣'
  };

  var DRINK_ICONS = {
    water: '💧',
    coffee: '☕',
    tea: '🫖',
    alcohol: '🍷',
    carbonated_drinks: '🥤',
    juices: '🧃',
    dairy_drinks: '🥛',
    energy_drinks: '⚡'
  };

  function renderBristolScale() {
    var container = document.getElementById('daily-bristol-scale');
    if (!container) return;
    var basePath = global.location.pathname.indexOf('/app/') !== -1 ? '../images/bristol_scale/' : 'images/bristol_scale/';
    var html = '<div class="app-bristol-grid">';
    for (var i = 1; i <= 7; i++) {
      var imgPath = basePath + 'bristol_' + i + '.png';
      html += '<div class="app-bristol-item' + (i === 1 ? ' selected' : '') + '" data-value="' + i + '">';
      html += '<img src="' + imgPath + '" alt="Bristol ' + i + '" class="app-bristol-img" onerror="this.style.display=\'none\'">';
      html += '<span class="app-bristol-number">' + i + '</span>';
      html += '</div>';
    }
    html += '</div>';
    container.innerHTML = html;
    container.querySelectorAll('.app-bristol-item').forEach(function (item) {
      item.addEventListener('click', function () {
        var val = parseInt(item.dataset.value, 10);
        var bristolInput = document.getElementById('daily-bristol');
        if (bristolInput) bristolInput.value = val;
        container.querySelectorAll('.app-bristol-item').forEach(function (i) { i.classList.remove('selected'); });
        item.classList.add('selected');
      });
    });
  }

  function renderFoodDrink() {
    var foodEl = document.getElementById('daily-food');
    var drinkEl = document.getElementById('daily-drink');
    if (foodEl) {
      foodEl.innerHTML = '<div class="app-food-grid">' + FOOD_KEYS.map(function (k) {
        var icon = FOOD_ICONS[k] || '🍽️';
        var label = _t('app.food_' + k);
        return '<div class="app-food-item">' +
          '<div class="app-food-icon">' + icon + '</div>' +
          '<label class="app-food-label">' + label + '</label>' +
          '<input type="number" min="0" max="10" value="0" data-food="' + k + '" class="app-food-input">' +
          '</div>';
      }).join('') + '</div>';
    }
    if (drinkEl) {
      drinkEl.innerHTML = '<div class="app-drink-grid">' + DRINK_KEYS.map(function (k) {
        var icon = DRINK_ICONS[k] || '🥤';
        var label = _t('app.drink_' + k);
        return '<div class="app-drink-item">' +
          '<div class="app-drink-icon">' + icon + '</div>' +
          '<label class="app-drink-label">' + label + '</label>' +
          '<input type="number" min="0" max="10" value="0" data-drink="' + k + '" class="app-drink-input">' +
          '</div>';
      }).join('') + '</div>';
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
    renderOptions('daily-urgency', [{ value: 'Yes', label: _t('app.yes') }, { value: 'No', label: _t('app.no') }], 'No');
    renderOptions('daily-night', [{ value: 'Yes', label: _t('app.yes') }, { value: 'No', label: _t('app.no') }], 'No');
    renderOptions('daily-leakage', [{ value: 'None', label: _t('app.none') }, { value: 'Liquid', label: _t('app.liquid') }, { value: 'Solid', label: _t('app.solid') }], 'None');
    renderOptions('daily-incomplete', [{ value: 'Yes', label: _t('app.yes') }, { value: 'No', label: _t('app.no') }], 'No');
    renderBristolScale();
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
