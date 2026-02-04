/**
 * iLARS Patient Web App — EQ-5D-5L questionnaire view
 * Same 5 dimensions (0–4) and health VAS (0–100) as mobile app
 */
(function (global) {
  'use strict';

  var API = global.ILARS_APP_API;

  var opts = {};

  var DIMENSIONS = [
    { id: 'mobility', icon: '🚶', label: 'Mobility', options: ['No problems walking', 'Slight problems', 'Moderate problems', 'Severe problems', 'Unable to walk'] },
    { id: 'self_care', icon: '🧼', label: 'Self-care', options: ['No problems washing/dressing', 'Slight problems', 'Moderate problems', 'Severe problems', 'Unable to wash/dress'] },
    { id: 'usual', icon: '🏠', label: 'Usual activities', options: ['No problems', 'Slight problems', 'Moderate problems', 'Severe problems', 'Unable to do'] },
    { id: 'pain', icon: '🤕', label: 'Pain / discomfort', options: ['None', 'Slight', 'Moderate', 'Severe', 'Extreme'] },
    { id: 'anxiety', icon: '🧠', label: 'Anxiety / depression', options: ['Not anxious/depressed', 'Slightly', 'Moderately', 'Severely', 'Extremely'] }
  ];

  function todayStr() {
    var d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  function buildForm() {
    var html = '<a href="#" class="app-back-link" id="eq5d5l-back">← Back to dashboard</a><div class="app-section"><h1 class="app-form-title">EQ-5D-5L</h1><form id="eq5d5l-form">';
    DIMENSIONS.forEach(function (dim, i) {
      html += ''
        + '<div class="app-form-group app-form-group-with-icon">'
        +   '<div class="app-form-label-wrap"><span class="app-form-icon">' + dim.icon + '</span><label>' + dim.label + '</label></div>'
        +   '<div class="app-form-options" id="eq5d5l-' + dim.id + '"></div>'
        + '</div>';
    });
    html += ''
      + '<div class="app-form-group app-form-group-with-icon">'
      +   '<div class="app-slider-head">'
      +     '<div class="app-form-label-wrap"><span class="app-form-icon">❤️</span><label for="eq5d5l-vas">Your health today</label></div>'
      +     '<span class="app-value-chip" id="eq5d5l-vas-v">50</span>'
      +   '</div>'
      +   '<input class="app-range" type="range" id="eq5d5l-vas" min="0" max="100" value="50">'
      +   '<p class="app-question-desc">0 = worst imaginable health, 100 = best imaginable health</p>'
      + '</div>';
    html += '<div class="app-form-actions"><button type="submit" class="app-btn app-btn-primary">Submit</button></div></form></div>';
    return html;
  }

  function renderOptions(parentId, options) {
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

  function show() {
    var container = document.getElementById('app-screen-eq5d5l');
    if (!container) return;
    container.innerHTML = buildForm();

    DIMENSIONS.forEach(function (dim) {
      renderOptions('eq5d5l-' + dim.id, dim.options);
    });

    var vasEl = document.getElementById('eq5d5l-vas');
    var vasV = document.getElementById('eq5d5l-vas-v');
    if (vasEl && vasV) {
      vasEl.addEventListener('input', function () { vasV.textContent = vasEl.value; });
    }

    document.getElementById('eq5d5l-back').addEventListener('click', function (e) {
      e.preventDefault();
      if (opts.showScreen) opts.showScreen('dashboard');
    });

    document.getElementById('eq5d5l-form').addEventListener('submit', function (e) {
      e.preventDefault();
      var mobility = getSelectedIndex('eq5d5l-mobility');
      var selfCare = getSelectedIndex('eq5d5l-self_care');
      var usual = getSelectedIndex('eq5d5l-usual');
      var pain = getSelectedIndex('eq5d5l-pain');
      var anxiety = getSelectedIndex('eq5d5l-anxiety');
      var healthVas = parseInt(document.getElementById('eq5d5l-vas').value, 10) || 50;
      var payload = {
        mobility: mobility,
        self_care: selfCare,
        usual_activities: usual,
        pain_discomfort: pain,
        anxiety_depression: anxiety,
        health_vas: healthVas,
        entry_date: todayStr()
      };
      API.sendEq5d5l(null, payload, function (err) {
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

  global.ILARS_APP_EQ5D5L = {
    init: init,
    show: show
  };
})(typeof window !== 'undefined' ? window : this);
