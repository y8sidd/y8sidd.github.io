import type { Env } from "./env";
import { ApiError, body, boundedText, failure, json, textField } from "./http";
import { LIMITS } from "../../shared/limits";
export { RepositorySession } from "./session";
interface Counter {
  count: number;
  reset: number;
}
export class QuotaGuard {
  constructor(
    private state: DurableObjectState,
    private env: Env,
  ) {}
  async alarm() {
    await this.state.storage.deleteAll();
    await this.state.storage.deleteAlarm();
  }
  async fetch(request: Request) {
    try {
      const input = (await request.json()) as { ip: string; kind: string };
      const now = Date.now();
      const day = (Math.floor(now / 86400000) + 1) * 86400000;
      const checks: [string, number, number][] = [
        ["global:requests", 5000, day],
        ["minute:" + input.ip, 60, (Math.floor(now / 60000) + 1) * 60000],
      ];
      if (input.kind === "create")
        checks.push(
          ["global:sessions", Number(this.env.DAILY_SESSIONS) || 200, day],
          ["create:" + input.ip, 8, (Math.floor(now / 3600000) + 1) * 3600000],
        );
      if (input.kind === "mentor")
        checks.push(
          ["global:ai", Number(this.env.DAILY_AI_REQUESTS) || 100, day],
          ["ai:" + input.ip, 30, day],
        );
      await this.state.storage.transaction(async (tx) => {
        const values = [];
        for (const [key, max, reset] of checks) {
          const old = await tx.get<Counter>(key);
          const next = {
            count: old && old.reset > now ? old.count + 1 : 1,
            reset,
          };
          if (next.count > max)
            throw new ApiError(
              429,
              "RATE_LIMIT",
              "The request limit has been reached. Please try again later.",
            );
          values.push([key, next] as const);
        }
        for (const [key, next] of values) await tx.put(key, next);
      });
      if (!(await this.state.storage.getAlarm()))
        await this.state.storage.setAlarm(day);
      return json({ allowed: true });
    } catch (e) {
      return failure(e);
    }
  }
}
async function quota(env: Env, request: Request, kind: string) {
  const ip = request.headers.get("CF-Connecting-IP") ?? "local";
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(`${Math.floor(Date.now() / 86400000)}:${ip}`),
  );
  const hash = Array.from(new Uint8Array(digest), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
  const response = await env.QUOTAS.get(env.QUOTAS.idFromName("global")).fetch(
    "https://internal/quota",
    { method: "POST", body: JSON.stringify({ ip: hash, kind }) },
  );
  if (!response.ok)
    throw new ApiError(
      429,
      "RATE_LIMIT",
      "The service request limit has been reached. Please try again later.",
    );
}
async function challenge(env: Env, token: unknown) {
  if (!env.TURNSTILE_SECRET_KEY) return;
  if (typeof token !== "string" || !token)
    throw new ApiError(
      403,
      "VERIFICATION_REQUIRED",
      "Open the landing page and complete verification before opening a repository.",
    );
  const value = textField(token, 2048);
  const response = await fetch(
    "https://challenges.cloudflare.com/turnstile/v0/siteverify",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        secret: env.TURNSTILE_SECRET_KEY,
        response: value,
      }),
      signal: AbortSignal.timeout(10000),
    },
  );
  const result = JSON.parse(await boundedText(response, 8192)) as {
    success: boolean;
    hostname: string;
  };
  if (
    !result.success ||
    (env.TURNSTILE_HOSTNAME && result.hostname !== env.TURNSTILE_HOSTNAME)
  )
    throw new ApiError(
      403,
      "VERIFICATION_REQUIRED",
      "Please complete the verification and try again.",
    );
}
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const origin = request.headers.get("Origin");
    const allowed = (env.ALLOWED_ORIGINS ?? "").split(",").map((s) => s.trim());
    if (url.pathname === "/health" && request.method === "GET")
      return json({ status: "ok" });
    if (!origin || !allowed.includes(origin))
      return failure(
        new ApiError(
          403,
          "ORIGIN_DENIED",
          "This website is not allowed to access the API.",
        ),
      );
    let response: Response;
    try {
      if (request.method === "OPTIONS")
        response = new Response(null, { status: 204 });
      else if (url.pathname === "/v1/limits" && request.method === "GET")
        response = json({
          limits: LIMITS,
          aiMode: "user-key",
          supportedProviders: ["gemini", "openai"],
        });
      else if (url.pathname === "/v1/sessions" && request.method === "POST") {
        await quota(env, request, "create");
        const input = await body(request);
        await challenge(env, input.challengeToken);
        const token =
          crypto.randomUUID().replaceAll("-", "") +
          crypto.randomUUID().replaceAll("-", "");
        const stub = env.SESSIONS.get(env.SESSIONS.idFromName(token));
        const created = await stub.fetch("https://internal/create", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ owner: input.owner, repo: input.repo }),
        });
        if (!created.ok) response = created;
        else
          response = json(
            { ...((await created.json()) as object), sessionId: token },
            201,
          );
      } else {
        const route = url.pathname.match(
          /^\/v1\/session\/(graph|source|imports|mentor|close)$/,
        );
        if (!route)
          throw new ApiError(404, "NOT_FOUND", "Unknown API endpoint.");
        if (
          (["graph", "source"].includes(route[1]) &&
            request.method !== "GET") ||
          (!["graph", "source"].includes(route[1]) && request.method !== "POST")
        )
          throw new ApiError(405, "METHOD_NOT_ALLOWED", "Unsupported method.");
        let token = request.headers.get("X-Session-Token");
        let forward = request;
        if (route[1] === "close") {
          const input = await body(request);
          token = typeof input.sessionId === "string" ? input.sessionId : token;
          forward = new Request(request.url, { method: "POST" });
        }
        if (!token || !/^[a-f0-9]{64}$/.test(token))
          throw new ApiError(
            401,
            "SESSION_REQUIRED",
            "A valid session is required.",
          );
        if (route[1] !== "close") await quota(env, request, route[1]);
        const stub = env.SESSIONS.get(env.SESSIONS.idFromName(token));
        response = await stub.fetch(
          new Request("https://internal/" + route[1] + url.search, forward),
        );
      }
    } catch (e) {
      response = failure(e);
    }
    const headers = new Headers(response.headers);
    headers.set("Access-Control-Allow-Origin", origin);
    headers.set("Vary", "Origin");
    headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    headers.set(
      "Access-Control-Allow-Headers",
      "Content-Type, X-Session-Token",
    );
    headers.set("Access-Control-Max-Age", "600");
    headers.set("Cache-Control", "no-store");
    headers.set("X-Content-Type-Options", "nosniff");
    if (response.status === 429) headers.set("Retry-After", "60");
    return new Response(response.body, { status: response.status, headers });
  },
};
