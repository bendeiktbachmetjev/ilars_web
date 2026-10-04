/* ui/overlay.js — dialog (native <dialog>), confirm, toast, menu, info popover.
   One system replaces the 4 modal systems + 2 overlay copies + alert()/confirm() of today.
   DESIGN-SPEC §3.11, §3.12, §3.18, §3.1 (language list), §3.7 (row links). Namespace ILARS_UI. */
(function (g) {
  'use strict';
  var UI = g.ILARS_UI;

  // ---------------------------------------------------------------- dialog
  /** Default first focus (DESIGN-SPEC §3.11): [autofocus] → the first field → the primary action → the first other
      control (e.g. the first item of a pick list) → the × / Cancel buttons last. Hidden and disabled ones are skipped.
      (showModal() alone focuses the first focusable element, which is the × button in the dialog head.) */
  var FOCUS_ORDER = ['[autofocus]', 'input:not([type="hidden"]), select, textarea', '[type="submit"], .ui-btn--primary, .ui-btn--danger',
    'button:not([data-close]):not(.ui-dialog__close), a[href], [tabindex]:not([tabindex="-1"])', 'button'];
  function firstFocus(dlg) {
    for (var i = 0; i < FOCUS_ORDER.length; i++) {
      var list = dlg.querySelectorAll(FOCUS_ORDER[i]);
      for (var j = 0; j < list.length; j++) if (!list[j].disabled && list[j].getClientRects().length) return list[j];
    }
    return null;
  }
  /** Opens a <dialog class="ui-dialog">: focus trap, Esc, inert page and focus return come from showModal().
      opts.focus = a selector for the first focus; without it (or when it matches nothing) see firstFocus(). */
  UI.openDialog = function (dlg, opts) {
    opts = opts || {};
    var opener = document.activeElement;
    dlg.returnValue = '';
    if (!dlg.open) dlg.showModal();
    var first = (opts.focus && dlg.querySelector(opts.focus)) || firstFocus(dlg);
    if (first) first.focus();
    function onClick(e) { if (e.target === dlg) UI.closeDialog(dlg); }            // backdrop click
    dlg.addEventListener('click', onClick);
    dlg.addEventListener('close', function done() {
      dlg.removeEventListener('click', onClick); dlg.removeEventListener('close', done);
      if (!dlg.returnValue) dlg.returnValue = 'cancel';                             // Esc (the browser leaves it empty)
      if (opener && opener.focus && document.contains(opener)) opener.focus();
      if (opts.onClose) opts.onClose(dlg.returnValue);
    });
  };
  UI.closeDialog = function (dlg, value) { if (dlg.open) dlg.close(value || 'cancel'); };

  /** Static dialogs with <form method="dialog">: [data-close] buttons (type="button") close with their value
      ('cancel' by default); the ONE type="submit" button runs o.submit() — so Enter in a field = the primary action.
      While it runs: .is-loading + aria-busy on the submit button, the dialog stays open. Resolved → closes with 'ok'
      (unless submit() returns false: e.g. create patient switches to its success state). Rejected → the dialog stays
      open with the typed values and o.error (a .ui-alert, role=alert) shows o.errorTitle + the detail. Bind once. */
  UI.dialogForm = function (dlg, o) {
    var form = dlg.querySelector('form'), btn = form.querySelector('[type="submit"]');
    dlg.addEventListener('click', function (e) { var c = e.target.closest('[data-close]'); if (c && dlg.contains(c)) UI.closeDialog(dlg, c.getAttribute('data-close') || 'cancel'); });
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (btn.classList.contains('is-loading')) return;
      if (o.error) o.error.hidden = true;
      btn.classList.add('is-loading'); btn.setAttribute('aria-busy', 'true');
      Promise.resolve().then(o.submit).then(function (keepOpen) {
        if (keepOpen !== false) UI.closeDialog(dlg, 'ok');
      }, function (err) {
        if (o.error) UI.alert(o.error, typeof o.errorTitle === 'function' ? o.errorTitle(err) : o.errorTitle, err);
      }).then(function () { btn.classList.remove('is-loading'); btn.removeAttribute('aria-busy'); });
    });
  };
  /** Fills a .ui-alert: icon, bold title, technical detail in small secondary text. */
  UI.alert = function (el, title, err, kind) {
    el.innerHTML = UI.icon(kind === 'info' ? 'info' : 'alert') + '<div><div class="ui-alert__title"></div><div class="t-footnote t-secondary"></div></div>';
    el.querySelector('.ui-alert__title').textContent = title;
    el.querySelector('.t-footnote').textContent = err && (err.detail || err.message) ? UI.t('doctor.ui.common.error_detail', { detail: err.detail || err.message }) : '';
    el.hidden = false;
  };

  /** Promise<boolean>. Replaces window.confirm() and the white-on-white status modal. */
  UI.confirm = function (o) {
    return new Promise(function (resolve) {
      var dlg = document.createElement('dialog');
      dlg.className = 'ui-dialog' + (o.danger ? ' ui-dialog--danger' : '');
      dlg.setAttribute('aria-labelledby', 'cf-title'); dlg.setAttribute('aria-describedby', 'cf-text');
      // o.action (optional) = () => Promise: runs on confirm with .is-loading; the dialog closes only when it
      // resolves; a rejection keeps it open with an inline alert (o.failTitle) — e.g. status change, delete status change.
      dlg.innerHTML = '<form method="dialog"><div class="ui-dialog__head"><div class="ui-dialog__icon">' + UI.icon(o.icon || (o.danger ? 'trash' : 'alert')) + '</div>' +
        '<h2 class="ui-dialog__title" id="cf-title"></h2><p class="ui-dialog__text" id="cf-text"></p>' +
        '<button class="ui-icon-btn ui-dialog__close" type="button" data-close aria-label="' + UI.esc(UI.t('doctor.ui.common.close')) + '">' + UI.icon('x', 'i--sm') + '</button></div>' +
        '<div class="ui-dialog__body" hidden><div class="ui-alert" role="alert" hidden></div></div>' +
        '<div class="ui-dialog__foot"><button class="ui-btn ui-btn--fill" type="button" data-close></button>' +
        '<button class="ui-btn ' + (o.danger ? 'ui-btn--danger' : 'ui-btn--primary') + '" type="submit"></button></div></form>';
      dlg.querySelector('#cf-title').textContent = o.title;          // text, never HTML (fixes the invisible message)
      dlg.querySelector('#cf-text').textContent = o.text || '';
      dlg.querySelector('[data-close].ui-btn').textContent = o.cancelLabel || UI.t('doctor.modal_cancel_btn');
      dlg.querySelector('[type="submit"]').textContent = o.confirmLabel;
      document.body.appendChild(dlg);
      var errEl = dlg.querySelector('.ui-alert');
      UI.dialogForm(dlg, { error: errEl, errorTitle: o.failTitle || UI.t('doctor.ui.common.error_generic'),
        submit: function () { errEl.parentNode.hidden = true; return Promise.resolve(o.action ? o.action() : null).catch(function (e) { errEl.parentNode.hidden = false; throw e; }); } });
      UI.openDialog(dlg, { focus: '[data-close].ui-btn', onClose: function (v) { resolve(v === 'ok'); setTimeout(function () { dlg.remove(); }, 400); } });
    });
  };

  // ---------------------------------------------------------------- toast
  /** One sentence. The region is NOT a live region; each toast carries its own role (status / alert), so screen
      readers announce once. Success: 3.2 s, paused while hovered or focused. Errors stay until closed (× button). */
  UI.toast = function (text, kind) {
    var region = document.getElementById('toast-region'); if (!region) return;
    var el = document.createElement('div');
    el.className = 'ui-toast' + (kind ? ' ui-toast--' + kind : '');
    el.setAttribute('role', kind === 'error' ? 'alert' : 'status');
    el.innerHTML = UI.icon(kind === 'error' ? 'alert' : 'check') + '<span></span>' +
      (kind === 'error' ? '<button class="ui-toast__close" type="button" aria-label="' + UI.esc(UI.t('doctor.ui.common.close')) + '">' + UI.icon('x') + '</button>' : '');
    el.querySelector('span').textContent = text;
    region.appendChild(el);
    var timer, left = 3200, since;
    function leave() { el.classList.add('is-leaving'); setTimeout(function () { el.remove(); }, 200); }
    function run() { since = Date.now(); timer = setTimeout(leave, left); }
    function pause() { clearTimeout(timer); left -= Date.now() - since; }
    if (kind === 'error') { el.querySelector('.ui-toast__close').addEventListener('click', leave); return el; }
    el.addEventListener('mouseenter', pause); el.addEventListener('mouseleave', run);
    el.addEventListener('focusin', pause); el.addEventListener('focusout', run);
    run(); return el;
  };

  // ---------------------------------------------------------------- menu (glass, anchored, keyboard)
  var openMenu = null;
  /** items: [{label, icon?, danger?, checked?, onSelect}] | {sep:true} | {head:'…'} */
  UI.menu = function (anchor, items, opts) {
    UI.closeMenu();
    opts = opts || {};
    var m = document.createElement('div');
    m.className = 'ui-menu is-open'; m.setAttribute('role', 'menu');
    if (opts.label) m.setAttribute('aria-label', opts.label);
    items.forEach(function (it) {
      if (it.sep) { var s = document.createElement('div'); s.className = 'ui-menu__sep'; s.setAttribute('role', 'separator'); m.appendChild(s); return; }
      if (it.head) { var h = document.createElement('div'); h.className = 'ui-menu__head'; h.textContent = it.head; m.appendChild(h); return; }
      var b = document.createElement('button');
      b.type = 'button'; b.className = 'ui-menu__item' + (it.danger ? ' ui-menu__item--danger' : '');
      b.setAttribute('role', it.checked != null ? 'menuitemradio' : 'menuitem');
      if (it.checked != null) b.setAttribute('aria-checked', String(!!it.checked));
      if (it.id) b.id = it.id;
      b.innerHTML = (it.icon ? UI.icon(it.icon, 'i--sm') : '') + '<span></span>';
      b.querySelector('span').textContent = it.label;
      b.addEventListener('click', function () { UI.closeMenu(); if (it.onSelect) it.onSelect(); });
      m.appendChild(b);
    });
    document.body.appendChild(m);
    var r = anchor.getBoundingClientRect(), w = m.offsetWidth;
    var left = opts.align === 'end' ? r.right - w : r.left;
    m.style.left = Math.max(8, Math.min(left, innerWidth - w - 8)) + 'px';
    m.style.top = Math.min(r.bottom + 6, innerHeight - m.offsetHeight - 8) + 'px';
    m.style.transformOrigin = (opts.align === 'end' ? 'top right' : 'top left');
    anchor.setAttribute('aria-expanded', 'true');
    openMenu = { el: m, anchor: anchor };
    var focusables = function () { return Array.prototype.slice.call(m.querySelectorAll('.ui-menu__item')); };
    var f = focusables()[0]; if (f) f.focus();
    m.addEventListener('keydown', function (e) {
      var list = focusables(), i = list.indexOf(document.activeElement);
      if (e.key === 'ArrowDown') { list[(i + 1) % list.length].focus(); e.preventDefault(); }
      if (e.key === 'ArrowUp') { list[(i - 1 + list.length) % list.length].focus(); e.preventDefault(); }
      if (e.key === 'Escape') { UI.closeMenu(true); e.preventDefault(); }
      if (e.key === 'Tab') UI.closeMenu();
    });
    return m;
  };
  UI.closeMenu = function (refocus) {
    if (!openMenu) return;
    openMenu.anchor.setAttribute('aria-expanded', 'false');
    if (refocus) openMenu.anchor.focus();
    openMenu.el.remove(); openMenu = null;
  };
  document.addEventListener('click', function (e) { if (openMenu && !openMenu.el.contains(e.target) && !openMenu.anchor.contains(e.target)) UI.closeMenu(); });
  g.addEventListener('resize', function () { UI.closeMenu(); });

  // ---------------------------------------------------------------- language list (i18n.js contract)
  /** i18n.js opens/closes .lang-dropdown (.is-open) and marks .is-active; it has no keyboard model. This adds:
      focus the current language on open, ↑/↓/Home/End, Esc closes and returns focus to .lang-btn, Tab closes,
      aria-checked mirrors .is-active. Bind once after i18n.js initialised. */
  UI.bindLangMenu = function () {
    var btn = document.querySelector('.lang-btn'), dd = document.querySelector('.lang-dropdown');
    if (!btn || !dd) return;
    var items = function () { return Array.prototype.slice.call(dd.querySelectorAll('button[data-lang]')); };
    function close(refocus) { dd.classList.remove('is-open'); btn.setAttribute('aria-expanded', 'false'); if (refocus) btn.focus(); }
    new MutationObserver(function () {
      if (!dd.classList.contains('is-open')) return;
      var list = items(), cur = list.filter(function (b) { return b.classList.contains('is-active'); })[0] || list[0];
      list.forEach(function (b) { b.setAttribute('aria-checked', String(b.classList.contains('is-active'))); b.tabIndex = -1; });
      cur.focus();
    }).observe(dd, { attributes: true, attributeFilter: ['class'] });
    dd.addEventListener('keydown', function (e) {
      var list = items(), i = list.indexOf(document.activeElement);
      var n = { ArrowDown: i + 1, ArrowUp: i - 1, Home: 0, End: list.length - 1 }[e.key];
      if (n != null) { list[(n + list.length) % list.length].focus(); e.preventDefault(); }
      if (e.key === 'Escape') { close(true); e.preventDefault(); }
      if (e.key === 'Tab') close(false);
    });
  };

  // ---------------------------------------------------------------- row links
  /** Rows of .ui-table: the first cell holds <a class="ui-row-link"> (keyboard path, real href). A click anywhere
      else in the row (not on a control) is forwarded: plain click → the anchor (same as clicking the name);
      Cmd/Ctrl/Shift or middle click → a new tab. Text selection inside a row is not hijacked. Bind once per tbody. */
  UI.rowLinks = function (tbody) {
    function go(e) {
      if (e.target.closest('a, button, input, select, textarea, label, summary, [role="button"]')) return;
      var tr = e.target.closest('tr'), a = tr && tbody.contains(tr) && tr.querySelector('.ui-row-link');
      if (!a) return;
      var sel = g.getSelection && String(g.getSelection()); if (sel && e.type === 'click') return;
      if (e.button === 1 || e.metaKey || e.ctrlKey || e.shiftKey) { g.open(a.href, '_blank', 'noopener'); e.preventDefault(); return; }
      if (e.button === 0) a.click();
    }
    tbody.addEventListener('click', go);
    tbody.addEventListener('auxclick', function (e) { if (e.button === 1) go(e); });
  };

  // ---------------------------------------------------------------- info popover (ⓘ next to a chart title)
  UI.infoPopover = function (btn, text) {
    if (openMenu && openMenu.anchor === btn) { UI.closeMenu(true); return; }
    UI.closeMenu();
    var p = document.createElement('div');
    p.className = 'ui-popover is-open'; p.setAttribute('role', 'dialog'); p.setAttribute('aria-label', btn.getAttribute('aria-label') || '');
    p.tabIndex = -1; p.textContent = text;
    document.body.appendChild(p);
    var r = btn.getBoundingClientRect();
    p.style.left = Math.max(8, Math.min(r.right - p.offsetWidth, innerWidth - p.offsetWidth - 8)) + 'px';
    p.style.top = (r.bottom + 6) + 'px';
    p.style.transformOrigin = 'top right';
    btn.setAttribute('aria-expanded', 'true');
    openMenu = { el: p, anchor: btn };
    p.addEventListener('keydown', function (e) { if (e.key === 'Escape') UI.closeMenu(true); });
    p.focus();
  };
})(window);
