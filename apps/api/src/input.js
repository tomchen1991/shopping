export class ApiError extends Error {
  constructor(status, code, field) {
    super(code);
    this.status = status;
    this.field = field;
  }
}

export function invalid(field) {
  throw new ApiError(400, 'invalid_input', field);
}

export async function readBytes(request, limit) {
  if (Number(request.headers.get('Content-Length')) > limit) {
    throw new ApiError(413, 'payload_too_large');
  }
  if (!request.body) invalid('body');
  const reader = request.body.getReader();
  const buffer = new Uint8Array(limit);
  let length = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (length + value.byteLength > limit) {
        await reader.cancel();
        throw new ApiError(413, 'payload_too_large');
      }
      buffer.set(value, length);
      length += value.byteLength;
    }
  } finally {
    reader.releaseLock();
  }
  return buffer.subarray(0, length);
}

export async function jsonInput(request, allowed) {
  if (request.headers.get('Content-Type')?.split(';')[0].trim().toLowerCase() !== 'application/json') {
    throw new ApiError(415, 'unsupported_media_type');
  }
  const bytes = await readBytes(request, 32 * 1024);
  let body;
  try {
    body = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch {
    invalid('body');
  }
  return object(body, allowed, 'body');
}

function object(value, allowed, field) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) invalid(field);
  for (const key of Object.keys(value)) if (!allowed.includes(key)) invalid(key);
  return value;
}

function text(value, field, max = 200) {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max) invalid(field);
  return value.trim();
}

export function date(value, field) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) invalid(field);
  const time = Date.parse(value);
  if (!Number.isFinite(time) || new Date(time).toISOString().slice(0, 10) !== value) invalid(field);
  return value;
}

function cents(value, field) {
  if (!Number.isSafeInteger(value) || value < 0 || value > 1_000_000_000_000) invalid(field);
  return value;
}

const detailKeys = {
  electronics: ['brand', 'model', 'configuration', 'specifications'],
  game: ['platform', 'medium', 'edition', 'developer', 'releaseDate'],
  figure: ['work', 'character', 'manufacturer', 'series', 'scale', 'height', 'expectedRelease'],
};

export async function productInput(request) {
  const body = await jsonInput(request, ['name', 'category', 'link', 'targetPriceCents', 'tags', 'interestReason', 'details']);
  const { category } = body;
  if (typeof category !== 'string' || !Object.hasOwn(detailKeys, category)) invalid('category');
  const details = body.details === undefined ? {} : object(body.details, detailKeys[category], 'details');
  let link = null;
  if (body.link !== undefined) {
    link = text(body.link, 'link', 2048);
    let url;
    try { url = new URL(link); } catch { invalid('link'); }
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) invalid('link');
  }
  const tags = body.tags === undefined ? [] : body.tags;
  if (!Array.isArray(tags) || tags.length > 30) invalid('tags');
  return {
    name: text(body.name, 'name'), category, link,
    targetPriceCents: body.targetPriceCents === undefined ? null : cents(body.targetPriceCents, 'targetPriceCents'),
    tags: tags.map(tag => text(tag, 'tags', 50)),
    interestReason: body.interestReason === undefined ? null : text(body.interestReason, 'interestReason', 2000),
    details: Object.fromEntries(Object.entries(details).map(([key, value]) => [
      key, key === 'releaseDate' ? date(value, key) : text(value, key, 2000),
    ])),
  };
}

export async function purchaseInput(request) {
  const body = await jsonInput(request, ['kind', 'shop', 'amountCents', 'depositCents', 'balanceCents']);
  const shop = text(body.shop, 'shop');
  if (body.kind === 'regular') {
    if ('depositCents' in body || 'balanceCents' in body) invalid('kind');
    return [body.kind, shop, cents(body.amountCents, 'amountCents'), null, null];
  }
  if (body.kind !== 'preorder' || 'amountCents' in body) invalid('kind');
  return [body.kind, shop, null, cents(body.depositCents, 'depositCents'),
    body.balanceCents === undefined ? null : cents(body.balanceCents, 'balanceCents')];
}

export function paymentInput(body, kind) {
  if (kind === 'regular') {
    if ('depositCents' in body || 'balanceCents' in body) invalid('kind');
    return [cents(body.amountCents, 'amountCents'), null, null];
  }
  if ('amountCents' in body || Object.keys(body).length === 0) invalid('kind');
  // Missing fields stay unchanged; zero is a valid paid amount.
  return [null, 'depositCents' in body ? cents(body.depositCents, 'depositCents') : null,
    'balanceCents' in body ? cents(body.balanceCents, 'balanceCents') : null];
}
