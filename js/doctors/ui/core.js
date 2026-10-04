/* ui/core.js — DOM, i18n and formatting helpers (classic script, namespace ILARS_UI). DESIGN-SPEC §6.2, §8.
   No dependencies except ILARS_ICONS and (optionally) ILARS_I18N.
   Rule: untrusted text (names, codes, API strings) goes into HTML only through esc() or textContent. */
(function (g) {
  'use strict';
  var UI = g.ILARS_UI = g.ILARS_UI || {};
  var DAY_MS = 86400000;

  // ---------------------------------------------------------------- DOM
  /** Escapes & < > " ' — safe for text AND attribute values (fixes today's quote bug, research 02 §0.3). */
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  UI.esc = esc; UI.$ = $; UI.$$ = $$;
  UI.icon = function (n, c) { return g.ILARS_ICONS ? g.ILARS_ICONS.icon(n, c) : ''; };
  UI.params = new URLSearchParams(g.location.search);

  // ---------------------------------------------------------------- i18n
  /** Lookup order: current locale (ILARS_I18N.t, which returns the key when missing) → the ENGLISH dictionary
      (UI.loadFallback() fetches locales/en.json?v=… once when the UI language is not English or the locale
      fetch failed; ui/boot.js does this before the first route) → the key itself. Each missing key is logged once.
      So a missing translation or a failed locale fetch shows English, never 'doctor.cm.kpi.attention'. */
  var warned = {};
  function dig(d, key) {
    if (!d) return null;
    var o = key.split('.').reduce(function (a, p) { return a == null ? undefined : a[p]; }, d);
    return typeof o === 'string' ? o : null;
  }
  function lookup(key) {
    if (g.ILARS_I18N && typeof g.ILARS_I18N.t === 'function') { var v = g.ILARS_I18N.t(key); if (typeof v === 'string' && v !== key) return v; }
    var en = dig(UI._fallback, key);
    if (en != null && lang() !== 'en' && !warned[key]) { warned[key] = 1; if (g.console) console.warn('[i18n] ' + lang() + ' lacks ' + key + ' (English shown)'); }
    return en;
  }
  function t(key, params) {
    var s = lookup(key);
    if (s == null) { if (!warned[key] && g.console) { warned[key] = 1; console.warn('[i18n] missing ' + key); } return key; }
    return params ? s.replace(/\{(\w+)\}/g, function (m, n) { return params[n] != null ? params[n] : m; }) : s;
  }
  /** Fetch the English dictionary once as the fallback (same ?v= cache buster as i18n.js). */
  UI.loadFallback = function (url) {
    if (UI._fallback || !g.fetch) return Promise.resolve(UI._fallback);
    return g.fetch(url).then(function (r) { return r.ok ? r.json() : null; }).then(function (d) { UI._fallback = d; return d; }, function () { return null; });
  };
  /** i18n.js translates textContent / innerHTML / placeholder only. Accessible names use data-i18n-aria-label;
      call after ILARS_I18N.onReady and in _onLangChange (JS-rendered aria-labels always go through t()). */
  UI.patchAria = function (root) {
    Array.prototype.forEach.call((root || document).querySelectorAll('[data-i18n-aria-label]'), function (el) {
      var k = el.getAttribute('data-i18n-aria-label'), v = t(k);
      if (v !== k) { el.setAttribute('aria-label', v); if (el.hasAttribute('title')) el.setAttribute('title', v); }
    });
  };
  function lang() { return (document.documentElement.lang || 'en').slice(0, 2); }
  /** Formatting locale per UI language: English uses en-GB (day-month order, 24 h) — this is a European clinical tool. */
  var LOCALES = { en: 'en-GB', lt: 'lt-LT', it: 'it-IT', es: 'es-ES', tr: 'tr-TR' };
  function locale() { return LOCALES[lang()] || lang(); }
  var PR = {};
  function plural(l, n) { PR[l] = PR[l] || new Intl.PluralRules(l); return PR[l].select(n); }
  /** The current locale's own text, or null (no English fallback, no warning). */
  function own(key) {
    var v = g.ILARS_I18N && typeof g.ILARS_I18N.t === 'function' ? g.ILARS_I18N.t(key) : null;
    return typeof v === 'string' && v !== key ? v : null;
  }
  /** Plurals: key_one / key_few / key_other via Intl.PluralRules (Lithuanian needs _few). The category follows the
      language of the text actually shown: when this locale lacks the key, the English text gets English rules
      (else lt 181 → "one" → "181 day"). */
  function tp(key, n, params) {
    var l = lang();
    if (l !== 'en' && own(key + '_other') == null && own(key + '_' + plural(l, n)) == null) l = 'en';
    var k = key + '_' + plural(l, n);
    if (lookup(k) == null) k = key + '_other';
    return t(k, Object.assign({ n: n }, params || {}));
  }
  UI.t = t; UI.tp = tp; UI.lang = lang; UI.locale = locale;

  // ---------------------------------------------------------------- format (all day values are UTC day keys)
  var cache = {};
  function f(id, opts) { var k = lang() + id; return cache[k] || (cache[k] = new Intl.DateTimeFormat(locale(), Object.assign({ timeZone: 'UTC' }, opts))); }
  /** Month label of an axis: the short name ("Jun"), or the long name where the locale's short month is only a
      number (Lithuanian CLDR gives "06", which would read as a day next to "06-08"): "birželis". Same rule as
      charts/base.js monthNames(). */
  function axisMonth(d) {
    var s = f('m', { month: 'short' }).format(d);
    return /^\d+\.?$/.test(s) ? f('ml', { month: 'long' }).format(d) : s;
  }
  /** Lithuanian CLDR abbreviated month names. Intl formats lt {day, month: 'short'} as "09-28", with the year as
      "2026-09-28" and {month: 'short'} as "09" (CLDR lt MMMd = MM-dd), so Lithuanian labels are built here:
      "rugs. 28", "2026 m. rugs. 28 d.", "rugs.", "2026 m. rugs.". */
  var LT_MONTHS = ['saus.', 'vas.', 'kov.', 'bal.', 'geg.', 'birž.', 'liep.', 'rugp.', 'rugs.', 'spal.', 'lapkr.', 'gruod.'];
  function dayMonth(d) {
    return lang() === 'lt' ? LT_MONTHS[d.getUTCMonth()] + ' ' + d.getUTCDate() : f('dm', { day: 'numeric', month: 'short' }).format(d);
  }
  function dayMonthYear(d) {
    return lang() === 'lt' ? d.getUTCFullYear() + ' m. ' + LT_MONTHS[d.getUTCMonth()] + ' ' + d.getUTCDate() + ' d.'
      : f('dmy', { day: 'numeric', month: 'short', year: 'numeric' }).format(d);
  }
  /** style: 'short' (day + month, the year only when it is not today's year) · 'axis' · 'weekday' · 'month' ("Sept",
      lt "rugs.") · 'monthYear' ("Sept 2026", lt "2026 m. rugs.") · anything else = day + month + year. */
  function fmtDay(day, style, today) {
    if (day == null) return '—';
    var d = new Date(day * DAY_MS);
    if (style === 'month') return lang() === 'lt' ? LT_MONTHS[d.getUTCMonth()] : f('m', { month: 'short' }).format(d);
    if (style === 'monthYear') return lang() === 'lt' ? d.getUTCFullYear() + ' m. ' + LT_MONTHS[d.getUTCMonth()] : f('my', { month: 'short', year: 'numeric' }).format(d);
    if (style === 'axis') { if (d.getUTCDate() === 1) return d.getUTCMonth() === 0 ? f('y', { year: 'numeric' }).format(d) : axisMonth(d); return dayMonth(d); }
    if (style === 'short') {
      var y = new Date((today != null ? today : UI.today()) * DAY_MS).getUTCFullYear();
      return d.getUTCFullYear() === y ? dayMonth(d) : dayMonthYear(d);
    }
    if (style === 'weekday') return f('wd', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(d);
    return dayMonthYear(d);
  }
  function fmtNum(v, dec) {
    if (v == null || !isFinite(v)) return '—';
    var k = lang() + 'n' + (dec || 0);
    cache[k] = cache[k] || new Intl.NumberFormat(locale(), { minimumFractionDigits: dec || 0, maximumFractionDigits: dec || 0 });
    return cache[k].format(v);
  }
  /** "today", "yesterday", "3 days ago" up to 60 days, then a short date. Never local time. */
  function fmtRelative(day, today) {
    if (day == null) return '—';
    today = today != null ? today : UI.today();
    var n = today - day;
    if (n > 60) return fmtDay(day, 'short', today);
    var k = lang() + 'rel';
    cache[k] = cache[k] || new Intl.RelativeTimeFormat(locale(), { numeric: 'auto' });
    var s = cache[k].format(-Math.max(0, n), 'day');
    return s.charAt(0).toUpperCase() + s.slice(1);
  }
  /** Durations ("19 days", "10 months", lt "19 dienų") through Intl — correct plural forms in every locale, no keys. */
  function fmtUnit(n, unit) {
    var k = lang() + 'unit' + unit;
    cache[k] = cache[k] || new Intl.NumberFormat(locale(), { style: 'unit', unit: unit, unitDisplay: 'long' });
    return cache[k].format(n);
  }
  function fmtDays(n) { return fmtUnit(n, 'day'); }
  UI.fmtUnit = fmtUnit;
  /** Patient code: 12-char codes render in groups of 4 (separate spans, so copy/paste stays ungrouped). */
  function fmtCode(code) {
    code = String(code || '');
    if (code.length !== 12) return esc(code);
    return code.match(/.{4}/g).map(function (p) { return '<span class="cg">' + esc(p) + '</span>'; }).join('');
  }
  UI.fmtDay = fmtDay; UI.fmtNum = fmtNum; UI.fmtRelative = fmtRelative; UI.fmtDays = fmtDays; UI.fmtCode = fmtCode;
  /** today = server as_of_date when the extended API sends it, else the browser's UTC date (CHARTS-METRICS §1.2) */
  UI.today = function () { return UI._today != null ? UI._today : Math.floor(Date.now() / DAY_MS); };
})(window);
