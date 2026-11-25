import assert from 'node:assert/strict';
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { convertV4MiniflareOptions, Miniflare } from 'miniflare';
import { AuthSession, idleMs } from '../src/auth-session.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const origin = 'https://shopping.example';
const issuer = 'https://issuer.example';

test('session ciphertext expires exactly at the 24-hour idle deadline', async t => {
  const records = new Map();
  let now = 1_000_000, alarm;
  t.mock.method(Date, 'now', () => now);
  const session = new AuthSession({ id: 'test-session', storage: {
    setAlarm: async value => { alarm = value; },
    put: async (key, value) => records.set(key, value),
    get: async key => records.get(key),
    delete: async key => records.delete(key),
  } }, {});
  const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  const tokens = { access: 'test-access', refresh: 'test-refresh' };
  await session.save(key, tokens);
  assert.equal(alarm, now + idleMs);
  assert.ok(records.get('session').ciphertext instanceof ArrayBuffer);
  now += idleMs - 1;
  assert.deepEqual(await session.load(key), tokens);
  ++now;
  assert.equal(await session.load(key), null);
  assert.equal(records.size, 0);
});

test('deployed Worker: same-origin TOTP, online validation, rotating activity and logout', async t => {
  let current = 0, refreshes = 0, introspections = 0, logins = 0;
  let active = false, ambiguous = false, revokeFails = false, expires = 900;
  const modules = ['src/index.js', ...(await readdir(join(root, 'src'))).filter(file => file.endsWith('.js') && file !== 'index.js').map(file => `src/${file}`)];
  const mf = new Miniflare(convertV4MiniflareOptions({
    modulesRoot: root, modules: modules.map(file => ({ type: 'ESModule', path: join(root, file) })),
    compatibilityDate: '2026-04-01', durableObjects: { AUTH_SESSIONS: { className: 'AuthSession', useSQLite: true } },
    ratelimits: { AUTH_LOGIN_LIMIT: { namespace_id: '31001', simple: { limit: 100, period: 60 } } },
    bindings: { WEB_ORIGIN: origin, OIDC_ISSUER: issuer, OIDC_CLIENT_ID: 'app:1', OIDC_CLIENT_SECRET: 's +é', AUTH_SESSION_KEY: '1a'.repeat(32) },
    outboundService: async request => {
      const url = new URL(request.url);
      assert.equal(url.origin, issuer);
      assert.equal(request.headers.get('Origin'), null);
      assert.equal(request.headers.get('Cookie'), null);
      if (url.pathname.startsWith('/.well-known/')) return Response.json({ issuer,
        token_endpoint: `${issuer}/token`, userinfo_endpoint: `${issuer}/userinfo`,
        introspection_endpoint: `${issuer}/introspect`, revocation_endpoint: `${issuer}/revoke`,
      });
      if (url.pathname === '/userinfo') {
        return active && request.headers.get('Authorization') === `Bearer access-${current}`
          ? Response.json({ sub: 'owner' }) : new Response(null, { status: 401 });
      }
      assert.equal(request.headers.get('Authorization'), `Basic ${btoa('app%3A1:s+%2B%C3%A9')}`);
      const body = new URLSearchParams(await request.text());
      if (url.pathname === '/introspect') {
        ++introspections;
        assert.equal(body.get('token_type_hint'), 'refresh_token');
        return Response.json({ sub: 'owner', client_id: 'app:1', active: active && body.get('token') === `refresh-${current}` });
      }
      if (url.pathname === '/revoke') {
        assert.equal(body.get('token_type_hint'), 'refresh_token');
        if (revokeFails) return new Response(null, { status: 503 });
        if (body.get('token') === `refresh-${current}`) active = false;
        return new Response(null);
      }
      if (body.get('grant_type') === 'refresh_token') {
        ++refreshes;
        assert.equal(body.get('refresh_token'), `refresh-${current}`);
        await new Promise(resolve => setTimeout(resolve, 150));
        if (ambiguous) return new Response(null, { status: 503 });
      } else {
        ++logins;
        assert.equal(body.get('grant_type'), 'urn:falsita:params:oauth:grant-type:totp');
        assert.equal(body.get('scope'), 'openid profile');
        if (body.get('code') !== '012345') return Response.json({ error: 'invalid_grant', detail: 'private' }, { status: 400 });
      }
      active = true;
      ++current;
      return Response.json({ token_type: 'Bearer', access_token: `access-${current}`, refresh_token: `refresh-${current}`, expires_in: expires });
    },
  }));
  t.after(() => mf.dispose());

  const call = (path, { method = 'GET', cookie, from = origin, json } = {}) => mf.dispatchFetch(`${origin}/api/${path}`, {
    method, headers: { ...(from && { Origin: from }), ...(cookie && { Cookie: cookie }), ...(json && { 'Content-Type': 'application/json' }) },
    ...(json && { body: JSON.stringify(json) }),
  });
  const post = (path, options) => call(`auth/${path}`, { method: 'POST', ...options });
  const login = async () => {
    const res = await post('login', { json: { code: ' 012345 ' } });
    assert.equal(res.status, 200, await res.clone().text());
    assert.deepEqual(await res.json(), { authenticated: true });
    const header = res.headers.get('Set-Cookie');
    assert.match(header, /^__Host-shopping_session=[a-f0-9]{64}; Path=\/; Max-Age=86400; HttpOnly; Secure; SameSite=Strict$/);
    return header.split(';')[0];
  };
  assert.equal((await post('login', { from: 'https://other.example', json: { code: '012345' } })).status, 403);
  assert.equal((await post('login', { from: null, json: { code: '012345' } })).status, 403);
  assert.equal((await post('login', { json: { code: '1'.repeat(1100) } })).status, 413);
  assert.equal(logins, 0);
  const wrong = await post('login', { json: { code: '123456' } });
  assert.equal(wrong.status, 401);
  assert.deepEqual(await wrong.json(), { error: 'invalid_code' });
  const cookie = await login();
  const status = await call('auth/status', { cookie });
  assert.equal(status.status, 200);
  assert.equal(status.headers.get('Set-Cookie'), null);
  assert.equal((await call('manage/nonexistent', { cookie })).status, 404);
  assert.equal((await call('manage/products', { cookie, method: 'POST', from: null })).status, 403);
  const results = await Promise.all(Array.from({ length: 6 }, () => post('activity', { cookie })));
  assert.deepEqual(results.map(res => res.status), Array(6).fill(200));
  assert.equal(refreshes, 1);
  assert.ok(results.every(res => res.headers.get('Set-Cookie')?.includes('Max-Age=86400')));
  const loggedOut = await post('logout', { cookie });
  assert.match(loggedOut.headers.get('Set-Cookie'), /Max-Age=0/);
  assert.deepEqual(await loggedOut.json(), { remoteRevoked: true });
  assert.equal(active, false);
  assert.equal((await call('manage/products', { cookie })).status, 401);

  expires = 1;
  const short = await login();
  await new Promise(resolve => setTimeout(resolve, 1100));
  assert.equal((await call('auth/status', { cookie: short })).status, 200);
  assert.equal(introspections, 1);
  assert.equal(refreshes, 1);
  active = false; // Upstream administrator revocation.
  assert.equal((await call('auth/status', { cookie: short })).status, 401);
  assert.equal(introspections, 2);

  const uncertain = await login();
  ambiguous = true;
  assert.equal((await post('activity', { cookie: uncertain })).status, 401);
  assert.equal((await post('activity', { cookie: uncertain })).status, 401);
  assert.equal(refreshes, 2);

  const failedRevoke = await login();
  revokeFails = true;
  const failure = await post('logout', { cookie: failedRevoke });
  assert.equal(failure.status, 503);
  assert.match(failure.headers.get('Set-Cookie'), /Max-Age=0/);
  assert.equal((await call('auth/status', { cookie: failedRevoke })).status, 401);
});
