// Keyboard focus in the registry (classic browser scripts, loaded into a node:vm context with a tiny fake DOM):
//   js/doctors/views/registry-list.js  a sort re-renders the header: focus goes to the SAME column's new sort button
//                                      ("Atstatyti" if the table has no header), not to <body>; sort results unchanged
//   js/doctors/views/registry-form.js  Išsaugoti is disabled while saving, which drops its focus to <body>: focus comes
//                                      back to it afterwards (also after a failed save), and only when it had focus
//
// Run from web/:   node --test tests/doctor/*.test.js
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const WEB = path.resolve(__dirname, '../..');

// ------------------------------------------------------------------ a tiny fake DOM (only what the code touches)
function fakeDoc() {
  const doc = { body: { tagName: 'BODY' }, byId: {}, sortBtns: {} };
  doc.activeElement = doc.body;
  const el = (props) => Object.assign({ isConnected: true, focus() { if (this.isConnected) doc.activeElement = this; } }, props);
  doc.el = el;
  doc.getElementById = (id) => doc.byId[id] || null;
  // the only selector the sort code asks for: '#registry-table-wrap .reg-th-sort[data-key="<key>"]'
  doc.querySelector = (sel) => {
    const m = /^#registry-table-wrap \.reg-th-sort\[data-key="(.*)"\]$/.exec(sel);
    if (!m) throw new Error('unexpected selector ' + sel);
    return doc.sortBtns[m[1].replace(/\\(.)/g, '$1')] || null;
  };
  return doc;
}
function load(files, doc) {
  const ctx = vm.createContext({
    document: doc, window: {}, console: { error() {}, log() {} }, setTimeout: () => 0,
    CSS: { escape: (s) => String(s).replace(/["\\]/g, '\\$&') }, ILARS_REGISTRY: { sections: [] }
  });
  files.forEach((f) => vm.runInContext(fs.readFileSync(path.join(WEB, f), 'utf8'), ctx, { filename: f }));
  return ctx;
}

// ------------------------------------------------------------------ list: sort keeps focus on the column
function listWithHeader(keys) {
  const doc = fakeDoc();
  const ctx = load(['js/doctors/views/registry-list.js'], doc);
  const L = vm.runInContext('new RegistryListView({})', ctx);
  doc.byId['registry-reset'] = doc.el({ id: 'registry-reset' });
  L.renders = 0;
  // _renderTable() rebuilds the header: the focused button is gone (focus falls to <body>), new buttons replace it
  L._renderTable = () => {
    L.renders++;
    doc.activeElement = doc.body;
    doc.sortBtns = {};
    keys.forEach((k) => { doc.sortBtns[k] = doc.el({ key: k, gen: L.renders }); });
  };
  L._renderTable(); L.renders = 0;
  return { doc, L };
}

test('registry sort: Enter on a sort button keeps focus on that column through asc -> desc -> off', () => {
  const { doc, L } = listWithHeader(['hospital_name', 'weight_kg', 'sex']);
  doc.sortBtns.weight_kg.focus();
  const seen = [];
  for (let i = 0; i < 3; i++) {
    L._toggleSort('weight_kg');
    const a = doc.activeElement;
    seen.push([L.sort ? L.sort.dir : null, a.key, a.gen]);
  }
  assert.deepEqual(seen, [['asc', 'weight_kg', 1], ['desc', 'weight_kg', 2], [null, 'weight_kg', 3]]);
  assert.equal(L.renders, 3);
});

test('registry sort: a click on another column focuses that column\'s new button (not the old one, not <body>)', () => {
  const { doc, L } = listWithHeader(['hospital_name', 'weight_kg']);
  doc.sortBtns.weight_kg.focus();
  L._toggleSort('hospital_name');
  assert.deepEqual([JSON.stringify(L.sort), doc.activeElement.key, doc.activeElement.gen], ['{"key":"hospital_name","dir":"asc"}', 'hospital_name', 1]);
});

test('registry sort: with no header after the render, focus goes to "Atstatyti"', () => {
  const { doc, L } = listWithHeader([]);
  L._toggleSort('weight_kg');
  assert.equal(doc.activeElement, doc.byId['registry-reset']);
});

// ------------------------------------------------------------------ form: Išsaugoti gets its focus back
function formView({ fail } = {}) {
  const doc = fakeDoc();
  const ctx = load(['js/doctors/views/registry-form.js'], doc);
  const calls = [];
  const api = { updateRegistryPatient: async (id, data) => { calls.push(id); if (fail) throw new Error('HTTP 500'); return { status: 'ok' }; } };
  ctx.__api = api;
  const D = vm.runInContext('new RegistryDetailView(__api)', ctx);
  D.isMine = true; D.id = 'dec0de00-e000-4000-8000-000000000001';
  D._cont = () => ({ querySelectorAll: () => [] });          // no number inputs: validation passes
  D._saveName = async () => {};
  // a real browser blurs a focused button the moment it is disabled
  let disabled = false;
  const btn = doc.el({ id: 'reg-save' });
  Object.defineProperty(btn, 'disabled', { get: () => disabled, set: (v) => { disabled = v; if (v && doc.activeElement === btn) doc.activeElement = doc.body; } });
  doc.byId['reg-save'] = btn;
  doc.byId['registry-form-msg'] = doc.el({ id: 'registry-form-msg', style: {}, textContent: '' });
  return { doc, D, btn, calls, msg: doc.byId['registry-form-msg'] };
}

test('registry save: focus returns to Išsaugoti after a keyboard save', async () => {
  const { doc, D, btn, calls, msg } = formView();
  btn.focus();
  await D.save();
  assert.deepEqual([doc.activeElement === btn, btn.disabled, calls.length, msg.textContent], [true, false, 1, 'Išsaugota ✓']);
});

test('registry save: focus returns to Išsaugoti after a failed save too', async () => {
  const { doc, D, btn, msg } = formView({ fail: true });
  btn.focus();
  await D.save();
  assert.equal(doc.activeElement, btn);
  assert.match(msg.textContent, /^Klaida išsaugant/);
});

test('registry save: focus is not taken when Išsaugoti did not have it', async () => {
  const { doc, D } = formView();
  const field = doc.el({ id: 'reg-f-weight_kg' });
  field.focus();
  await D.save();
  assert.equal(doc.activeElement, field);
});

test('registry save: no focus on a button that left the page during the save', async () => {
  const { doc, D, btn } = formView();
  btn.focus();
  D.api.updateRegistryPatient = async () => { btn.isConnected = false; return { status: 'ok' }; };   // another record opened
  await D.save();
  assert.equal(doc.activeElement, doc.body);
});
