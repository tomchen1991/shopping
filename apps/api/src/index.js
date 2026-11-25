const healthPath = '/api/health';

export default {
  fetch(request, env) {
    const { pathname } = new URL(request.url);
    const headers = new Headers({ 'Cache-Control': 'no-store' });

    if (pathname !== healthPath) {
      // This baseline exposes only liveness. No identity or private data routes.
      return Response.json({ error: 'not_found' }, { status: 404, headers });
    }

    headers.set('Vary', 'Origin');
    const origin = request.headers.get('Origin');
    if (origin && origin === env.WEB_ORIGIN) {
      headers.set('Access-Control-Allow-Origin', origin);
    }

    if (request.method !== 'GET') {
      headers.set('Allow', 'GET');
      return Response.json({ error: 'method_not_allowed' }, { status: 405, headers });
    }

    return Response.json({ status: 'ok' }, { headers });
  },
};
