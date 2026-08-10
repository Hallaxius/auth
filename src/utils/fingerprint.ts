import { sha256 } from "./hex";
import { getRequestIP } from "./ip";

export interface FingerprintConfig {
	mode: "off" | "warning" | "strict" | "challenge";
	includeIP?: boolean;
	includeUserAgent?: boolean;
	includeTimezone?: boolean;
	includeLanguage?: boolean;
}

export interface FingerprintComponents {
	ip?: string;
	userAgent?: string;
	timezone?: string;
	language?: string;
	screenResolution?: string;
}

export async function generateSessionFingerprint(
	components: FingerprintComponents,
): Promise<string> {
	const parts: string[] = [];

	if (components.ip) {
		parts.push(`ip:${components.ip}`);
	}
	if (components.userAgent) {
		parts.push(`ua:${components.userAgent}`);
	}
	if (components.timezone) {
		parts.push(`tz:${components.timezone}`);
	}
	if (components.language) {
		parts.push(`lang:${components.language}`);
	}
	if (components.screenResolution) {
		parts.push(`screen:${components.screenResolution}`);
	}

	const rawFingerprint = parts.join("|");
	return sha256(rawFingerprint);
}

export async function extractFingerprintFromRequest(
	request: Request,
	config?: Partial<FingerprintConfig>,
): Promise<FingerprintComponents> {
	const components: FingerprintComponents = {};

	const includeIP = config?.includeIP ?? true;
	const includeUserAgent = config?.includeUserAgent ?? true;
	const includeTimezone = config?.includeTimezone ?? false;
	const includeLanguage = config?.includeLanguage ?? true;

	if (includeIP) {
		components.ip = (await getRequestIP(request)) ?? undefined;
	}

	if (includeUserAgent) {
		components.userAgent = request.headers.get("user-agent") ?? undefined;
	}

	if (includeTimezone) {
		components.timezone = request.headers.get("x-timezone") ?? undefined;
	}

	if (includeLanguage) {
		components.language = request.headers.get("accept-language") ?? undefined;
	}

	return components;
}

export function validateFingerprint(
	storedFingerprint: string,
	currentFingerprint: string,
	mode: FingerprintConfig["mode"],
): { valid: boolean; severity?: "warning" | "critical" } {
	if (mode === "off") {
		return { valid: true };
	}

	if (storedFingerprint === currentFingerprint) {
		return { valid: true };
	}

	if (mode === "warning") {
		return { valid: true, severity: "warning" };
	}

	if (mode === "strict" || mode === "challenge") {
		return { valid: false, severity: "critical" };
	}

	return { valid: true };
}
