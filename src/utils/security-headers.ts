/**
 * @file Security headers middleware
 *
 * Implements comprehensive security headers for production applications.
 * Provides CSP, HSTS, X-Frame-Options, and other security headers.
 *
 * @module utils/security-headers
 */

export interface SecurityHeadersConfig {
	/** Content-Security-Policy directives */
	csp?: CspConfig;
	/** Strict-Transport-Security max-age in seconds */
	hsts?: HstsConfig;
	/** X-Content-Type-Options (default: "nosniff") */
	contentTypeOptions?: boolean;
	/** X-Frame-Options (default: "DENY") */
	frameOptions?: FrameOptionsConfig;
	/** X-XSS-Protection (default: false, deprecated) */
	xssProtection?: boolean;
	/** Referrer-Policy (default: "strict-origin-when-cross-origin") */
	referrerPolicy?: ReferrerPolicy;
	/** Permissions-Policy directives */
	permissionsPolicy?: PermissionsPolicyConfig;
	/** Cross-Origin-Opener-Policy (default: "same-origin") */
	crossOriginOpenerPolicy?: CoopValue;
	/** Cross-Origin-Embedder-Policy (default: "require-corp") */
	crossOriginEmbedderPolicy?: CoepValue;
	/** Cross-Origin-Resource-Policy */
	crossOriginResourcePolicy?: CorpValue;
	/** Cache-Control for sensitive pages */
	cacheControl?: CacheControlConfig;
}

export interface CspConfig {
	/** Enable CSP (default: true if config provided) */
	enabled?: boolean;
	/** default-src directive */
	defaultSrc?: string[];
	/** script-src directive */
	scriptSrc?: string[];
	/** style-src directive */
	styleSrc?: string[];
	/** img-src directive */
	imgSrc?: string[];
	/** font-src directive */
	fontSrc?: string[];
	/** connect-src directive */
	connectSrc?: string[];
	/** frame-src directive */
	frameSrc?: string[];
	/** object-src directive */
	objectSrc?: string[];
	/** base-uri directive */
	baseUri?: string[];
	/** form-action directive */
	formAction?: string[];
	/** frame-ancestors directive */
	frameAncestors?: string[];
	/** upgrade-insecure-requests */
	upgradeInsecureRequests?: boolean;
	/** block-all-mixed-content (deprecated but still useful) */
	blockAllMixedContent?: boolean;
	/** report-uri directive */
	reportUri?: string;
	/** report-to directive */
	reportTo?: string;
}

export interface HstsConfig {
	/** Enable HSTS (default: true in production) */
	enabled?: boolean;
	/** max-age in seconds (default: 31536000 = 1 year) */
	maxAge?: number;
	/** includeSubDomains directive */
	includeSubDomains?: boolean;
	/** preload directive */
	preload?: boolean;
}

export type FrameOptions = "DENY" | "SAMEORIGIN";

export interface FrameOptionsConfig {
	/** Enable X-Frame-Options (default: true) */
	enabled?: boolean;
	/** Frame option value */
	option?: FrameOptions;
}

export type ReferrerPolicy =
	| "no-referrer"
	| "no-referrer-when-downgrade"
	| "origin"
	| "origin-when-cross-origin"
	| "same-origin"
	| "strict-origin"
	| "strict-origin-when-cross-origin"
	| "unsafe-url";

