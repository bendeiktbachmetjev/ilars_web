/**
 * iLARS Patient Web App — main router and auth
 * Ensures patient code is present; redirects to login if not. Handles logout and screen switching.
 */
(function (global) {
  'use strict';

  var API = global.ILARS_APP_API;
  var CONFIG = global.ILARS_APP_CONFIG || global.ILARS_CONFIG;

  if (!API || !CONFIG) {
    console.error('ILARS_APP_API and config required');
    return;
  }

  var main = document.getElementById('app-main');
  var screens = {
    dashboard: document.getElementById('app-screen-dashboard'),
    daily: document.getElementById('app-screen-daily'),
    weekly: document.getElementById('app-screen-weekly'),
    monthly: document.getElementById('app-screen-monthly'),
    eq5d5l: document.getElementById('app-screen-eq5d5l')
  };

  function redirectToLogin() {
    if (global.location.pathname.indexOf('/app/') !== -1 || global.location.pathname.endsWith('/app')) {
      global.location.href = '../login.html';
    } else {
      global.location.href = 'login.html';
    }
  }

  function showScreen(id) {
    Object.keys(screens).forEach(function (key) {
      var el = screens[key];
      if (!el) return;
      if (key === id) {
        el.classList.remove('is-hidden');
        el.setAttribute('aria-hidden', 'false');
      } else {
        el.classList.add('is-hidden');
        el.setAttribute('aria-hidden', 'true');
      }
    });
    if (id === 'daily' && global.ILARS_APP_DAILY && global.ILARS_APP_DAILY.show) {
      global.ILARS_APP_DAILY.show();
    }
    if (id === 'weekly' && global.ILARS_APP_WEEKLY && global.ILARS_APP_WEEKLY.show) {
      global.ILARS_APP_WEEKLY.show();
    }
    if (id === 'monthly' && global.ILARS_APP_MONTHLY && global.ILARS_APP_MONTHLY.show) {
      global.ILARS_APP_MONTHLY.show();
    }
    if (id === 'eq5d5l' && global.ILARS_APP_EQ5D5L && global.ILARS_APP_EQ5D5L.show) {
      global.ILARS_APP_EQ5D5L.show();
    }
  }

  function showToast(message) {
    var el = document.getElementById('app-toast');
    if (!el) return;
    el.textContent = message;
    el.classList.add('is-visible');
    global.setTimeout(function () {
      el.classList.remove('is-visible');
    }, 3000);
  }

  function initLogout() {
    var btn = document.getElementById('app-logout');
    if (btn) {
      btn.addEventListener('click', function () {
        try {
          if (global.sessionStorage) {
            global.sessionStorage.removeItem(CONFIG.STORAGE_KEYS.PATIENT_CODE);
            global.sessionStorage.removeItem(CONFIG.STORAGE_KEYS.USER_ROLE);
          }
        } catch (e) {}
        redirectToLogin();
      });
    }
  }

  function init() {
    var code = API.getPatientCode();
    if (!code || !code.trim()) {
      redirectToLogin();
      return;
    }

    initLogout();

    if (global.ILARS_APP_DASHBOARD && typeof global.ILARS_APP_DASHBOARD.init === 'function') {
      global.ILARS_APP_DASHBOARD.init({
        showScreen: showScreen,
        showToast: showToast
      });
    }

    if (global.ILARS_APP_DAILY && typeof global.ILARS_APP_DAILY.init === 'function') {
      global.ILARS_APP_DAILY.init({ showScreen: showScreen, showToast: showToast });
    }
    if (global.ILARS_APP_WEEKLY && typeof global.ILARS_APP_WEEKLY.init === 'function') {
      global.ILARS_APP_WEEKLY.init({ showScreen: showScreen, showToast: showToast });
    }
    if (global.ILARS_APP_MONTHLY && typeof global.ILARS_APP_MONTHLY.init === 'function') {
      global.ILARS_APP_MONTHLY.init({ showScreen: showScreen, showToast: showToast });
    }
    if (global.ILARS_APP_EQ5D5L && typeof global.ILARS_APP_EQ5D5L.init === 'function') {
      global.ILARS_APP_EQ5D5L.init({ showScreen: showScreen, showToast: showToast });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  global.ILARS_APP = {
    showScreen: showScreen,
    showToast: showToast
  };
})(typeof window !== 'undefined' ? window : this);
