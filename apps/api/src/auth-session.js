import { authProvider } from './auth-provider.js';
import { ApiError } from './input.js';

export const idleMs = 24 * 60 * 60 * 1000;
const unavailable = () => new ApiError(503, 'auth_unavailable');
const encoder = new TextEncoder();
const decoder = new TextDecoder();

async function encryptionKey(env) {
  const secret = env.AUTH_SESSION_KEY;
  if (typeof secret !== 'string' || !/^[a-f0-9]{64}$/i.test(secret)) throw unavailable();
  return crypto.subtle.importKey('raw', Uint8Array.from(secret.match(/../g), pair => parseInt(pair, 16)), 'AES-GCM', false, ['encrypt', 'decrypt']);
}

export class AuthSession {
  constructor(state, env) {
    this.state = state;
    this.storage = state.storage;
    this.aad = encoder.encode(state.id.toString());
    this.env = env;
    this.tail = Promise.resolve();
  }

  serial(operation) {
    const result = this.tail.then(operation);
    this.tail = result.then(() => {}, () => {});
    this.state.waitUntil(this.tail);
    return result;
  }

  async save(key, tokens) {
    const deadline = Date.now() + idleMs;
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: this.aad }, key,
      encoder.encode(JSON.stringify({ tokens, deadline })));
    // Set the alarm first so a persisted session always has an expiry cleanup.
    await this.storage.setAlarm(deadline);
    await this.storage.put('session', { iv, ciphertext });
  }

  async load(key) {
    const encrypted = await this.storage.get('session');
    if (!encrypted) return null;
    const { tokens, deadline } = JSON.parse(decoder.decode(await crypto.subtle.decrypt({
      name: 'AES-GCM', iv: encrypted.iv, additionalData: this.aad,
    }, key, encrypted.ciphertext)));
    if (Date.now() < deadline) return tokens;
    await this.storage.delete('session');
    return null;
  }

  alarm() {
    return this.serial(async () => { await this.load(await encryptionKey(this.env)); });
  }

  async handle(action, request) {
    try {
      if (action === '/logout') {
        let tokens;
        try { tokens = await this.load(await encryptionKey(this.env)); } catch {
          await this.storage.delete('session');
          return { remoteRevoked: false };
        }
        if (!tokens) return { remoteRevoked: null };
        await this.storage.delete('session');
        try {
          await authProvider(this.env).revoke(tokens.refresh);
          return { remoteRevoked: true };
        } catch {
          return { remoteRevoked: false };
        }
      }
      const key = await encryptionKey(this.env);
      const auth = authProvider(this.env);
      if (action === '/login') {
        const { code } = await request.json();
        const tokens = await auth.login(code);
        try {
          await auth.userinfo(tokens.access);
          await this.save(key, tokens);
        } catch (error) {
          await auth.revoke(tokens.refresh).catch(() => {});
          throw error;
        }
        return { subject: 'owner' };
      }
      const tokens = await this.load(key);
      if (!tokens) throw new ApiError(401, 'session_invalid');
      if (action === '/activity') {
        // Remove the old RT durably before contacting Auth. A crash or ambiguous
        // response must never cause another instance to replay it.
        await this.storage.delete('session');
        try {
          const next = await auth.refresh(tokens.refresh);
          try {
            await auth.userinfo(next.access);
            await this.save(key, next);
          } catch (error) {
            await auth.revoke(next.refresh).catch(() => {});
            throw error;
          }
        } catch (error) {
          if (error instanceof ApiError && error.status === 429) throw error;
          throw new ApiError(401, 'session_invalid');
        }
      } else if (action === '/check') {
        try { await auth.check(tokens); } catch (error) {
          if (error instanceof ApiError && error.status === 401) await this.storage.delete('session');
          throw error;
        }
      } else {
        throw new ApiError(404, 'not_found');
      }
      return { subject: 'owner' };
    } catch (error) {
      const safe = error instanceof ApiError ? error : unavailable();
      return { error: safe.message, status: safe.status, retryAfter: safe.retryAfter };
    }
  }

  async fetch(request) {
    const action = new URL(request.url).pathname;
    if (action === '/logout') this.activity = undefined;
    if (action !== '/activity') return Response.json(await this.serial(() => this.handle(action, request)));
    if (!this.activity) {
      const job = this.serial(() => this.handle(action, request));
      this.activity = job;
      job.then(() => { if (this.activity === job) this.activity = undefined; });
    }
    return Response.json(await this.activity);
  }
}
