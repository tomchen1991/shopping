import { ApiError, invalid, jsonInput } from './input.js';
import { idleMs } from './auth-session.js';

const cookie = '__Host-shopping_session';
const noSession = () => new ApiError(401, 'session_invalid');
const unavailable = () => new ApiError(503, 'auth_unavailable');
const formatCookie = (id, age) => `${cookie}=${id}; Path=/; Max-Age=${age}; HttpOnly; Secure; SameSite=Strict`;

function sessionId(request) {
  const values = (request.headers.get('Cookie') ?? '').split(';').map(value => value.trim())
    .filter(value => value.startsWith(`${cookie}=`));
  const id = values[0]?.slice(cookie.length + 1);
  return values.length === 1 && /^[a-f0-9]{64}$/.test(id) ? id : null;
}

function requireOrigin(request, env) {
  const origin = request.headers.get('Origin');
  if (!origin || origin !== env.WEB_ORIGIN || origin !== new URL(request.url).origin) {
    throw new ApiError(403, 'origin_not_allowed');
  }
}

async function session(env, id, action, body) {
  try {
    const stub = env.AUTH_SESSIONS.get(env.AUTH_SESSIONS.idFromName(id));
    const response = await stub.fetch(`https://session.internal/${action}`, {
      method: 'POST', ...(body && { body: JSON.stringify(body) }),
    });
    return await response.json();
  } catch {
    throw unavailable();
  }
}

export async function resolveSession(request, env) {
  const id = sessionId(request);
  if (!id) return null;
  if (request.method !== 'GET') requireOrigin(request, env);
  const result = await session(env, id, 'check');
  if (result.status === 401) return null;
  if (result.subject !== 'owner') throw unavailable();
  return { subject: 'owner' };
}

export async function handleAuth(request, env, pathname, headers) {
  const reply = (body, status = 200) => Response.json(body, { status, headers });
  const clear = () => headers.set('Set-Cookie', formatCookie('', 0));
  const set = id => headers.set('Set-Cookie', formatCookie(id, idleMs / 1000));
  const id = sessionId(request);
  try {
    const action = pathname.slice('/api/auth/'.length);
    if (!['login', 'status', 'activity', 'logout'].includes(action)) return reply({ error: 'not_found' }, 404);
    const expected = action === 'status' ? 'GET' : 'POST';
    if (request.method !== expected) {
      headers.set('Allow', expected);
      return reply({ error: 'method_not_allowed' }, 405);
    }
    if (expected === 'POST' || request.headers.has('Origin')) requireOrigin(request, env);
    if (new URL(request.url).origin !== env.WEB_ORIGIN) throw new ApiError(403, 'origin_not_allowed');
    if (action === 'logout') {
      clear();
      const result = id ? await session(env, id, 'logout').catch(() => ({ remoteRevoked: false })) : { remoteRevoked: null };
      if (result.status || result.remoteRevoked === false) return reply({ error: 'revocation_unconfirmed' }, 503);
      return reply({ remoteRevoked: result.remoteRevoked });
    }
    if (action === 'login') {
      if (!env.AUTH_LOGIN_LIMIT) throw unavailable();
      const { success } = await env.AUTH_LOGIN_LIMIT.limit({ key: request.headers.get('CF-Connecting-IP') || 'unknown' });
      if (!success) {
        headers.set('Retry-After', '60');
        return reply({ error: 'auth_rate_limited' }, 429);
      }
      const body = await jsonInput(request, ['code'], 1024);
      const code = typeof body.code === 'string' ? body.code.trim() : '';
      if (!/^(?:\d{6}|[a-f0-9]{32})$/.test(code)) invalid('code');
      const nextId = Array.from(crypto.getRandomValues(new Uint8Array(32)), byte => byte.toString(16).padStart(2, '0')).join('');
      const result = await session(env, nextId, 'login', { code });
      if (result.status) {
        if (result.retryAfter) headers.set('Retry-After', result.retryAfter);
        return reply({ error: result.error }, result.status);
      }
      if (result.subject !== 'owner') throw unavailable();
      if (id) await session(env, id, 'logout').catch(() => {});
      set(nextId);
      return reply({ authenticated: true });
    }
    if (!id) throw noSession();
    const result = await session(env, id, action === 'status' ? 'check' : 'activity');
    if (result.status === 401) {
      clear();
      throw noSession();
    }
    if (result.status === 429 && action === 'activity') {
      clear();
      headers.set('Retry-After', result.retryAfter ?? '60');
      return reply({ error: 'auth_rate_limited' }, 429);
    }
    if (result.subject !== 'owner') throw unavailable();
    if (action === 'activity') set(id);
    return reply({ authenticated: true });
  } catch (error) {
    const safe = error instanceof ApiError ? error : unavailable();
    return reply({ error: safe.message, ...(safe.field && { field: safe.field }) }, safe.status);
  }
}