export interface PermissionsPolicyConfig {
	/** accelerometer directive */
	accelerometer?: string[];
	/** ambient-light-sensor directive */
	ambientLightSensor?: string[];
	/** autoplay directive */
	autoplay?: string[];
	/** battery directive */
	battery?: string[];
	/** camera directive */
	camera?: string[];
	/** cross-origin-isolated directive */
	crossOriginIsolated?: string[];
	/** display-capture directive */
	displayCapture?: string[];
	/** document-domain directive */
	documentDomain?: string[];
	/** encrypted-media directive */
	encryptedMedia?: string[];
	/** execution-while-not-rendered directive */
	executionWhileNotRendered?: string[];
	/** execution-while-out-of-viewport directive */
	executionWhileOutOfViewport?: string[];
	/** fullscreen directive */
	fullscreen?: string[];
	/** geolocation directive */
	geolocation?: string[];
	/** gyroscope directive */
	gyroscope?: string[];
	/** keyboard-map directive */
	keyboardMap?: string[];
	/** magnetometer directive */
	magnetometer?: string[];
	/** microphone directive */
	microphone?: string[];
	/** midi directive */
	midi?: string[];
	/** navigation-override directive */
	navigationOverride?: string[];
	/** payment directive */
	payment?: string[];
	/** picture-in-picture directive */
	pictureInPicture?: string[];
	/** publickey-credentials-get directive */
	publickeyCredentialsGet?: string[];
	/** screen-wake-lock directive */
	screenWakeLock?: string[];
	/** sync-xhr directive */
	syncXhr?: string[];
	/** usb directive */
	usb?: string[];
	/** web-share directive */
	webShare?: string[];
	/** xr-spatial-tracking directive */
	xrSpatialTracking?: string[];
}

export type CoopValue = "same-origin" | "same-origin-allow-popouts" | "unsafe-none";
export type CoepValue = "require-corp" | "unsafe-none";
export type CorpValue = "same-origin" | "cross-origin" | "same-site";

export interface CacheControlConfig {
	/** Enable cache control for sensitive pages */
	enabled?: boolean;
	/** no-store directive */
	noStore?: boolean;
	/** no-cache directive */
	noCache?: boolean;
	/** private directive */
	private?: boolean;
	/** max-age directive */
	maxAge?: number;
}

function buildCspHeader(config: CspConfig): string {
	const directives: string[] = [];

	if (config.defaultSrc) {
		directives.push(`default-src ${config.defaultSrc.join(" ")}`);
	}
	if (config.scriptSrc) {
		directives.push(`script-src ${config.scriptSrc.join(" ")}`);
	}
	if (config.styleSrc) {
		directives.push(`style-src ${config.styleSrc.join(" ")}`);
	}
	if (config.imgSrc) {
		directives.push(`img-src ${config.imgSrc.join(" ")}`);
	}
	if (config.fontSrc) {
		directives.push(`font-src ${config.fontSrc.join(" ")}`);
	}
	if (config.connectSrc) {
		directives.push(`connect-src ${config.connectSrc.join(" ")}`);
	}
	if (config.frameSrc) {
		directives.push(`frame-src ${config.frameSrc.join(" ")}`);
	}
	if (config.objectSrc) {
		directives.push(`object-src ${config.objectSrc.join(" ")}`);
	}
	if (config.baseUri) {
		directives.push(`base-uri ${config.baseUri.join(" ")}`);
	}
	if (config.formAction) {
		directives.push(`form-action ${config.formAction.join(" ")}`);
	}
	if (config.frameAncestors) {
		directives.push(`frame-ancestors ${config.frameAncestors.join(" ")}`);
	}
	if (config.upgradeInsecureRequests) {
		directives.push("upgrade-insecure-requests");
	}
	if (config.blockAllMixedContent) {
		directives.push("block-all-mixed-content");
	}
	if (config.reportUri) {
		directives.push(`report-uri ${config.reportUri}`);
	}
	if (config.reportTo) {
		directives.push(`report-to ${config.reportTo}`);
	}

	return directives.join("; ");
}

function buildHstsHeader(config: HstsConfig): string {
	const parts = [`max-age=${config.maxAge ?? 31536000}`];

	if (config.includeSubDomains) {
		parts.push("includeSubDomains");
	}
	if (config.preload) {
		parts.push("preload");
	}

	return parts.join("; ");
}

