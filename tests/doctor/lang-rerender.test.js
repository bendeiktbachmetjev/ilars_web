// UI language change (js/doctors/app.js rerender(), classic browser script loaded into a node:vm context with stubs).
// The open registry record is Lithuanian in every UI language: a language change must not reload it (that threw away
// unsaved edits and the scroll position). Every other route still re-renders in the new language.
//
// Run from web/:   node --test tests/doctor/*.test.js
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const WEB = path.resolve(__dirname, '../..');
const ID = 'dec0de00-e000-4000-8000-000000000001';

function setup() {
  const calls = [];
  const doc = { title: 'start', querySelectorAll: () => [], addEventListener() {} };
  const ctx = {
    document: doc, console,
    ILARS_DATA: { store: { api: () => ({}) } },
    ILARS_TABS: { syncToggle: (m) => calls.push('syncToggle:' + m), show: (api, o) => calls.push('show:' + o.mode + '/' + o.tab) },
    ILARS_UI: { patchAria: () => calls.push('patchAria'), reveal() {}, t: (k) => 'T(' + k + ')', fmtCode: (c) => c }
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(WEB, 'js/doctors/app.js'), 'utf8'), ctx, { filename: 'app.js' });
  ctx.PatientDetailView = { load: (a) => calls.push('patient.load:' + a) };
  ctx.RegistryDetailView = { load: (a) => calls.push('record.load:' + a) };
  const app = vm.runInContext('new App()', ctx);
  return { app, calls, doc };
}

test('language change on an open registry record: no reload, only the shell aria labels and the title', () => {
  const { app, calls, doc } = setup();
  app.route = { route: 'registry', arg: ID };
  app.rerender();
  assert.deepEqual(calls, ['patchAria']);
  assert.equal(doc.title, 'Registras · iLARS');
});

test('language change on other routes still re-renders them in place', () => {
  const cases = [
    [{ route: 'patients', arg: null }, ['patchAria', 'show:study/patients'], 'T(doctor.ui.patients.title) · iLARS'],
    [{ route: 'overview', arg: null }, ['patchAria', 'show:study/overview'], 'T(doctor.ui.overview.title) · iLARS'],
    [{ route: 'patient', arg: 'DEMO01' }, ['patchAria', 'syncToggle:study', 'patient.load:DEMO01'], 'DEMO01 · iLARS'],
    [{ route: 'registry', arg: null }, ['patchAria', 'show:registry/patients'], 'Registras · iLARS']
  ];
  for (const [route, want, title] of cases) {
    const { app, calls, doc } = setup();
    app.route = route;
    app.rerender();
    assert.deepEqual(calls, want, route.route);
    assert.equal(doc.title, title, route.route);
  }
});

test('language change before the first route does nothing', () => {
  const { app, calls } = setup();
  app.rerender();
  assert.deepEqual(calls, []);
});
