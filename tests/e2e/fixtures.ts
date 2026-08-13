import { test as base, expect, type APIRequestContext } from "@playwright/test";
import { randomUUID } from "node:crypto";

const SEED_EMAIL = "e2e-user@example.com";
const SEED_PASSWORD = "E2E-Pass-1234!";

function uniqueEmail(prefix = "e2e"): string {
  return `${prefix}-${randomUUID().slice(0, 10)}@example.com`;
}

interface ApiResponse {
  status: number;
  headers: Record<string, string>;
  _json: unknown;
  json(): Record<string, unknown>;
}

function wrapResponse(resp: Awaited<ReturnType<APIRequestContext["get"]>>): ApiResponse {
  const status = resp.status();
  const headers: Record<string, string> = {};
  resp.headersArray().forEach((h) => {
    if (h.name && h.value) headers[h.name.toLowerCase()] = h.value;
  });
  return {
    status,
    headers,
    _json: null as unknown,
    json() {
      // cache parse
      return this._json as Record<string, unknown>;
    },
  };
}

class Api {
  private baseURL: string;
  private sharedCtx: APIRequestContext;

  constructor(sharedCtx: APIRequestContext, baseURL: string) {
    this.baseURL = baseURL;
    this.sharedCtx = sharedCtx;
  }

  private async getCtx(userAgent?: string): Promise<{ ctx: APIRequestContext; dispose?: () => Promise<void> }> {
    if (!userAgent) return { ctx: this.sharedCtx };
    return { ctx: this.sharedCtx };
  }

  async get(
    path: string,
    opts: {
      userAgent?: string;
      extraHeaders?: Record<string, string>;
      base?: string;
    } = {},
  ): Promise<ApiResponse> {
    const { ctx } = await this.getCtx(opts.userAgent);
    const headers: Record<string, string> = { ...(opts.extraHeaders || {}) };
    if (opts.userAgent) headers["User-Agent"] = opts.userAgent;
    const resp = await ctx.get(`${opts.base || this.baseURL}${path}`, {
      headers,
    });
    const status = resp.status();
    const respHeaders: Record<string, string> = {};
    resp.headersArray().forEach((h: { name: string; value: string }) => {
      if (h.name && h.value) respHeaders[h.name.toLowerCase()] = h.value;
    });
    let _json: unknown = null;
    try {
      _json = await resp.json();
    } catch {
      // not json
    }
    return { status, headers: respHeaders, _json, json() { return _json as Record<string, unknown>; } };
  }

  async post(
    path: string,
    payload?: Record<string, unknown>,
    opts: {
      userAgent?: string;
      extraHeaders?: Record<string, string>;
      contentType?: string | null;
      base?: string;
    } = {},
  ): Promise<ApiResponse> {
    const { ctx } = await this.getCtx(opts.userAgent);
    const contentType = opts.contentType !== undefined ? opts.contentType : "application/json";
    const body = payload ? JSON.stringify(payload) : "{}";
    const headers: Record<string, string> = { ...(opts.extraHeaders || {}) };
    if (contentType) headers["Content-Type"] = contentType;
    if (opts.userAgent) headers["User-Agent"] = opts.userAgent;
    const resp = await ctx.fetch(`${opts.base || this.baseURL}${path}`, {
      method: "POST",
      headers,
      data: body,
    });
    const status = resp.status();
    const respHeaders: Record<string, string> = {};
    resp.headersArray().forEach((h: { name: string; value: string }) => {
      if (h.name && h.value) respHeaders[h.name.toLowerCase()] = h.value;
    });
    let _json: unknown = null;
    try {
      _json = await resp.json();
    } catch {
      // not json
    }
    return { status, headers: respHeaders, _json, json() { return _json as Record<string, unknown>; } };
  }

  async login(
    email = SEED_EMAIL,
    password = SEED_PASSWORD,
    opts: {
      userAgent?: string;
      extraHeaders?: Record<string, string>;
      base?: string;
    } = {},
  ): Promise<ApiResponse> {
    return this.post("/api/auth/login", { email, password }, opts);
  }

  async register(
    email: string,
    password: string,
    opts: {
      userAgent?: string;
      extraHeaders?: Record<string, string>;
    } = {},
  ): Promise<ApiResponse> {
    return this.post("/api/auth/register", { email, password }, opts);
  }
}

type Fixtures = {
  api: Api;
  page: import("@playwright/test").Page;
};

const test = base.extend<Fixtures>({
  api: async ({ playwright }, use) => {
    const ctx = await playwright.request.newContext({
      userAgent: `e2e-api-${randomUUID().slice(0, 12)}`,
    });
    const api = new Api(ctx, process.env.E2E_BASE_URL || `http://localhost:${process.env.E2E_PORT || 3100}`);
    await use(api);
    await ctx.dispose();
  },
  page: async ({ page: basePage }, use) => {
    await use(basePage);
  },
});

export { SEED_EMAIL, SEED_PASSWORD, uniqueEmail, test, expect };
