/**
 * Serves the React app and forwards /api/* to the API on Render, so the browser
 * sees one site: the SameSite=Strict refresh cookie and the Origin check keep working.
 */
interface Env {
  ASSETS: { fetch(request: Request): Promise<Response> };
  API_ORIGIN: string;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (!url.pathname.startsWith("/api/")) {
      return env.ASSETS.fetch(request);
    }

    const target = new URL(url.pathname + url.search, env.API_ORIGIN);
    const headers = new Headers(request.headers);
    headers.delete("host");
    // Overwrite (never append) so a client cannot forge its own IP.
    headers.set("X-Forwarded-For", request.headers.get("CF-Connecting-IP") ?? "");
    headers.set("X-Forwarded-Proto", "https");
    headers.set("X-Forwarded-Host", url.host);

    const hasBody = !["GET", "HEAD"].includes(request.method);
    try {
      return await fetch(target, {
        method: request.method,
        headers,
        body: hasBody ? request.body : undefined,
        // Pass Google sign-in redirects and Set-Cookie straight back to the browser.
        redirect: "manual",
      });
    } catch {
      return Response.json(
        { code: "SERVICE_UNAVAILABLE", message: "The API is waking up. Try again in a minute." },
        { status: 503 },
      );
    }
  },
};
