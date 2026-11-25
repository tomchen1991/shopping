import assert from 'node:assert/strict';
import { test } from 'node:test';
import deployment from '../src/index.js';

// Exercise the same default export Wrangler deploys, not the injected test app.
test('unverified callers cannot reach any management storage from the deployment entry', async () => {
  const id = 'dbf3ec95-0822-4c6c-84ee-31de08ce883f';
  const routes = [
    ['GET', 'products'], ['POST', 'products'], ['GET', `products/${id}`],
    ['GET', `products/${id}/cover`], ['POST', `products/${id}/purchases`],
    ['GET', `purchases/${id}`], ['POST', `purchases/${id}/receive`],
    ['POST', `purchases/${id}/cancel`], ['GET', 'holdings'],
  ];
  for (const [method, path] of routes) {
    const request = new Request(`https://api.example/api/manage/${path}?userId=alice`, {
      method,
      headers: { 'X-User-Id': 'alice', 'Authorization': 'Bearer alice', 'Content-Type': 'application/json' },
      ...(method === 'POST' && { body: JSON.stringify({ userId: 'alice' }) }),
    });
    const response = await deployment.fetch(request, {});
    assert.ok([401, 403, 503].includes(response.status), `${method} ${path} returned ${response.status}`);
  }
});
