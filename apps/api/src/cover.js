export const coverKey = id => `covers/${id}`;
export const modelKey = id => `models/${id}`;

async function r2Response(bucket, key, contentType, headers) {
  const object = await bucket.get(key);
  if (!object) return null;
  headers.set('Content-Type', contentType);
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('Content-Security-Policy', "default-src 'none'; sandbox");
  return new Response(object.body, { headers });
}

export async function coverResponse(bucket, row, headers) {
  if (!row) return null;
  return r2Response(bucket, coverKey(row.id), row.content_type, headers);
}

export async function modelResponse(bucket, row, headers) {
  if (!row) return null;
  return r2Response(bucket, modelKey(row.id), row.content_type, headers);
}
