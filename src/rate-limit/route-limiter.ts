import type { IRateLimitStore } from "../storage/interfaces";
import { getRequestIP } from "../utils/ip";

export interface RouteRateLimitRule {
	path: string;
	method?: string | string[];
	maxRequests: number;
	windowMs: number;
	keyBy?: "ip" | "user" | "route+ip" | "route+user";
}

export interface RouteRateLimitConfig {
	enabled: boolean;
	default: { maxRequests: number; windowMs: number };
	routes: RouteRateLimitRule[];
	storage?: IRateLimitStore;
	trustProxy?: boolean;
}

export interface RateLimitResult {
	allowed: boolean;
	limit: number;
	remaining: number;
	resetAt: number;
	route: string;
}

export class RouteLimiter {
	private routeCache = new Map<string, RouteRateLimitRule | null>();
	private defaultRule: RouteRateLimitRule;

	constructor(private config: RouteRateLimitConfig) {
		this.defaultRule = {
			path: "*",
			maxRequests: config.default.maxRequests,
			windowMs: config.default.windowMs,
		};
	}

	async check(request: Request, userId?: string): Promise<RateLimitResult> {
		if (!this.config.storage) {
			return {
				allowed: true,
				limit: this.defaultRule.maxRequests,
				remaining: this.defaultRule.maxRequests,
				resetAt: Date.now() + this.defaultRule.windowMs,
				route: "global",
			};
		}

		const url = new URL(request.url);
		const path = url.pathname;
		const method = request.method;

		const rule = this.getMatchingRule(path, method);
		const key = await this.buildKey(request, rule, userId);

		const result = await this.config.storage.increment(key, rule.windowMs);
		const allowed = result.count <= rule.maxRequests;

		return {
			allowed,
			limit: rule.maxRequests,
			remaining: Math.max(0, rule.maxRequests - result.count),
			resetAt: result.resetAt,
			route: this.getRoutePrefix(rule.path),
		};
	}

	async middleware(
		request: Request,
		userId?: string,
	): Promise<Response | undefined> {
		const result = await this.check(request, userId);
		if (!result.allowed) {
			return new Response("Too Many Requests", {
				status: 429,
				headers: this.buildHeaders(result),
			});
		}
		return undefined;
	}

	private getMatchingRule(path: string, method: string): RouteRateLimitRule {
		const cacheKey = `${method} ${path}`;
		const cached = this.routeCache.get(cacheKey);
		if (cached !== undefined) {
			return cached || this.defaultRule;
		}

		for (const rule of this.config.routes) {
			if (this.ruleMatches(rule, path, method)) {
				this.routeCache.set(cacheKey, rule);
				return rule;
			}
		}

		this.routeCache.set(cacheKey, null);
		return this.defaultRule;
	}

	private ruleMatches(
		rule: RouteRateLimitRule,
		path: string,
		method: string,
	): boolean {
		if (rule.path === "*") return true;
		if (rule.path !== path) return false;
		if (rule.method) {
			const methods = Array.isArray(rule.method) ? rule.method : [rule.method];
			if (!methods.includes(method)) return false;
		}
		return true;
	}

	private async buildKey(
		request: Request,
		rule: RouteRateLimitRule,
		userId?: string,
	): Promise<string> {
		const routePrefix = this.getRoutePrefix(rule.path);
		const ip = await this.extractIP(request);
		const keyBy = rule.keyBy || "route+ip";
		const methodTag = rule.method ? `:m:${request.method}` : "";

		switch (keyBy) {
			case "ip":
				return `route:${routePrefix}${methodTag}:ip:${ip}`;
			case "user":
				return userId
					? `route:${routePrefix}${methodTag}:user:${userId}`
					: `route:${routePrefix}${methodTag}:ip:${ip}`;
			case "route+user":
				return userId
					? `route:${routePrefix}${methodTag}:user:${userId}`
					: `route:${routePrefix}${methodTag}:ip:${ip}`;
			default:
				return `route:${routePrefix}${methodTag}:ip:${ip}`;
		}
	}

	private getRoutePrefix(path: string): string {
		if (path.startsWith("/auth/login")) return "login";
		if (path.startsWith("/auth/register")) return "register";
		if (path.startsWith("/auth/callback")) return "callback";
		if (path.startsWith("/auth/me")) return "me";
		if (path.startsWith("/auth/")) return "auth";
		return "global";
	}

	private async extractIP(request: Request): Promise<string> {
		return (
			(await getRequestIP(request, { trustProxy: this.config.trustProxy })) ??
			"unknown"
		);
	}

	private buildHeaders(result: RateLimitResult): Headers {
		const headers = new Headers();
		headers.set("RateLimit-Limit", result.limit.toString());
		headers.set("RateLimit-Remaining", result.remaining.toString());
		headers.set(
			"RateLimit-Reset",
			Math.floor(result.resetAt / 1000).toString(),
		);
		headers.set("RateLimit-Route", result.route);
		headers.set(
			"RateLimit-Policy",
			`${result.limit}/${Math.floor(result.resetAt / 1000)}s`,
		);
		return headers;
	}
}
