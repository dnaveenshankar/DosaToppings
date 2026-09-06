interface Env { SOURCE_HTML?: string; BILL_ORIGIN?: string; }
const DEFAULT_SOURCE_HTML = "https://raw.githubusercontent.com/dnaveenshankar/DosaToppings/main/apps/bill/index.html";
const DEFAULT_BILL_ORIGIN = "https://bill.dosatoppings.in";
function cors(response: Response, request: Request, origin: string): Response {
  const headers = new Headers(response.headers);
  const requestOrigin = request.headers.get("Origin");
  headers.set("Access-Control-Allow-Origin", requestOrigin === origin ? requestOrigin : origin);
  headers.set("Access-Control-Allow-Methods", "GET,OPTIONS");
  headers.set("Access-Control-Allow-Headers", "Authorization,Content-Type,Idempotency-Key");
  headers.set("Vary", "Origin");
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const sourceHtml = env.SOURCE_HTML || DEFAULT_SOURCE_HTML;
    const billOrigin = env.BILL_ORIGIN || DEFAULT_BILL_ORIGIN;
    const url = new URL(request.url);
    if (url.pathname === "/health") return cors(new Response(JSON.stringify({ ok: true, service: "dosatoppings-bill" }), { headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } }), request, billOrigin);
    if (request.method === "OPTIONS") return cors(new Response(null, { status: 204 }), request, billOrigin);
    if (request.method !== "GET") return cors(new Response("Method Not Allowed", { status: 405 }), request, billOrigin);
    const upstream = await fetch(sourceHtml, { cf: { cacheTtl: 0, cacheEverything: false } });
    if (!upstream.ok) return new Response("Billing application unavailable", { status: 502 });
    const html = await upstream.text();
    if (!/<(?:!doctype\s+html|html\b)/i.test(html) || !html.includes("DosaToppings Billing")) return new Response("Invalid billing application", { status: 502 });
    const headers = new Headers({ "Content-Type": "text/html; charset=UTF-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "strict-origin-when-cross-origin", "Content-Security-Policy": "default-src 'self' https://api.dosatoppings.in; connect-src 'self' https://api.dosatoppings.in; img-src 'self' data: https:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; frame-ancestors 'none'; base-uri 'self'" });
    return new Response(html, { status: 200, headers });
  }
};
