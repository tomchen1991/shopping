export const coverKey = id => `covers/${id}`;

export async function coverResponse(bucket, row, headers) {
  if (!row) return null;
  const object = await bucket.get(coverKey(row.id));
  if (!object) return null;
  headers.set('Content-Type', row.content_type);
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('Content-Security-Policy', "default-src 'none'; sandbox");
  return new Response(object.body, { headers });
}
