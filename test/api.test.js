import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/server.js';

let server;
let base;

before(async () => {
  const app = createApp({ dbPath: ':memory:' });
  server = app.listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(() => server.close());

async function call(method, path, body) {
  const res = await fetch(base + path, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  const ct = res.headers.get('content-type') ?? '';
  return { status: res.status, body: ct.includes('json') ? await res.json() : await res.text() };
}

test('meeting: create, respond, edit by same name, delete', async () => {
  const slots = ['2030-05-02T10:00', '2030-05-01T09:30', '2030-05-01T09:00'];
  const created = await call('POST', '/api/meetings', { title: '  Planszówki  ', slots });
  assert.equal(created.status, 201);
  const { id } = created.body;
  assert.match(id, /^[A-Za-z0-9]{10}$/);

  const got = await call('GET', `/api/meetings/${id}`);
  assert.equal(got.body.title, 'Planszówki');
  assert.deepEqual(got.body.slots, ['2030-05-01T09:00', '2030-05-01T09:30', '2030-05-02T10:00']);
  assert.deepEqual(got.body.responses, []);

  let r = await call('PUT', `/api/meetings/${id}/responses`, { name: 'Ola', slots: ['2030-05-01T09:00'] });
  assert.equal(r.status, 200);
  assert.equal(r.body.responses.length, 1);

  // Same name, different case → overwrites instead of duplicating.
  r = await call('PUT', `/api/meetings/${id}/responses`, { name: 'ola', slots: ['2030-05-02T10:00', '2030-05-01T09:30'] });
  assert.equal(r.body.responses.length, 1);
  assert.equal(r.body.responses[0].name, 'ola');
  assert.deepEqual(r.body.responses[0].slots, ['2030-05-01T09:30', '2030-05-02T10:00']);

  r = await call('PUT', `/api/meetings/${id}/responses`, { name: 'Kuba', slots: [] });
  assert.equal(r.status, 200, 'empty availability is allowed');
  assert.equal(r.body.responses.length, 2);

  r = await call('DELETE', `/api/meetings/${id}/responses/${encodeURIComponent('OLA')}`);
  assert.equal(r.status, 200);
  assert.deepEqual(r.body.responses.map((x) => x.name), ['Kuba']);
});

test('meeting: validation', async () => {
  assert.equal((await call('POST', '/api/meetings', { title: '', slots: ['2030-01-01T10:00'] })).status, 400);
  assert.equal((await call('POST', '/api/meetings', { title: 'x', slots: [] })).status, 400);
  assert.equal((await call('POST', '/api/meetings', { title: 'x', slots: ['2030-01-01T10:15'] })).status, 400);
  assert.equal((await call('POST', '/api/meetings', { title: 'x', slots: ['2030-02-30T10:00'] })).status, 400);
  assert.equal((await call('POST', '/api/meetings', { title: 'x', slots: ['2030-01-01T24:00'] })).status, 400);

  const { body } = await call('POST', '/api/meetings', { title: 'x', slots: ['2030-01-01T10:00'] });
  const outside = await call('PUT', `/api/meetings/${body.id}/responses`, { name: 'A', slots: ['2030-01-01T11:00'] });
  assert.equal(outside.status, 400, 'cannot pick a slot the organiser did not offer');
  assert.equal((await call('PUT', `/api/meetings/${body.id}/responses`, { name: '   ', slots: [] })).status, 400);
  assert.equal((await call('GET', '/api/meetings/nope')).status, 404);
});

test('meal: create, add entries, upsert by name, validation', async () => {
  const created = await call('POST', '/api/meals', { title: 'Kolacja' });
  assert.equal(created.status, 201);
  const { id } = created.body;

  let r = await call('PUT', `/api/meals/${id}/entries`, { name: 'Ola', amount: '2,5', unit: 'toast' });
  assert.equal(r.status, 200);
  assert.deepEqual(r.body.entries.map(({ name, amount, unit }) => ({ name, amount, unit })), [
    { name: 'Ola', amount: 2.5, unit: 'toast' },
  ]);

  r = await call('PUT', `/api/meals/${id}/entries`, { name: 'Kuba', amount: 1.5, unit: 'hotdog' });
  r = await call('PUT', `/api/meals/${id}/entries`, { name: 'OLA', amount: 3, unit: 'pizza' });
  assert.equal(r.body.entries.length, 2);
  const ola = r.body.entries.find((e) => e.name === 'OLA');
  assert.equal(ola.amount, 3);
  assert.equal(ola.unit, 'pizza');

  for (const bad of [
    { name: 'X', amount: 0, unit: 'toast' },
    { name: 'X', amount: -1, unit: 'toast' },
    { name: 'X', amount: 101, unit: 'toast' },
    { name: 'X', amount: 'dużo', unit: 'toast' },
    { name: 'X', amount: 1, unit: 'kebab' },
    { name: 'X', amount: 1, unit: '__proto__' },
    { name: '', amount: 1, unit: 'toast' },
  ]) {
    assert.equal((await call('PUT', `/api/meals/${id}/entries`, bad)).status, 400, JSON.stringify(bad));
  }

  r = await call('DELETE', `/api/meals/${id}/entries/Kuba`);
  assert.deepEqual(r.body.entries.map((e) => e.name), ['OLA']);
  assert.equal((await call('DELETE', `/api/meals/${id}/entries/Kuba`)).status, 404);
});

test('SPA routes serve the app shell; unknown API paths are JSON 404', async () => {
  for (const path of ['/', '/spotkanie/abc', '/posilek/abc']) {
    const r = await call('GET', path);
    assert.equal(r.status, 200);
    assert.match(r.body, /<main id="app"/);
  }
  const r = await call('GET', '/api/whatever');
  assert.equal(r.status, 404);
  assert.equal(typeof r.body.error, 'string');
});
