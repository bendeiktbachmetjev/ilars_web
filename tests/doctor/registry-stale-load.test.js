// Registry record loads that answer out of order (js/doctors/views/registry-form.js, classic browser script loaded
// into a node:vm context with a tiny fake DOM). Open A, go back, open B: only the answer to the latest load may fill
// the form, so record A's data or name never appears, or gets saved, under record B.
//
// Run from web/:   node --test tests/doctor/*.test.js
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const WEB = path.resolve(__dirname, '../..');
const A = 'dec0de00-e000-4000-8000-000000000001';
const B = 'dec0de00-e000-4000-8000-000000000002';
const flush = () => new Promise((r) => setImmediate(r));

/** A promise the test settles by hand. */
function deferred() {
  let resolve, reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

/** A fresh view with a fake DOM. api answers and Firestore name reads stay pending until the test settles them. */
function setup() {
  const byId = {};
  const doc = { getElementById: (id) => byId[id] || null };
  const answers = [], names = [];
  const api = { getRegistryPatientDetail: (id) => { const d = deferred(); answers.push({ id, d }); return d.promise; } };
  const ctx = vm.createContext({ document: doc, window: {}, console: { error() {}, log() {} }, ILARS_REGISTRY: { sections: [] } });
  vm.runInContext(fs.readFileSync(path.join(WEB, 'js/doctors/views/registry-form.js'), 'utf8'), ctx, { filename: 'registry-form.js' });
  ctx.__api = api;
  const D = vm.runInContext('new RegistryDetailView(__api)', ctx);
  const cont = { innerHTML: '' };
  byId['registry-detail-container'] = cont;
  // render() builds the whole form; here it only writes which record it shows, plus the two name inputs
  const rendered = [];
  D.render = function () {
    rendered.push(this.record.lin);
    cont.innerHTML = 'form:' + this.record.lin;
    byId['reg-name-first'] = { value: '' };
    byId['reg-name-last'] = { value: '' };
  };
  D._updateTitle = function () {};
  D._nameDoc = function () { const id = this.id; return { get: () => { const d = deferred(); names.push({ id, d }); return d.promise; } }; };
  return { D, byId, cont, answers, names, rendered };
}
const answer = (lin, isMine) => ({ status: 'ok', patient: { lin, is_mine: !!isMine } });
const nameSnap = (firstName, lastName) => ({ exists: true, data: () => ({ firstName, lastName }) });

test('registry record: a late answer for a record that is no longer open is dropped', async () => {
  const { D, cont, answers, rendered } = setup();
  D.load(A); D.load(B);
  answers[1].d.resolve(answer('LIN-B'));
  await flush();
  answers[0].d.resolve(answer('LIN-A'));
  await flush();
  assert.deepEqual(rendered, ['LIN-B']);
  assert.equal(D.id, B);
  assert.equal(D.record.lin, 'LIN-B');
  assert.equal(cont.innerHTML, 'form:LIN-B');
});

test('registry record: a late failure for a record that is no longer open does not replace the open record', async () => {
  const { D, cont, answers } = setup();
  D.load(A); D.load(B);
  answers[1].d.resolve(answer('LIN-B'));
  await flush();
  answers[0].d.reject(new Error('network'));
  await flush();
  assert.equal(cont.innerHTML, 'form:LIN-B');
});

test('registry record: the open record still shows its own "not found" and error states', async () => {
  const one = setup();
  one.D.load(A);
  one.answers[0].d.resolve({ status: 'error' });
  await flush();
  assert.match(one.cont.innerHTML, /Įrašas nerastas/);
  const two = setup();
  two.D.load(A);
  two.answers[0].d.reject(new Error('network'));
  await flush();
  assert.match(two.cont.innerHTML, /Klaida įkeliant įrašą: network/);
});

test('registry record: the same record opened twice renders only the second answer', async () => {
  const { D, answers, rendered } = setup();
  D.load(A); D.load(A);
  answers[1].d.resolve(answer('LIN-A2'));
  await flush();
  answers[0].d.resolve(answer('LIN-A1'));
  await flush();
  assert.deepEqual(rendered, ['LIN-A2']);
});

test('registry record: a name that arrives after another record was opened is dropped', async () => {
  const { D, byId, answers, names } = setup();
  D.load(A);
  answers[0].d.resolve(answer('LIN-A', true));
  await flush();
  assert.equal(names.length, 1);                 // A's name read is pending
  D.load(B);
  answers[1].d.resolve(answer('LIN-B', true));
  await flush();
  names[1].d.resolve(nameSnap('Vytautas', 'Jankauskas'));
  await flush();
  names[0].d.resolve(nameSnap('Jonas', 'Petrauskas'));
  await flush();
  assert.equal(byId['reg-name-first'].value, 'Vytautas');
  assert.equal(byId['reg-name-last'].value, 'Jankauskas');
  assert.equal(D._firstName, 'Vytautas');
  assert.equal(D._lastName, 'Jankauskas');
});

test('registry record: a new load removes the previous Save bar and forgets the previous name at once', async () => {
  const { D, byId, answers } = setup();
  let removed = false;
  byId['registry-savebar-el'] = { remove() { removed = true; delete byId['registry-savebar-el']; } };
  D._firstName = 'Jonas'; D._lastName = 'Petrauskas';
  D.load(B);
  // before B's answer: no Save bar of A to click, no name of A for B's title
  assert.equal(removed, true);
  assert.equal(D._firstName, '');
  assert.equal(D._lastName, '');
  answers[0].d.resolve(answer('LIN-B'));
  await flush();
});
