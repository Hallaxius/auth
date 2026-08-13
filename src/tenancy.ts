import { AuthError, ConfigurationError, ErrorCodes } from "./errors";
import type {
	ITenantMembershipStore,
	ITenantStore,
} from "./storage/interfaces";
import type { TenancyConfig, TenancyResult, TenantRecord } from "./types";
import { createSecurityLogger } from "./utils/logger";

const TENANT_HEADER = "x-tenant-id";

const logger = createSecurityLogger("tenancy");

/**
 * Best-effort hostname extraction: the `Host` header is the client-provided
 * authority; `x-forwarded-host` covers proxies and runtimes (e.g. Next.js 16)
 * that normalize `request.url` to the server's own address.
 */
function hostnameFromRequest(request: Request): string | null {
	for (const header of ["host", "x-forwarded-host"]) {
		const value = request.headers.get(header);
		if (!value) continue;
		let host = value.trim().toLowerCase();
		const colon = host.indexOf(":");
		if (colon !== -1) host = host.slice(0, colon);
		if (host) return host;
	}
	try {
		return new URL(request.url).hostname.toLowerCase();
	} catch {
		return null;
	}
}

/**
 * D3 — the ONLY supported tenant identification source is the subdomain.
 * `acme.example.com` → `acme` (first label). Returns `null` for single-label
 * hosts (e.g. `localhost`) or hosts not under any configured `baseDomain`.
 *
 * Never derive `tenantId` from body/query/header values.
 */
export function subdomainResolver(options?: {
	baseDomains?: string[];
}): (request: Request) => Promise<string | null> {
	const baseDomains = (options?.baseDomains ?? []).map((d) =>
		d.toLowerCase().replace(/^\./, ""),
	);

	return async (request: Request): Promise<string | null> => {
		const host = hostnameFromRequest(request)?.replace(/^\*\./, "");
		if (!host) return null;
		if (!host || host === "localhost" || host === "127.0.0.1") {
			return null;
		}

		if (baseDomains.length > 0) {
			const base = baseDomains.find(
				(b) => host === b || host.endsWith(`.${b}`),
			);
			if (!base || host === base) return null;
			const labels = host.slice(0, host.length - base.length - 1);
			const tenant = labels.split(".")[0];
			return tenant && tenant.length > 0 ? tenant : null;
		}

		const labels = host.split(".");
		if (labels.length < 2) return null;
		const tenant = labels[0];
		return tenant && tenant.length > 0 ? tenant : null;
	};
}

/**
 * Multi-tenancy factory (D2/D3/D4).
 *
 * ```ts
 * const tenancy = tenancy({
 *   enabled: true,
 *   baseDomains: ["example.com"],        // acme.example.com → tenant "acme"
 *   required: true,
 *   storage: { tenant, tenantMembership },
 * });
 *
 * const tenantId = await tenancy.requireTenant(request); // 403 on unresolved
 * await tenancy.getRoles(tenantId, userId);              // per-tenant roles
 * ```
 *
 * The package only scopes keys/claims on `tenantId` — row-level security
 * (Drizzle `pgPolicy` / Prisma `current_setting`) belongs to the consumer (D2).
 */
export function tenancy(config: TenancyConfig): TenancyResult {
	const required = config.required ?? false;
	const defaultTenantId = config.defaultTenantId;

	if (!config.storage?.tenant || !config.storage?.tenantMembership) {
		throw new ConfigurationError(
			"tenancy: storage.tenant and storage.tenantMembership are required",
		);
	}
	const tenantStore: ITenantStore = config.storage.tenant;
	const membershipStore: ITenantMembershipStore =
		config.storage.tenantMembership;

	const resolver =
		config.resolver ?? subdomainResolver({ baseDomains: config.baseDomains });

	async function resolveTenantRecord(
		request: Request,
	): Promise<TenantRecord | null> {
		const tenantId = await resolver(request);
		if (!tenantId) return null;

		const record =
			(await tenantStore.getByDomain(tenantId)) ??
			(await tenantStore.getById(tenantId));

		const headerTenant = request.headers.get(TENANT_HEADER);
		if (
			headerTenant &&
			headerTenant !== tenantId &&
			headerTenant !== record?.id
		) {
			logger.warn("tenant header divergence", {
				header: headerTenant,
				resolved: tenantId,
			});
			throw new AuthError(ErrorCodes.TENANT_MISMATCH, "Tenant mismatch", {
				statusCode: 403,
			});
		}

		if (record && record.status === "suspended") {
			throw new AuthError(ErrorCodes.TENANT_SUSPENDED, "Tenant is suspended", {
				statusCode: 403,
			});
		}

		if (!record && required) {
			throw new AuthError(ErrorCodes.TENANT_NOT_FOUND, "Tenant not found", {
				statusCode: 404,
			});
		}

		return record;
	}

	async function resolveTenant(request: Request): Promise<TenantRecord | null> {
		return resolveTenantRecord(request);
	}

	async function resolveTenantId(request: Request): Promise<string | null> {
		const record = await resolveTenantRecord(request);
		if (record) return record.id;
		return defaultTenantId ?? null;
	}

	async function requireTenant(request: Request): Promise<string> {
		const tenantId = await resolveTenantId(request);
		if (!tenantId) {
			throw new AuthError(ErrorCodes.TENANT_REQUIRED, "Tenant is required", {
				statusCode: 403,
			});
		}
		return tenantId;
	}

	async function getTenant(tenantId: string): Promise<TenantRecord | null> {
		return tenantStore.getById(tenantId);
	}

	async function getRoles(tenantId: string, userId: string): Promise<string[]> {
		const memberships = await membershipStore.getMemberships(userId);
		const membership = memberships.find((m) => m.tenantId === tenantId);
		return membership?.roles ?? [];
	}

	async function isMember(tenantId: string, userId: string): Promise<boolean> {
		const memberships = await membershipStore.getMemberships(userId);
		return memberships.some((m) => m.tenantId === tenantId);
	}

	return {
		resolveTenant,
		resolveTenantId,
		requireTenant,
		getTenant,
		getRoles,
		isMember,
		dispose: () => {
			tenantStore.dispose?.();
			membershipStore.dispose?.();
		},
	};
}