function buildPermissionsPolicyHeader(config: PermissionsPolicyConfig): string {
	const directives: string[] = [];

	const directiveMap: Record<keyof PermissionsPolicyConfig, string> = {
		accelerometer: "accelerometer",
		ambientLightSensor: "ambient-light-sensor",
		autoplay: "autoplay",
		battery: "battery",
		camera: "camera",
		crossOriginIsolated: "cross-origin-isolated",
		displayCapture: "display-capture",
		documentDomain: "document-domain",
		encryptedMedia: "encrypted-media",
		executionWhileNotRendered: "execution-while-not-rendered",
		executionWhileOutOfViewport: "execution-while-out-of-viewport",
		fullscreen: "fullscreen",
		geolocation: "geolocation",
		gyroscope: "gyroscope",
		keyboardMap: "keyboard-map",
		magnetometer: "magnetometer",
		microphone: "microphone",
		midi: "midi",
		navigationOverride: "navigation-override",
		payment: "payment",
		pictureInPicture: "picture-in-picture",
		publickeyCredentialsGet: "publickey-credentials-get",
		screenWakeLock: "screen-wake-lock",
		syncXhr: "sync-xhr",
		usb: "usb",
		webShare: "web-share",
		xrSpatialTracking: "xr-spatial-tracking",
	};

	for (const [key, value] of Object.entries(config)) {
		const directiveName = directiveMap[key as keyof PermissionsPolicyConfig];
		if (directiveName && Array.isArray(value)) {
			directives.push(`${directiveName}=(${value.join(" ")})`);
		}
	}

	return directives.join(", ");
}

function buildCacheControlHeader(config: CacheControlConfig): string {
	const directives: string[] = [];

	if (config.noStore) {
		directives.push("no-store");
	}
	if (config.noCache) {
		directives.push("no-cache");
	}
	if (config.private) {
		directives.push("private");
	}
	if (typeof config.maxAge === "number") {
		directives.push(`max-age=${config.maxAge}`);
	}

	return directives.join(", ");
}

export function securityHeaders(config: SecurityHeadersConfig = {}) {
	return function securityHeadersMiddleware(request: Request): Response | undefined {
		const headers = new Headers();

		if (config.csp?.enabled !== false && config.csp) {
			const cspValue = buildCspHeader(config.csp);
			if (cspValue) {
				headers.set("Content-Security-Policy", cspValue);
			}
		}

		const hstsEnabled = config.hsts?.enabled ?? true;
		if (hstsEnabled && config.hsts) {
			const hstsValue = buildHstsHeader(config.hsts);
			headers.set("Strict-Transport-Security", hstsValue);
		}

		if (config.contentTypeOptions !== false) {
			headers.set("X-Content-Type-Options", "nosniff");
		}

		if (config.frameOptions?.enabled !== false) {
			const option = config.frameOptions?.option ?? "DENY";
			headers.set("X-Frame-Options", option);
		}

		if (config.xssProtection) {
			headers.set("X-XSS-Protection", "1; mode=block");
		}

		const referrerPolicy = config.referrerPolicy ?? "strict-origin-when-cross-origin";
		headers.set("Referrer-Policy", referrerPolicy);

		if (config.permissionsPolicy) {
			const permissionsValue = buildPermissionsPolicyHeader(config.permissionsPolicy);
			if (permissionsValue) {
				headers.set("Permissions-Policy", permissionsValue);
			}
		}

		if (config.crossOriginOpenerPolicy) {
			headers.set("Cross-Origin-Opener-Policy", config.crossOriginOpenerPolicy);
		}

		if (config.crossOriginEmbedderPolicy) {
			headers.set("Cross-Origin-Embedder-Policy", config.crossOriginEmbedderPolicy);
		}

		if (config.crossOriginResourcePolicy) {
			headers.set("Cross-Origin-Resource-Policy", config.crossOriginResourcePolicy);
		}

		if (config.cacheControl?.enabled) {
			const cacheValue = buildCacheControlHeader(config.cacheControl);
			if (cacheValue) {
				headers.set("Cache-Control", cacheValue);
			}
		}

		return { headers };
	};
}

