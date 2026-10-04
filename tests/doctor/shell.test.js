// Tests for the doctor portal shell (classic browser scripts, loaded into a node:vm context with a tiny fake DOM):
//   js/doctors/ui/core.js     fmtDay: Lithuanian short dates carry month names ("rugs. 28"), never "09-28"
//   js/doctors/tabs.js+app.js the workspace switch follows the hash on detail routes too (#registry/<id> -> Registras,
//                             #patient/<code> -> iLARS), whatever route came before
//   js/doctors/ui/overlay.js  a menu item gives focus back to the menu button BEFORE its action runs, so a dialog
//                             opened by the item returns focus there (not to <body>); language items carry lang
//   js/doctors/ui/overlay.js  toasts are never left under a modal dialog (inert, blurred): inside the open dialog,
//                             or, when raised by a dialogForm submit, shown after the dialog closed and gave focus back
//
// Run from web/:   node --test tests/doctor/*.test.js
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const WEB = path.resolve(__dirname, '../..');
const DAY = 864e5;
const day = (iso) => Math.floor(Date.parse(iso + 'T00:00:00Z') / DAY);

// ------------------------------------------------------------------ a tiny fake DOM (only what the scripts touch)
class El {
  constructor(doc, tag) {
    this.ownerDocument = doc; this.tagName = tag.toUpperCase(); this.children = []; this.parentNode = null;
    this.attrs = {}; this.cls = new Set(); this.style = {}; this.listeners = {}; this.textContent = '';
    this.tabIndex = tag === 'button' || tag === 'a' ? 0 : -1; this.offsetWidth = 200; this.offsetHeight = 120;
  }
  get id() { return this.attrs.id || ''; }
  set id(v) { this.setAttribute('id', v); }
  get lang() { return this.attrs.lang || ''; }
  set lang(v) { this.setAttribute('lang', v); }
  get className() { return [...this.cls].join(' '); }
  set className(v) { this.cls = new Set(String(v).split(/\s+/).filter(Boolean)); }
  get classList() {
    const s = this.cls;
    return { add: (...c) => c.forEach((x) => s.add(x)), remove: (...c) => c.forEach((x) => s.delete(x)), contains: (c) => s.has(c),
      toggle: (c, on) => { if (on === undefined) on = !s.has(c); if (on) s.add(c); else s.delete(c); return on; } };
  }
  set innerHTML(html) { this.children = []; if (/<span><\/span>/.test(html)) this.appendChild(new El(this.ownerDocument, 'span')); }
  setAttribute(k, v) { this.attrs[k] = String(v); }
  getAttribute(k) { return k in this.attrs ? this.attrs[k] : null; }
  hasAttribute(k) { return k in this.attrs; }
  removeAttribute(k) { delete this.attrs[k]; }
  addEventListener(t, fn) { (this.listeners[t] = this.listeners[t] || []).push(fn); }
  fire(t, e) { (this.listeners[t] || []).forEach((fn) => fn(Object.assign({ target: this, key: '', preventDefault() {} }, e))); }
  appendChild(c) { c.parentNode = this; this.children.push(c); return c; }
  remove() { if (this.parentNode) this.parentNode.children = this.parentNode.children.filter((x) => x !== this); this.parentNode = null; }
  contains(x) { for (; x; x = x.parentNode) if (x === this) return true; return false; }
  focus() { this.ownerDocument.activeElement = this; }
  getBoundingClientRect() { return { left: 100, right: 140, top: 10, bottom: 44, width: 40, height: 34 }; }
  matches(sel) {   // one compound selector: tag, #id, .class, [attr], [attr="v"]
    const m = sel.match(/^([a-z]*)((?:#[\w-]+|\.[\w-]+|\[[\w-]+(?:="[^"]*")?\])*)$/i);
    if (!m) throw new Error('fake DOM: unsupported selector ' + sel);
    if (m[1] && m[1].toUpperCase() !== this.tagName) return false;
    return (m[2].match(/#[\w-]+|\.[\w-]+|\[[^\]]+\]/g) || []).every((p) => {
      if (p[0] === '#') return this.id === p.slice(1);
      if (p[0] === '.') return this.cls.has(p.slice(1));
      const a = p.slice(1, -1).split('='); return a.length === 1 ? this.hasAttribute(a[0]) : this.getAttribute(a[0]) === a[1].replace(/"/g, '');
    });
  }
  descendants() { return this.children.flatMap((c) => [c, ...c.descendants()]); }
  querySelectorAll(sel) {   // descendant combinator only
    return sel.trim().split(/\s+/).reduce((roots, part) => roots.flatMap((r) => r.descendants()).filter((e) => e.matches(part)), [this])
      .filter((e, i, a) => a.indexOf(e) === i);
  }
  querySelector(sel) { return this.querySelectorAll(sel)[0] || null; }
}
function fakeDocument() {
  const doc = { listeners: {}, activeElement: null };
  doc.documentElement = new El(doc, 'html');
  doc.body = doc.documentElement.appendChild(new El(doc, 'body'));
  doc.activeElement = doc.body;
  doc.createElement = (tag) => new El(doc, tag);
  doc.addEventListener = (t, fn) => { (doc.listeners[t] = doc.listeners[t] || []).push(fn); };
  doc.querySelectorAll = (sel) => doc.documentElement.querySelectorAll(sel);
  doc.querySelector = (sel) => doc.documentElement.querySelector(sel);
  doc.getElementById = (id) => doc.documentElement.descendants().find((e) => e.id === id) || null;
  doc.contains = (x) => doc.documentElement.contains(x);
  return doc;
}
/** A vm realm with window === the global; scripts are loaded in order (classic scripts share one global scope). */
function realm(files, setup) {
  const doc = fakeDocument();
  const ctx = { document: doc, console, Intl, URLSearchParams, Promise, setTimeout, clearTimeout, Date, Math, JSON,
    location: { search: '', hash: '' }, history: { replaceState() {} }, innerWidth: 1440, innerHeight: 900,
    addEventListener() {}, matchMedia: () => ({ matches: false }) };
  ctx.window = ctx;
  vm.createContext(ctx);
  if (setup) setup(ctx, doc);
  files.forEach((f) => vm.runInContext(fs.readFileSync(path.join(WEB, f), 'utf8'), ctx, { filename: f }));
  return { ctx, doc };
}

// ------------------------------------------------------------------ fmtDay (ui/core.js)
test('fmtDay: Lithuanian short dates use month names ("rugs. 28"), the year form "2026 m. rugs. 28 d."', () => {
  const { ctx, doc } = realm(['js/doctors/ui/core.js']);
  const U = ctx.ILARS_UI, today = day('2026-10-01');
  doc.documentElement.lang = 'lt';
  assert.equal(U.fmtDay(day('2026-09-28'), 'short', today), 'rugs. 28');
  assert.equal(U.fmtDay(day('2026-07-05'), 'short', today), 'liep. 5');
  assert.equal(U.fmtDay(day('2025-12-03'), 'short', today), '2025 m. gruod. 3 d.');       // another year
  assert.equal(U.fmtDay(day('2026-01-06'), 'long'), '2026 m. saus. 6 d.');
  assert.equal(U.fmtDay(day('2026-06-08'), 'axis'), 'birž. 8');
  assert.equal(U.fmtDay(day('2026-05-01'), 'month'), 'geg.');
  assert.equal(U.fmtDay(day('2026-11-15'), 'monthYear'), '2026 m. lapkr.');
  // all twelve months: never a bare number like Intl's lt "09-28"
  for (let m = 1; m <= 12; m++) {
    const s = U.fmtDay(day('2026-' + String(m).padStart(2, '0') + '-14'), 'short', today);
    assert.match(s, /^[a-zž]+\. 14$/, s);
  }
  ['short', 'axis', 'long', 'month', 'monthYear'].forEach((st) => assert.doesNotMatch(U.fmtDay(day('2026-09-28'), st, today), /\d{2}-\d{2}/, st));
});
test('fmtDay: other languages keep Intl formatting (en-GB day-month order)', () => {
  const { ctx, doc } = realm(['js/doctors/ui/core.js']);
  doc.documentElement.lang = 'en';
  const U = ctx.ILARS_UI, d = new Date(Date.UTC(2026, 8, 28)), today = day('2026-10-01');
  const intl = (o) => new Intl.DateTimeFormat('en-GB', Object.assign({ timeZone: 'UTC' }, o)).format(d);
  assert.equal(U.fmtDay(day('2026-09-28'), 'short', today), intl({ day: 'numeric', month: 'short' }));
  assert.equal(U.fmtDay(day('2026-09-28'), 'long'), intl({ day: 'numeric', month: 'short', year: 'numeric' }));
  assert.equal(U.fmtDay(day('2026-09-28'), 'month'), intl({ month: 'short' }));
  assert.equal(U.fmtDay(day('2026-09-28'), 'monthYear'), intl({ month: 'short', year: 'numeric' }));
});

// ------------------------------------------------------------------ workspace switch (tabs.js + app.js)
function shell() {
  return realm(['js/doctors/tabs.js', 'js/doctors/app.js'], (ctx, doc) => {
    const add = (parent, tag, attrs) => { const e = parent.appendChild(doc.createElement(tag)); Object.entries(attrs || {}).forEach(([k, v]) => e.setAttribute(k, v)); return e; };
    const bar = add(doc.body, 'div', { id: 'table-mode-bar' });
    const tg = add(bar, 'div', { id: 'table-mode-toggle' });
    add(tg, 'button', { 'data-mode': 'study', 'aria-pressed': 'true' }).classList.add('is-active');   // static HTML state
    add(tg, 'button', { 'data-mode': 'registry', 'aria-pressed': 'false' });
    ['patient-list-view', 'patient-detail-view', 'registry-detail-view'].forEach((id) => add(doc.body, 'section', { id }).classList.add('view'));
    const list = doc.getElementById('patient-list-view');
    ['study-mode', 'registry-mode', 'ilars-patients', 'ilars-overview'].forEach((id) => add(list, 'div', { id }));
    ['btn-create-patient', 'registry-create-btn'].forEach((id) => add(list, 'button', { id }));
    Object.assign(ctx, {
      ILARS_DATA: { store: { api: () => ({}) } }, ILARS_PROFILE: () => Promise.resolve({ is_lithuania: true }), ILARS_IS_LT: true,
      ILARS_UI: { reveal() {}, t: (k) => k, fmtCode: (c) => c, patchAria() {}, transition: (fn) => { fn(); return Promise.resolve(); } },
      ILARS_CHARTS: { load: () => Promise.resolve(), disposeAll() {} }, __loaded: []
    });
    // view classes are script-scope bindings in the page (not window properties), as here
    vm.runInContext(`
      class PatientDetailView { load(a) { __loaded.push('patient:' + a); } }
      class RegistryDetailView { load(a) { __loaded.push('record:' + a); } }
      class RegistryListView { load() { __loaded.push('registry'); } }
      class PatientListView { show(t) { __loaded.push('list:' + t); } }
      class OverviewView { load() { __loaded.push('overview'); } }`, ctx);
  });
}
const pressed = (doc) => doc.querySelectorAll('#table-mode-toggle button').map((b) =>
  b.getAttribute('data-mode') + ':' + b.getAttribute('aria-pressed') + (b.classList.contains('is-active') ? '*' : '') + ':ti=' + b.tabIndex).join(' ');
const REG = 'registry:true*:ti=0', STUDY = 'study:true*:ti=0';

test('workspace switch: a registry record reached directly shows Registras pressed (not the static iLARS state)', () => {
  const { ctx, doc } = shell();
  const app = vm.runInContext('new App()', ctx);
  app.render({ route: 'registry', arg: 'dec0de00-e000-4000-8000-000000000001' });
  assert.equal(pressed(doc), 'study:false:ti=-1 ' + REG);
  assert.equal(doc.getElementById('registry-detail-view').style.display, 'block');
  assert.deepEqual(ctx.__loaded, ['record:dec0de00-e000-4000-8000-000000000001']);
  // only the switch state changes on a detail route: the hidden list keeps its own regions untouched
  assert.equal(doc.getElementById('study-mode').style.display, undefined);
  assert.equal(doc.getElementById('registry-mode').style.display, undefined);
});
test('workspace switch: #registry -> #patient/<code> shows iLARS; #patient -> #registry/<id> shows Registras', () => {
  const { ctx, doc } = shell();
  const app = vm.runInContext('ILARS_TABS.init({}); new App()', ctx);
  app.render({ route: 'registry', arg: null });
  assert.equal(pressed(doc), 'study:false:ti=-1 ' + REG);
  app.render({ route: 'patient', arg: 'DEMO01' });
  assert.equal(pressed(doc), STUDY + ' registry:false:ti=-1');
  app.render({ route: 'registry', arg: 'dec0de00-e000-4000-8000-000000000001' });
  assert.equal(pressed(doc), 'study:false:ti=-1 ' + REG);
  app.render({ route: 'patients', arg: null });
  assert.equal(pressed(doc), STUDY + ' registry:false:ti=-1');
  assert.equal(doc.getElementById('study-mode').style.display, 'block');
});

// ------------------------------------------------------------------ menu focus order (ui/overlay.js)
test('menu: choosing an item puts focus back on the menu button before the action runs (dialog opener)', () => {
  const { ctx, doc } = realm(['js/doctors/ui/core.js', 'js/doctors/ui/overlay.js']);
  const U = ctx.ILARS_UI;
  const anchor = doc.body.appendChild(doc.createElement('button')); anchor.setAttribute('id', 'patient-change-status');
  let focusAtSelect = null;
  const m = U.menu(anchor, [{ label: 'Active', checked: true, onSelect() {} }, { label: 'Inactive', checked: false, onSelect() { focusAtSelect = doc.activeElement; } }]);
  const items = m.querySelectorAll('.ui-menu__item');
  assert.equal(doc.activeElement, items[0], 'the first item has focus while the menu is open');
  items[1].fire('click');
  assert.equal(focusAtSelect, anchor, 'openDialog() would record the menu button as the opener');
  assert.equal(anchor.getAttribute('aria-expanded'), 'false');
  assert.equal(m.parentNode, null, 'menu removed');
});
test('menu: an item with lang gets the lang attribute (language names in their own language)', () => {
  const { ctx, doc } = realm(['js/doctors/ui/core.js', 'js/doctors/ui/overlay.js']);
  const anchor = doc.body.appendChild(doc.createElement('button'));
  const m = ctx.ILARS_UI.menu(anchor, [{ label: 'Lietuvių', lang: 'lt', checked: false, onSelect() {} }, { label: 'Log out', onSelect() {} }]);
  const items = m.querySelectorAll('.ui-menu__item');
  assert.equal(items[0].getAttribute('lang'), 'lt');
  assert.equal(items[1].getAttribute('lang'), null);
});

// ------------------------------------------------------------------ toasts and modal dialogs (ui/overlay.js)
const tick = () => new Promise((r) => setTimeout(r, 5));
/** A page with #toast-region and an open modal <dialog> holding a form (close() fires "close" a task later, as browsers do). */
function dialogPage() {
  const { ctx, doc } = realm(['js/doctors/ui/core.js', 'js/doctors/ui/overlay.js']);
  const region = doc.body.appendChild(doc.createElement('div')); region.setAttribute('id', 'toast-region');
  const dlg = doc.body.appendChild(doc.createElement('dialog'));
  const form = dlg.appendChild(doc.createElement('form'));
  const btn = form.appendChild(doc.createElement('button')); btn.setAttribute('type', 'submit');
  dlg.open = true; dlg.setAttribute('open', '');
  dlg.close = function (v) { this.open = false; this.removeAttribute('open'); this.returnValue = v; setTimeout(() => this.fire('close'), 0); };
  return { U: ctx.ILARS_UI, doc, region, dlg, form };
}
test('toast: with a modal dialog open ("Code copied") it shows inside the dialog, not under the backdrop', async () => {
  const { U, region, dlg } = dialogPage();
  const t = U.toast('Code copied');
  assert.equal(t.parentNode.parentNode, dlg, 'in a region inside the open dialog');
  assert.ok(t.parentNode.classList.contains('ui-toast-region'));
  assert.equal(region.children.length, 0, 'nothing in the inert page region');
  assert.equal(t.getAttribute('role'), 'status');
  dlg.close('done'); await tick();
  // the dialog closed while the toast still shows: it moves to the page, without its role (no second announcement)
  assert.equal(t.parentNode, region);
  assert.equal(t.getAttribute('role'), null);
  assert.ok(t.classList.contains('is-moved'));
  assert.equal(U.toast('Saved').parentNode, region, 'no modal dialog: the page region, as before');
});
test('toast: raised by a dialogForm submit that closes the dialog ("Name saved"), it shows on the page after the close', async () => {
  const { U, doc, region, dlg, form } = dialogPage();
  const order = [];
  dlg.addEventListener('close', () => order.push('focus returned'));   // stands in for openDialog's close handler
  let t = null;
  U.dialogForm(dlg, { submit: () => Promise.resolve().then(() => { t = U.toast('Name saved'); order.push('toast raised'); }) });
  region.appendChild = ((append) => function (c) { order.push('toast shown'); return append.call(this, c); })(region.appendChild);
  form.fire('submit');
  await tick(); await tick();
  assert.equal(dlg.open, false);
  assert.deepEqual(order, ['toast raised', 'focus returned', 'toast shown']);
  assert.equal(t.parentNode, region);
  assert.equal(t.getAttribute('role'), 'status', 'announced once, from the page region');
  assert.equal(doc.querySelectorAll('dialog .ui-toast').length, 0);
});
test('toast: raised by a dialogForm submit that keeps the dialog open (success state, error), it shows inside the dialog', async () => {
  for (const outcome of ['stay', 'fail']) {
    const { U, region, dlg, form } = dialogPage();
    let t = null;
    U.dialogForm(dlg, { submit: () => Promise.resolve().then(() => {
      t = U.toast('Done');
      assert.equal(t.parentNode, null, 'waits while the submit runs');
      if (outcome === 'fail') throw new Error('x');
      return false;
    }) });
    form.fire('submit');
    await tick();
    assert.equal(dlg.open, true, outcome);
    assert.equal(t.parentNode.parentNode, dlg, outcome);
    assert.equal(region.children.length, 0, outcome);
  }
});
