/**
 * iLARS Patient Web App — EQ-5D-5L questionnaire view
 * Same 5 dimensions (0–4) and health VAS (0–100) as mobile app
 */
(function (global) {
  'use strict';

  var API = global.ILARS_APP_API;

  var opts = {};

  function _t(key) {
    return global.ILARS_I18N && global.ILARS_I18N.t ? global.ILARS_I18N.t(key) : key;
  }

  function getDimensions() {
    return [
      { id: 'mobility', icon: '🚶', labelKey: 'app.eq_mobility', options: [
        _t('app.eq_mob_no_problems'), _t('app.eq_mob_slight'), _t('app.eq_mob_moderate'), _t('app.eq_mob_severe'), _t('app.eq_mob_unable')
      ]},
      { id: 'self_care', icon: '🧼', labelKey: 'app.eq_self_care', options: [
        _t('app.eq_sc_no_problems'), _t('app.eq_sc_slight'), _t('app.eq_sc_moderate'), _t('app.eq_sc_severe'), _t('app.eq_sc_unable')
      ]},
      { id: 'usual', icon: '🏠', labelKey: 'app.eq_usual_activities', options: [
        _t('app.eq_ua_no_problems'), _t('app.eq_ua_slight'), _t('app.eq_ua_moderate'), _t('app.eq_ua_severe'), _t('app.eq_ua_unable')
      ]},
      { id: 'pain', icon: '🤕', labelKey: 'app.eq_pain_discomfort', options: [
        _t('app.eq_pain_none'), _t('app.eq_pain_slight'), _t('app.eq_pain_moderate'), _t('app.eq_pain_severe'), _t('app.eq_pain_extreme')
      ]},
      { id: 'anxiety', icon: '🧠', labelKey: 'app.eq_anxiety_depression', options: [
        _t('app.eq_anx_none'), _t('app.eq_anx_slight'), _t('app.eq_anx_moderate'), _t('app.eq_anx_severe'), _t('app.eq_anx_extreme')
      ]}
    ];
  }

  function todayStr() {
    var d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  function buildForm() {
    var dims = getDimensions();
    var html = '<a href="#" class="app-back-link" id="eq5d5l-back">' + _t('app.back_to_dashboard') + '</a><div class="app-section"><h1 class="app-form-title">' + _t('app.eq5d5l_title') + '</h1><form id="eq5d5l-form">';
    dims.forEach(function (dim) {
      html += ''
        + '<div class="app-form-group app-form-group-with-icon">'
        +   '<div class="app-form-label-wrap"><span class="app-form-icon">' + dim.icon + '</span><label>' + _t(dim.labelKey) + '</label></div>'
        +   '<div class="app-form-options" id="eq5d5l-' + dim.id + '"></div>'
        + '</div>';
    });
    html += ''
      + '<div class="app-form-group app-form-group-with-icon">'
      +   '<div class="app-slider-head">'
      +     '<div class="app-form-label-wrap"><span class="app-form-icon">❤️</span><label for="eq5d5l-vas">' + _t('app.eq_health_today') + '</label></div>'
      +     '<span class="app-value-chip" id="eq5d5l-vas-v">50</span>'
      +   '</div>'
      +   '<input class="app-range" type="range" id="eq5d5l-vas" min="0" max="100" value="50">'
      +   '<p class="app-question-desc">' + _t('app.eq_health_desc') + '</p>'
      + '</div>';
    html += '<div class="app-form-actions"><button type="submit" class="app-btn app-btn-primary">' + _t('app.submit') + '</button></div></form></div>';
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

    var dims = getDimensions();
    dims.forEach(function (dim) {
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

  global.ILARS_APP_EQ5D5L = {
    init: init,
    show: show
  };
})(typeof window !== 'undefined' ? window : this);
