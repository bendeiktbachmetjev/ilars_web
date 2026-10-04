/* ui/boot.js — the access gate (DESIGN-SPEC §3.17, §4.1). Replaces the inline gate script of doctor.html.
   The shell (top bar + list-shaped skeleton) paints at once; the glass card names each step.
   window.ILARS_BOOT resolves with the /doctors/me answer after: signed-in Firebase user → profile → translations
   (+ the English fallback dictionary). app.js starts routing only then.

   /doctors/me outcome            → what happens
   200 + profile                  → body.profile-checked, ILARS_BOOT resolves
   200 + needs_profile            → doctor-setup.html (one retry after 1.5 s when the setup page just completed)
   401 / 403                      → ILARS_AUTH_CHECK.signOut() → login.html
   status 0 (network/timeout), 5xx, anything else → error card with Try again / Sign out (never doctor-setup.html) */
(function (g) {
  'use strict';
  var UI = g.ILARS_UI;
  var EN_FALLBACK = 'locales/en.json?v=11';   // keep the ?v= equal to js/i18n.js
  var LANGS = { en: 'English', lt: 'Lietuvių', it: 'Italiano', es: 'Español', tr: 'Türkçe' };
  var bootResolve;
  g.ILARS_BOOT = new Promise(function (r) { bootResolve = r; });

  function $(id) { return document.getElementById(id); }
  function step(i) {
    UI.$$('.app-boot__steps li').forEach(function (li, j) { li.classList.toggle('is-done', j < i); li.classList.toggle('is-active', j === i); });
  }
  function signOut() {
    g.ILARS_AUTH_CHECK.signOut().then(function () { g.location.href = 'login.html'; });
  }
  /** Translations of the chosen language + the English fallback (ui/core.js t()) are both in. */
  function i18nReady() {
    return Promise.all([new Promise(function (r) { g.ILARS_I18N.onReady(r); }), UI.loadFallback(EN_FALLBACK)]);
  }

  /** Resolves with the signed-in Firebase user (the session itself was checked by requireAuth()). */
  function firebaseUser() {
    return new Promise(function (resolve, reject) {
      var A = g.ILARS_AUTH;
      if (!A.auth && !A.init()) { reject(Object.assign(new Error('Firebase could not start'), { status: 0 })); return; }
      if (A.auth.currentUser) { resolve(A.auth.currentUser); return; }
      var done = false, off = A.onAuthStateChanged(function (user) {
        if (!user || done) return;
        done = true; if (typeof off === 'function') off();
        resolve(user);
      });
    });
  }

  // ---------------------------------------------------------------- top bar (after the profile is known)
  function topbar(me) {
    var p = me.profile || {};
    var name = [p.first_name, p.last_name].filter(Boolean).join(' ');
    var btn = $('account-btn');
    btn.querySelector('.app-account__avatar').textContent = ((p.first_name || '')[0] || '') + ((p.last_name || '')[0] || '');
    btn.querySelector('.app-account__name').textContent = name;
    btn.querySelector('.app-account__org').textContent = p.doctor_code || '';
    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      var items = [
        { head: UI.t('doctor.ui.shell.signed_in_as', { email: p.email || '' }) },
        { head: p.hospital_name || '' },
        { head: UI.t('doctor.ui.shell.doctor_code') + ' · ' + (p.doctor_code || '') },
        { sep: true }
      ];
      // phones: the language list lives in this menu (.app-lang is hidden below 768 px)
      if (g.matchMedia('(max-width: 767px)').matches) {
        var cur = g.ILARS_I18N.getLang();
        items.push({ head: UI.t('doctor.ui.shell.language') });
        Object.keys(LANGS).forEach(function (l) {
          items.push({ label: LANGS[l], checked: l === cur, onSelect: function () { g.ILARS_I18N.setLang(l); } });
        });
        items.push({ sep: true });
      }
      items.push({ label: UI.t('nav.logout'), icon: 'logout', id: 'btn-logout', onSelect: signOut });
      UI.menu(btn, items, { align: 'end', label: UI.t('doctor.ui.shell.account') });
    });
    ['hospital-name-study', 'hospital-name-reg'].forEach(function (id) { var el = $(id); if (el) el.textContent = p.hospital_name || ''; });
  }

  // ---------------------------------------------------------------- outcomes
  function proceed(me) {
    try { g.sessionStorage.setItem('ilars_doctor_profile_completed', '1'); } catch (e) { /* private mode */ }
    step(2);
    topbar(me);
    return i18nReady().then(function () {
      UI.patchAria();
      document.body.classList.add('profile-checked');
      bootResolve(me);
    });
  }
  function failed(err) {
    var status = err && err.status;
    if (status === 401 || status === 403) { signOut(); return; }
    if (g.console) console.warn('Profile check failed:', err);
    i18nReady().then(function () {
      var card = document.querySelector('.app-boot__text');
      card.innerHTML = '<div class="app-boot__title"></div><p class="t-footnote t-secondary"></p>' +
        '<div class="app-boot__actions"><button class="ui-btn ui-btn--primary ui-btn--sm" type="button" data-act="retry"></button>' +
        '<button class="ui-btn ui-btn--fill ui-btn--sm" type="button" data-act="out"></button></div>';
      card.querySelector('.app-boot__title').textContent = UI.t(status === 0 || status == null ? 'doctor.ui.boot.error_title' : 'doctor.ui.boot.error_title_server');
      card.querySelector('p').textContent = UI.t('doctor.ui.boot.error_text');
      card.querySelector('[data-act="retry"]').textContent = UI.t('doctor.ui.boot.retry');
      card.querySelector('[data-act="out"]').textContent = UI.t('doctor.ui.boot.sign_out');
      card.querySelector('[data-act="retry"]').addEventListener('click', function () { g.location.reload(); });
      card.querySelector('[data-act="out"]').addEventListener('click', signOut);
      document.querySelector('.app-boot').classList.add('is-error');
    });
  }
  function check(me, mayRetry) {
    if (me && me.status === 'ok' && !me.needs_profile) return proceed(me);
    if (me && me.status === 'ok' && me.needs_profile && mayRetry) {
      // the setup page just saved the profile: give the database a moment, then ask once more (today's behaviour)
      return UI.sleep(1500).then(function () {
        g.ILARS_DATA.store.invalidate('profile');
        return g.ILARS_PROFILE().then(function (again) { return check(again, false); });
      });
    }
    g.location.href = 'doctor-setup.html';
  }

  function start() {
    // skip link: the hash belongs to the router (#main is not a route), so move focus without navigating
    document.querySelector('.app-skip').addEventListener('click', function (e) { e.preventDefault(); $('main').focus(); });
    UI.bindLangMenu();
    if (!g.ILARS_AUTH_CHECK.requireAuth()) return;               // no session: redirecting to login.html
    var justCompleted = false;
    try { justCompleted = g.sessionStorage.getItem('ilars_doctor_profile_completed') === '1'; } catch (e) { /* */ }
    firebaseUser()
      .then(function () { step(1); return g.ILARS_PROFILE(); })
      .then(function (me) { return check(me, justCompleted); })
      .catch(failed);
  }
  start();
})(window);
