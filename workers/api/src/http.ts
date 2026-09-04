export const allowedOrigins = new Set([
  'https://www.dosatoppings.in',
  'https://admin.dosatoppings.in',
  'https://bill.dosatoppings.in'
]);

export function corsHeaders(origin: string | null): HeadersInit {
  const headers: HeadersInit = {
    'Vary': 'Origin',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type, Idempotency-Key, X-Requested-With',
    'Access-Control-Max-Age': '86400',
  };
  if (origin && allowedOrigins.has(origin)) {
    headers['Access-Control-Allow-Origin'] = origin;
  }
  return headers;
}

export function json(data: unknown, status = 200, origin: string | null = null): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders(origin), 'Content-Type': 'application/json; charset=utf-8' },
  });
}

export function rejectMethod(origin: string | null): Response {
  return json({ error: 'method_not_allowed' }, 405, origin);
}

export function handleOptions(request: Request): Response | null {
  if (request.method !== 'OPTIONS') return null;
  const origin = request.headers.get('Origin');
  if (origin && !allowedOrigins.has(origin)) return new Response(null, { status: 403 });
  return new Response(null, { status: 204, headers: corsHeaders(origin) });
}

export function requireIdempotencyKey(request: Request): string {
  const key = request.headers.get('Idempotency-Key')?.trim();
  if (!key || key.length < 16 || key.length > 128) {
    throw new Response('Valid Idempotency-Key required', { status: 400 });
  }
  return key;
}
