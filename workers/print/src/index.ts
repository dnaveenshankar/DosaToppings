interface Env {
  SOURCE_HTML?: string;
  PRINT_ORIGIN?: string;
}

const DEFAULT_SOURCE_HTML = "https://raw.githubusercontent.com/dnaveenshankar/DosaToppings/main/apps/print/index.html";
const DEFAULT_PRINT_ORIGIN = "https://print.dosatoppings.in";

const securityHeaders = (origin: string) => ({
  "Content-Security-Policy": `default-src 'self'; script-src 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; connect-src 'self' https://api.dosatoppings.in; base-uri 'none'; frame-ancestors 'none'; form-action 'self'`,
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  "Cache-Control": "no-store",
  "Access-Control-Allow-Origin": origin,
  "Access-Control-Allow-Methods": "GET,HEAD,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
});

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const origin = env.PRINT_ORIGIN || DEFAULT_PRINT_ORIGIN;
    const headers = securityHeaders(origin);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers });
    }

    if (url.pathname === "/health") {
      return new Response(JSON.stringify({ ok: true, service: "dosatoppings-print" }), {
        status: 200,
        headers: { ...headers, "Content-Type": "application/json; charset=utf-8" },
      });
    }

    if (request.method !== "GET" && request.method !== "HEAD") {
      return new Response("Method Not Allowed", { status: 405, headers });
    }

    const source = env.SOURCE_HTML || DEFAULT_SOURCE_HTML;
    const upstream = await fetch(source, { headers: { "Accept": "text/html" } });
    if (!upstream.ok) {
      return new Response("Print application unavailable", { status: 502, headers });
    }

    const html = await upstream.text();
    return new Response(request.method === "HEAD" ? null : html, {
      status: 200,
      headers: { ...headers, "Content-Type": "text/html; charset=utf-8" },
    });
  },
};