export function applySecurityHeaders(
	response: Response,
	config: SecurityHeadersConfig = {},
): Response {
	const headers = new Headers(response.headers);

	if (config.csp?.enabled !== false && config.csp) {
		const cspValue = buildCspHeader(config.csp);
		if (cspValue) {
			headers.set("Content-Security-Policy", cspValue);
		}
	}

	const hstsEnabled = config.hsts?.enabled ?? true;
	if (hstsEnabled && config.hsts) {
		const hstsValue = buildHstsHeader(config.hsts);
		headers.set("Strict-Transport-Security", hstsValue);
	}

	if (config.contentTypeOptions !== false) {
		headers.set("X-Content-Type-Options", "nosniff");
	}

	if (config.frameOptions?.enabled !== false) {
		const option = config.frameOptions?.option ?? "DENY";
		headers.set("X-Frame-Options", option);
	}

	if (config.xssProtection) {
		headers.set("X-XSS-Protection", "1; mode=block");
	}

	const referrerPolicy = config.referrerPolicy ?? "strict-origin-when-cross-origin";
	headers.set("Referrer-Policy", referrerPolicy);

	if (config.permissionsPolicy) {
		const permissionsValue = buildPermissionsPolicyHeader(config.permissionsPolicy);
		if (permissionsValue) {
			headers.set("Permissions-Policy", permissionsValue);
		}
	}

	if (config.crossOriginOpenerPolicy) {
		headers.set("Cross-Origin-Opener-Policy", config.crossOriginOpenerPolicy);
	}

	if (config.crossOriginEmbedderPolicy) {
		headers.set("Cross-Origin-Embedder-Policy", config.crossOriginEmbedderPolicy);
	}

	if (config.crossOriginResourcePolicy) {
		headers.set("Cross-Origin-Resource-Policy", config.crossOriginResourcePolicy);
	}

	if (config.cacheControl?.enabled) {
		const cacheValue = buildCacheControlHeader(config.cacheControl);
		if (cacheValue) {
			headers.set("Cache-Control", cacheValue);
		}
	}

	return new Response(response.body, {
		status: response.status,
		statusText: response.statusText,
		headers,
	});
}

export const defaultSecurityHeaders: SecurityHeadersConfig = {
	csp: {
		enabled: true,
		defaultSrc: ["'self'"],
		scriptSrc: ["'self'"],
		styleSrc: ["'self'", "'unsafe-inline'"],
		imgSrc: ["'self'", "data:", "https:"],
		fontSrc: ["'self'"],
		connectSrc: ["'self'"],
		frameSrc: ["'none'"],
		objectSrc: ["'none'"],
		baseUri: ["'self'"],
		formAction: ["'self'"],
		frameAncestors: ["'none'"],
		upgradeInsecureRequests: true,
		blockAllMixedContent: true,
	},
	hsts: {
		enabled: true,
		maxAge: 31536000,
		includeSubDomains: true,
		preload: true,
	},
	contentTypeOptions: true,
	frameOptions: {
		enabled: true,
		option: "DENY",
	},
	xssProtection: false,
	referrerPolicy: "strict-origin-when-cross-origin",
	permissionsPolicy: {
		accelerometer: [],
		ambientLightSensor: [],
		autoplay: [],
		battery: [],
		camera: [],
		crossOriginIsolated: [],
		displayCapture: [],
		documentDomain: [],
		encryptedMedia: [],
		executionWhileNotRendered: [],
		executionWhileOutOfViewport: [],
		fullscreen: [],
		geolocation: [],
		gyroscope: [],
		keyboardMap: [],
		magnetometer: [],
		microphone: [],
		midi: [],
		navigationOverride: [],
		payment: [],
		pictureInPicture: [],
		publickeyCredentialsGet: [],
		screenWakeLock: [],
		syncXhr: [],
		usb: [],
		webShare: [],
		xrSpatialTracking: [],
	},
	crossOriginOpenerPolicy: "same-origin",
	crossOriginEmbedderPolicy: "require-corp",
	crossOriginResourcePolicy: "same-origin",
	cacheControl: {
		enabled: true,
		noStore: true,
	},
};
