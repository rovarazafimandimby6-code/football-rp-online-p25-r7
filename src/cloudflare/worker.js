const json = (status, body) => new Response(JSON.stringify(body), {
  status,
  headers: {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  },
});

export default {
  async fetch(request, env = {}) {
    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === "/health") {
      return json(200, {
        ok: true,
        status: "live",
        service: "football-rp-online-p27-cloudflare",
        stage: "bootstrap",
      });
    }

    if (request.method === "GET" && url.pathname === "/readyz") {
      if (!env.P27_DB || typeof env.P27_DB.prepare !== "function") {
        return json(503, {
          ok: false,
          status: "not-ready",
          reason: "D1_BINDING_MISSING",
        });
      }

      try {
        const probe = await env.P27_DB.prepare("SELECT 1 AS ok").first();
        if (Number(probe?.ok) !== 1) throw new Error("D1_PROBE_FAILED");
        return json(200, {
          ok: true,
          status: "ready",
          storage: "d1-connected",
          stage: "bootstrap",
        });
      } catch {
        return json(503, {
          ok: false,
          status: "not-ready",
          reason: "D1_UNAVAILABLE",
        });
      }
    }

    return json(501, {
      error: "CLOUDFLARE_API_NOT_MIGRATED",
      message: "Cette entrée Cloudflare est un socle de migration. Les routes P27 ne sont pas encore migrées.",
    });
  },
};
