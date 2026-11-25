import assert from 'node:assert/strict';
import { test } from 'node:test';
import worker from '../src/index.js';

const env = { WEB_ORIGIN: 'https://room.example' };
const request = (path, init) => worker.fetch(new Request(`https://api.example${path}`, init), env);

test('GET /api/health serves an uncached JSON liveness response', async () => {
  const response = await request('/api/health');
  assert.equal(response.status, 200);
  assert.match(response.headers.get('Content-Type'), /^application\/json\b/);
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
  assert.deepEqual(await response.json(), { status: 'ok' });
});

test('health CORS allows only the configured frontend origin', async () => {
  const allowed = await request('/api/health', { headers: { Origin: env.WEB_ORIGIN } });
  assert.equal(allowed.headers.get('Access-Control-Allow-Origin'), env.WEB_ORIGIN);
  assert.equal(allowed.headers.get('Vary'), 'Origin');

  const denied = await request('/api/health', { headers: { Origin: 'https://other.example' } });
  assert.equal(denied.headers.get('Access-Control-Allow-Origin'), null);
});

test('unimplemented routes and unsupported methods do not return success', async () => {
  const missing = await request('/api/orders');
  assert.equal(missing.status, 404);
  assert.deepEqual(await missing.json(), { error: 'not_found' });

  const wrongMethod = await request('/api/health', { method: 'POST' });
  assert.equal(wrongMethod.status, 405);
  assert.equal(wrongMethod.headers.get('Allow'), 'GET');
  assert.deepEqual(await wrongMethod.json(), { error: 'method_not_allowed' });
});
