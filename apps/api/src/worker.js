import { ApiError } from './input.js';
import { manage } from './manage.js';
import { manageRoom, publicRoom } from './room.js';

const managePrefix = '/api/manage';
const publicPrefix = '/api/public/rooms';

// resolveIdentity(request, env) must return a verified, stable { subject } or null.
// Only the composition entry point can supply an adapter, never a request or binding.
export function createWorker({ resolveIdentity, handleAuth } = {}) {
  return {
    async fetch(request, env) {
      const { pathname } = new URL(request.url);
      const headers = new Headers({ 'Cache-Control': 'no-store', Vary: 'Origin' });
      const origin = request.headers.get('Origin');
      const allowedOrigin = origin && origin === env.WEB_ORIGIN;
      const json = (body, status = 200) => Response.json(body, { status, headers });
      if (handleAuth && pathname.startsWith('/api/auth/')) {
        return handleAuth(request, env, pathname, headers);
      }
      if (allowedOrigin) headers.set('Access-Control-Allow-Origin', origin);

      if (pathname === '/api/health') {
        if (request.method !== 'GET') {
          headers.set('Allow', 'GET');
          return json({ error: 'method_not_allowed' }, 405);
        }
        return json({ status: 'ok' });
      }
      if (pathname.startsWith(`${publicPrefix}/`)) {
        headers.set('Referrer-Policy', 'no-referrer');
        try {
          return await publicRoom(request, env, pathname.slice(publicPrefix.length), headers);
        } catch (error) {
          if (error instanceof ApiError) return json({ error: error.message }, error.status);
          console.error('Public room request failed', error?.name);
          return json({ error: 'internal_error' }, 500);
        }
      }
      if (pathname !== managePrefix && !pathname.startsWith(`${managePrefix}/`)) {
        return json({ error: 'not_found' }, 404);
      }

      if (origin && !allowedOrigin) return json({ error: 'origin_not_allowed' }, 403);
      if (allowedOrigin) headers.set('Access-Control-Allow-Credentials', 'true');
      if (request.method === 'OPTIONS' && allowedOrigin && request.headers.has('Access-Control-Request-Method')) {
        // Preflight grants no access to management data.
        headers.set('Access-Control-Allow-Methods', 'GET, POST, PATCH, PUT');
        headers.set('Access-Control-Allow-Headers', 'Authorization, Content-Type');
        return new Response(null, { status: 204, headers });
      }
      try {
        const identity = await resolveIdentity?.(request, env);
        if (typeof identity?.subject !== 'string' || !identity.subject.trim()) {
          return json({ error: 'unauthorized' }, 401);
        }
        const path = pathname.slice(managePrefix.length);
        const handler = path === '/room' || path.startsWith('/room/') ? manageRoom : manage;
        return await handler(request, env, identity.subject, path, headers);
      } catch (error) {
        if (error instanceof ApiError) {
          return json({ error: error.message, ...(error.field && { field: error.field }) }, error.status);
        }
        // Do not return identity, SQL or bucket diagnostics to clients.
        console.error('Management request failed', error?.name);
        return json({ error: 'internal_error' }, 500);
      }
    },
  };
}
