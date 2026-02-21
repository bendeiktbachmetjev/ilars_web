/**
 * Lightweight i18n for iLARS static pages.
 * Detects browser language, loads JSON translations, and patches the DOM.
 * Supported: en (default), lt, it, es, tr
 */
(function (global) {
  'use strict';

  var SUPPORTED = ['en', 'lt', 'it', 'es', 'tr'];
  var DEFAULT = 'en';
  var STORAGE_KEY = 'ilars_lang';
  var translations = {};
  var currentLang = DEFAULT;

  function localesBase() {
    var scripts = document.querySelectorAll('script[src*="i18n.js"]');
    if (scripts.length) {
      return scripts[0].getAttribute('src').replace(/js\/i18n\.js.*$/, 'locales/');
    }
    return global.location.pathname.indexOf('/app/') !== -1 ? '../locales/' : 'locales/';
  }

  function detect() {
    var saved = null;
    try { saved = global.localStorage.getItem(STORAGE_KEY); } catch (e) { /* private browsing */ }
    if (saved && SUPPORTED.indexOf(saved) !== -1) return saved;

    var langs = global.navigator.languages || [global.navigator.language || ''];
    for (var i = 0; i < langs.length; i++) {
      var code = (langs[i] || '').split('-')[0].toLowerCase();
      if (SUPPORTED.indexOf(code) !== -1) return code;
    }
    return DEFAULT;
  }

  function resolve(obj, path) {
    var parts = path.split('.');
    var v = obj;
    for (var i = 0; i < parts.length; i++) {
      if (v == null) return undefined;
      v = v[parts[i]];
    }
    return v;
  }

  function t(key) {
    return resolve(translations, key) || key;
  }

  function patchDOM() {
    var els = document.querySelectorAll('[data-i18n]');
    for (var i = 0; i < els.length; i++) {
      var v = resolve(translations, els[i].getAttribute('data-i18n'));
      if (v !== undefined) els[i].textContent = v;
    }

    var htmlEls = document.querySelectorAll('[data-i18n-html]');
    for (var j = 0; j < htmlEls.length; j++) {
      var h = resolve(translations, htmlEls[j].getAttribute('data-i18n-html'));
      if (h !== undefined) htmlEls[j].innerHTML = h;
    }

    var phEls = document.querySelectorAll('[data-i18n-placeholder]');
    for (var k = 0; k < phEls.length; k++) {
      var p = resolve(translations, phEls[k].getAttribute('data-i18n-placeholder'));
      if (p !== undefined) phEls[k].setAttribute('placeholder', p);
    }

    var page = (document.body.getAttribute('data-i18n-page') || '').trim();
    if (page && translations.meta) {
      var title = translations.meta['title_' + page];
      if (title) document.title = title;
    }

    document.documentElement.setAttribute('lang', currentLang);
    refreshSwitcher();
  }

  function refreshSwitcher() {
    var cur = document.querySelector('.lang-current');
    if (cur) cur.textContent = currentLang.toUpperCase();
    var items = document.querySelectorAll('.lang-dropdown button[data-lang]');
    for (var i = 0; i < items.length; i++) {
      items[i].classList.toggle('is-active', items[i].getAttribute('data-lang') === currentLang);
    }
  }

  function load(lang, cb) {
    if (lang === DEFAULT) {
      translations = {};
      currentLang = lang;
      return cb();
    }
    var url = localesBase() + lang + '.json';
    fetch(url)
      .then(function (r) {
        if (!r.ok) throw new Error(r.status);
        return r.json();
      })
      .then(function (data) {
        translations = data;
        currentLang = lang;
        cb();
      })
      .catch(function () {
        console.warn('i18n: failed to load ' + lang);
        translations = {};
        currentLang = DEFAULT;
        cb();
      });
  }

  function setLang(lang) {
    if (SUPPORTED.indexOf(lang) === -1) lang = DEFAULT;
    try { global.localStorage.setItem(STORAGE_KEY, lang); } catch (e) { /* */ }
    if (lang === DEFAULT) {
      global.location.reload();
      return;
    }
    load(lang, patchDOM);
  }

  function initSwitcher() {
    var btn = document.querySelector('.lang-btn');
    var dropdown = document.querySelector('.lang-dropdown');
    if (!btn || !dropdown) return;

    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      var open = dropdown.classList.toggle('is-open');
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    });

    dropdown.addEventListener('click', function (e) {
      var target = e.target.closest('button[data-lang]');
      if (!target) return;
      dropdown.classList.remove('is-open');
      btn.setAttribute('aria-expanded', 'false');
      setLang(target.getAttribute('data-lang'));
    });

    document.addEventListener('click', function () {
      dropdown.classList.remove('is-open');
      btn.setAttribute('aria-expanded', 'false');
    });
  }

  function init() {
    var lang = detect();
    currentLang = lang;
    initSwitcher();
    if (lang !== DEFAULT) {
      load(lang, patchDOM);
    } else {
      refreshSwitcher();
    }
  }

  global.ILARS_I18N = { init: init, setLang: setLang, t: t, getLang: function () { return currentLang; } };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})(typeof window !== 'undefined' ? window : this);
