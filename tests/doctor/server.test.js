// Tests for web/server.py (the static server used on Railway): it starts the real server with python3 on a free
// local port and checks what the doctor portal relies on. Skipped when python3 is not installed.
//
// Run from web/:   node --test tests/doctor/*.test.js
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const zlib = require('node:zlib');
const { spawn, spawnSync } = require('node:child_process');

const WEB = path.resolve(__dirname, '../..');
const skip = spawnSync('python3', ['--version']).status === 0 ? false : 'python3 not found';
let server = null; let port = 0; let serverLog = '';

function freePort() {
  return new Promise((resolve, reject) => {
    const s = net.createServer().listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => resolve(p)); });
    s.on('error', reject);
  });
}

// One GET (or HEAD) on its own new connection; resolves { status, headers, body } or { error }.
function get(urlPath, headers = {}, method = 'GET') {
  return new Promise((resolve) => {
    const req = http.request({ host: '127.0.0.1', port, path: urlPath, method, headers, agent: false }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }));
      res.on('error', (e) => resolve({ error: e.code || e.message }));
    });
    req.on('error', (e) => resolve({ error: e.code || e.message }));
    req.setTimeout(15000, () => req.destroy(new Error('timeout')));
    req.end();
  });
}

test.before(async () => {
  if (skip) return;
  port = await freePort();
  // Started from another working directory on purpose: the server must serve its own folder.
  server = spawn('python3', ['-B', path.join(WEB, 'server.py')], {
    cwd: os.tmpdir(), env: Object.assign({}, process.env, { PORT: String(port), HOST: '127.0.0.1', PYTHONDONTWRITEBYTECODE: '1' }),
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const keep = (d) => { serverLog = (serverLog + d).slice(-4000); };
  server.stdout.on('data', keep); server.stderr.on('data', keep);
  for (let i = 0; i < 100; i++) {
    const r = await get('/doctor.html');
    if (r.status === 200) return;
    await new Promise((res) => setTimeout(res, 100));
  }
  throw new Error('server.py did not start:\n' + serverLog);
});

test.after(() => { if (server) server.kill(); });

test('server.py serves its own folder whatever the working directory is', { skip }, async () => {
  const r = await get('/doctor.html');
  assert.equal(r.status, 200);
  assert.ok(r.body.equals(fs.readFileSync(path.join(WEB, 'doctor.html'))));
});

test('server.py gzips text files for browsers that accept gzip; caching headers stay the same', { skip }, async () => {
  const file = fs.readFileSync(path.join(WEB, 'js/doctors/app.js'));
  const z = await get('/js/doctors/app.js', { 'Accept-Encoding': 'gzip, deflate, br' });
  assert.equal(z.status, 200);
  assert.equal(z.headers['content-encoding'], 'gzip');
  assert.equal(Number(z.headers['content-length']), z.body.length);
  assert.ok(zlib.gunzipSync(z.body).equals(file));
  assert.match(z.headers.vary || '', /Accept-Encoding/i);
  assert.equal(z.headers['cache-control'], 'no-cache, must-revalidate');
  assert.match(z.headers['content-type'], /javascript/);

  const plain = await get('/js/doctors/app.js');
  assert.equal(plain.headers['content-encoding'], undefined);
  assert.ok(plain.body.equals(file));

  const loc = await get('/locales/lt.json?v=12', { 'Accept-Encoding': 'gzip' });
  assert.equal(loc.headers['content-encoding'], 'gzip');
  assert.equal(loc.headers['cache-control'], 'no-cache');
  assert.deepEqual(JSON.parse(zlib.gunzipSync(loc.body)), JSON.parse(fs.readFileSync(path.join(WEB, 'locales/lt.json'))));

  const head = await get('/css/doctor/tokens.css', { 'Accept-Encoding': 'gzip' }, 'HEAD');
  assert.equal(head.status, 200);
  assert.equal(head.headers['content-encoding'], 'gzip');
  assert.equal(head.body.length, 0);
});

test('server.py answers 304 when the browser revalidates an unchanged file', { skip }, async () => {
  const first = await get('/css/doctor/tokens.css', { 'Accept-Encoding': 'gzip' });
  assert.ok(first.headers['last-modified']);
  const again = await get('/css/doctor/tokens.css', { 'Accept-Encoding': 'gzip', 'If-Modified-Since': first.headers['last-modified'] });
  assert.equal(again.status, 304);
  assert.equal(again.body.length, 0);
  const old = await get('/css/doctor/tokens.css', { 'If-Modified-Since': 'Thu, 01 Jan 2015 00:00:00 GMT' });
  assert.equal(old.status, 200);
});

test('server.py never serves the tests, hidden files or anything outside its folder', { skip }, async () => {
  for (const p of ['/tests', '/tests/doctor/server.test.js', '/TESTS/doctor/server.test.js', '/js/../tests/doctor/server.test.js']) {
    assert.equal((await get(p, { 'Accept-Encoding': 'gzip' })).status, 404, p);
  }
  const index = fs.readFileSync(path.join(WEB, 'index.html'));
  for (const p of ['/.git/config', '/../server.py', '/patients']) {
    const r = await get(p);
    assert.equal(r.status, 200, p);
    assert.ok(r.body.equals(index), p + ' falls back to index.html');
  }
});

test('server.py answers every one of 60 connections opened at once (a cold load asks for ~45 files)', { skip }, async () => {
  // With the default listen queue of 5, macOS reset about half of these connections and the portal lost scripts.
  // 60, not more: 128 waiting connections is also the macOS system limit (kern.ipc.somaxconn).
  const paths = ['/doctor.html', '/js/doctors/app.js', '/css/doctor/tokens.css', '/js/doctors/api.js', '/locales/en.json'];
  for (let round = 0; round < 3; round++) {
    const res = await Promise.all(Array.from({ length: 60 }, (_, i) => get(paths[i % paths.length], { 'Accept-Encoding': 'gzip' })));
    const failed = res.filter((r) => r.status !== 200).map((r) => r.error || r.status);
    assert.deepEqual(failed, [], 'round ' + (round + 1));
  }
});
