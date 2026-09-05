const SOURCE_HTML = "https://raw.githubusercontent.com/dnaveenshankar/DosaToppings/main/apps/admin/index.html";
const ADMIN_ORIGIN = "https://admin.dosatoppings.in";
const DEV_BANNER = `\n<script>\n(() => {\n  const show = () => alert("⚠️ Dosa Toppings Admin is currently under development. Please do not perform production order, payment, refund, pricing or account actions unless explicitly authorized.");\n  if (document.readyState === "complete") show(); else window.addEventListener("load", show, { once: true });\n})();\n</script>\n`;

function cors(response: Response, request: Request): Response {
  const h = new Headers(response.headers);
  const origin = request.headers.get("Origin");
  h.set("Access-Control-Allow-Origin", origin === ADMIN_ORIGIN ? origin : ADMIN_ORIGIN);
  h.set("Access-Control-Allow-Methods", "GET,OPTIONS");
  h.set("Access-Control-Allow-Headers", "Authorization,Content-Type");
  h.set("Vary", "Origin");
  h.set("Cache-Control", "no-store");
  return new Response(response.body, { status: response.status, headers: h });
}

export default {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/health") {
      return cors(new Response(JSON.stringify({ ok: true, service: "dosatoppings-admin" }), { headers: { "Content-Type": "application/json" } }), request);
    }
    if (request.method === "OPTIONS") return cors(new Response(null, { status: 204 }), request);
    if (request.method !== "GET") return cors(new Response("Method Not Allowed", { status: 405 }), request);

    const upstream = await fetch(SOURCE_HTML, { cf: { cacheTtl: 0, cacheEverything: false } });
    if (!upstream.ok) return new Response("Admin application unavailable", { status: 502 });
    const contentType = upstream.headers.get("content-type") || "";
    if (!contentType.includes("text/html")) return new Response("Admin application is not HTML", { status: 502 });

    let html = await upstream.text();
    if (!html.includes("DosaToppings Admin")) return new Response("Invalid admin application", { status: 502 });
    if (html.includes("</body>")) html = html.replace("</body>", `${DEV_BANNER}</body>`);
    else html += DEV_BANNER;

    const headers = new Headers({ "Content-Type": "text/html; charset=UTF-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "strict-origin-when-cross-origin", "Content-Security-Policy": "default-src 'self' https://api.dosatoppings.in https://raw.githubusercontent.com; connect-src 'self' https://api.dosatoppings.in; img-src 'self' data: https:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; frame-ancestors 'none'; base-uri 'self'" });
    return new Response(html, { status: 200, headers });
  }
};
