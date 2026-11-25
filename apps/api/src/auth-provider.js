import { ApiError } from './input.js';

const unavailable = () => new ApiError(503, 'auth_unavailable');
const invalid = () => new ApiError(401, 'session_invalid');
const formEncode = value => new URLSearchParams({ _: value }).toString().slice(2);
const keys = ['token_endpoint', 'userinfo_endpoint', 'introspection_endpoint', 'revocation_endpoint'];
let discovery;

async function request(url, options) {
  try {
    return await fetch(url, { ...options, redirect: 'manual', signal: AbortSignal.timeout(5000) });
  } catch {
    throw unavailable();
  }
}

async function json(response) {
  try { return await response.json(); } catch { throw unavailable(); }
}

export function authProvider(env) {
  const { OIDC_ISSUER: issuer, OIDC_CLIENT_ID: client, OIDC_CLIENT_SECRET: secret } = env;
  let origin;
  try { origin = new URL(issuer); } catch { throw unavailable(); }
  if (origin.protocol !== 'https:' || origin.origin !== issuer || !client || !secret) throw unavailable();
  const basic = `Basic ${btoa(`${formEncode(client)}:${formEncode(secret)}`)}`;
  async function discover() {
    const res = await request(`${issuer}/.well-known/openid-configuration`);
    if (!res.ok) throw unavailable();
    const config = await json(res);
    if (config?.issuer !== issuer) throw unavailable();
    try {
      for (const key of keys) {
        const endpoint = new URL(config[key]);
        if (endpoint.origin !== issuer || endpoint.username || endpoint.password || endpoint.hash) throw unavailable();
      }
    } catch { throw unavailable(); }
    return config;
  }
  async function endpoint(key) {
    if (discovery?.issuer !== issuer || discovery.until <= Date.now()) {
      discovery = { issuer, until: Date.now() + 300_000, config: await discover() };
    }
    return discovery.config[key];
  }
  async function post(key, fields) {
    return request(await endpoint(key), {
      method: 'POST', headers: { Authorization: basic, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(fields),
    });
  }
  async function userinfo(access) {
    const res = await request(await endpoint('userinfo_endpoint'), { headers: { Authorization: `Bearer ${access}` } });
    if (res.status === 401 || res.status === 403) throw invalid();
    if (!res.ok) throw unavailable();
    if ((await json(res))?.sub !== 'owner') throw invalid();
  }
  async function token(fields, login) {
    const res = await post('token_endpoint', fields);
    if (res.status === 429) {
      const retry = res.headers.get('Retry-After');
      const error = new ApiError(429, 'auth_rate_limited');
      error.retryAfter = retry && (/^\d{1,10}$/.test(retry) || Number.isFinite(Date.parse(retry))) ? retry : '60';
      throw error;
    }
    if (!res.ok) {
      if (res.status === 400 && (await json(res))?.error === 'invalid_grant') {
        throw login ? new ApiError(401, 'invalid_code') : invalid();
      }
      throw unavailable();
    }
    const data = await json(res);
    if (data?.token_type?.toLowerCase?.() !== 'bearer' || typeof data.access_token !== 'string' || !data.access_token ||
        typeof data.refresh_token !== 'string' || !data.refresh_token || data.refresh_token === fields.refresh_token ||
        !Number.isSafeInteger(data.expires_in) || data.expires_in <= 0 || data.expires_in > 900) throw unavailable();
    return { access: data.access_token, refresh: data.refresh_token, expires: Date.now() + data.expires_in * 1000 };
  }
  return {
    login: code => token({ grant_type: 'urn:falsita:params:oauth:grant-type:totp', code, scope: 'openid profile' }, true),
    refresh: refresh_token => token({ grant_type: 'refresh_token', refresh_token }, false),
    userinfo,
    async check(tokens) {
      if (Date.now() < tokens.expires) return userinfo(tokens.access);
      const res = await post('introspection_endpoint', { token: tokens.refresh, token_type_hint: 'refresh_token' });
      if (!res.ok) throw unavailable();
      const data = await json(res);
      if (data?.active !== true || data.client_id !== client || data.sub !== 'owner') throw invalid();
    },
    async revoke(refresh) {
      const res = await post('revocation_endpoint', { token: refresh, token_type_hint: 'refresh_token' });
      if (!res.ok) throw unavailable();
    },
  };
}
