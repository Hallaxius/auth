import { AuthError, ErrorCodes } from "../errors";
import type {
	AnomalyEvent,
	AnomalySeverity,
	LoginHistoryStore,
	LoginRecord,
} from "../types";
import { getRequestIP } from "../utils/ip";

export interface GeolocationProvider {
	resolve(ip: string): Promise<{ latitude: number; longitude: number } | null>;
}

export interface TorExitProvider {
	isExitNode(ip: string): Promise<boolean>;
}

export class LoginAnomalyError extends AuthError {
	constructor(
		message = "Suspicious login activity detected",
		options?: { cause?: Error },
	) {
		super(ErrorCodes.LOGIN_ANOMALY_DETECTED, message, {
			statusCode: 403,
			cause: options?.cause,
		});
	}
}

export interface AnomalyConfig {
	enabled: boolean;

	maxHistoryPerUser?: number;
	historyRetentionDays?: number;

	checkNewLocation?: boolean;
	checkNewDevice?: boolean;
	checkUnusualHour?: boolean;
	checkMultipleCountries?: boolean;
	checkImpossibleTravel?: boolean;
	checkCredentialStuffing?: boolean;
	checkTorUsage?: boolean;

	unusualHourStart?: number;
	unusualHourEnd?: number;
	impossibleTravelKmh?: number;
	multipleCountriesWindowMs?: number;
	credentialStuffingThreshold?: number;

	onAnomaly?: "log" | "challenge_mfa" | "block" | "notify";
	defaultAction?: "log" | "challenge_mfa" | "block" | "notify";

	storage?: LoginHistoryStore;

	geolocation?: GeolocationProvider;
	torExitProvider?: TorExitProvider;

	onAnomalyDetected?: (event: AnomalyEvent) => Promise<void>;
}

export class AnomalyDetector {
	private config: Required<
		Omit<
			AnomalyConfig,
			"storage" | "onAnomalyDetected" | "geolocation" | "torExitProvider"
		>
	> & {
		storage?: LoginHistoryStore;
		geolocation?: GeolocationProvider;
		torExitProvider?: TorExitProvider;
		onAnomalyDetected?: (event: AnomalyEvent) => Promise<void>;
	};

	constructor(config: AnomalyConfig) {
		this.config = {
			enabled: config.enabled ?? false,
			maxHistoryPerUser: config.maxHistoryPerUser ?? 50,
			historyRetentionDays: config.historyRetentionDays ?? 90,
			checkNewLocation: config.checkNewLocation ?? true,
			checkNewDevice: config.checkNewDevice ?? true,
			checkUnusualHour: config.checkUnusualHour ?? true,
			checkMultipleCountries: config.checkMultipleCountries ?? true,
			checkImpossibleTravel: config.checkImpossibleTravel ?? true,
			checkCredentialStuffing: config.checkCredentialStuffing ?? true,
			checkTorUsage: config.checkTorUsage ?? true,
			unusualHourStart: config.unusualHourStart ?? 22,
			unusualHourEnd: config.unusualHourEnd ?? 6,
			impossibleTravelKmh: config.impossibleTravelKmh ?? 800,
			multipleCountriesWindowMs: config.multipleCountriesWindowMs ?? 3600000,
			credentialStuffingThreshold: config.credentialStuffingThreshold ?? 20,
			onAnomaly: config.onAnomaly ?? "log",
			defaultAction: config.defaultAction ?? "log",
			storage: config.storage,
			geolocation: config.geolocation,
			torExitProvider: config.torExitProvider,
			onAnomalyDetected: config.onAnomalyDetected,
		};
	}

	async analyze(
		request: Request,
		userId: string,
		success: boolean,
	): Promise<AnomalyEvent[]> {
		if (!this.config.enabled) {
			return [];
		}

		const events: AnomalyEvent[] = [];
		const ip = await this.extractIP(request);
		const userAgent = request.headers.get("user-agent") ?? "unknown";
		const hour = new Date().getUTCHours();

		const record: LoginRecord = {
			userId,
			ip,
			userAgent,
			timestamp: Date.now(),
			success,
			hour,
		};

		const checks = await Promise.allSettled([
			this.checkNewLocation(userId, ip),
			this.checkNewDevice(userId, userAgent),
			this.checkUnusualHour(hour),
			this.checkMultipleCountries(userId),
			this.checkImpossibleTravel(userId, ip, record.timestamp),
			this.checkCredentialStuffing(userId),
			this.checkTorUsage(ip),
		]);

		for (const result of checks) {
			if (result.status === "fulfilled" && result.value) {
				events.push(result.value);
			}
		}

		if (events.length > 0) {
			await this.handleAnomalies(events);
		}

		await this.config.storage?.addRecord(record);

		return events;
	}

	private async checkNewLocation(
		userId: string,
		ip: string,
	): Promise<AnomalyEvent | null> {
		if (!this.config.checkNewLocation) return null;

		const recentIPs = await this.config.storage!.getRecentIPs(userId);
		if (recentIPs.length === 0) return null;
		if (!recentIPs.includes(ip)) {
			return {
				type: "new_location",
				severity: "medium",
				userId,
				ip,
				timestamp: Date.now(),
				userAgent: "",
				details: { recentIPs, newIP: ip },
			};
		}
		return null;
	}

	private async checkNewDevice(
		userId: string,
		userAgent: string,
	): Promise<AnomalyEvent | null> {
		if (!this.config.checkNewDevice) return null;

		const recentUAs = await this.config.storage!.getRecentUserAgents(userId);
		if (recentUAs.length === 0) return null;

		const userAgentFingerprint = await this.sha256(userAgent);
		const hashes = await Promise.all(
			recentUAs.map((ua: string) => this.sha256(ua)),
		);
		const known = hashes.includes(userAgentFingerprint);

		if (!known) {
			return {
				type: "new_device",
				severity: "medium",
				userId,
				ip: "",
				timestamp: Date.now(),
				userAgent,
				details: { recentUAs: recentUAs.length },
			};
		}
		return null;
	}

	private async checkUnusualHour(hour: number): Promise<AnomalyEvent | null> {
		if (!this.config.checkUnusualHour) return null;

		const start = this.config.unusualHourStart ?? 22;
		const end = this.config.unusualHourEnd ?? 6;
		const isUnusual =
			start <= 23 && end >= 0
				? hour >= start || hour < end
				: hour >= start && hour < end;

		if (isUnusual) {
			return {
				type: "unusual_hour",
				severity: "low",
				userId: "",
				ip: "",
				timestamp: Date.now(),
				userAgent: "",
				details: { hour, unusualWindow: `${start}:00-${end}:00 UTC` },
			};
		}
		return null;
	}

	private async checkMultipleCountries(
		userId: string,
	): Promise<AnomalyEvent | null> {
		if (!this.config.checkMultipleCountries) return null;

		const windowMs = this.config.multipleCountriesWindowMs ?? 3600000;
		const countries = await this.config.storage!.getDistinctCountriesInWindow(
			userId,
			windowMs,
		);

		if (countries.length >= 2) {
			return {
				type: "multiple_countries",
				severity: "high",
				userId,
				ip: "",
				timestamp: Date.now(),
				userAgent: "",
				details: { countries, window: `${windowMs / 60000}min` },
			};
		}
		return null;
	}

	private async checkImpossibleTravel(
		userId: string,
		currentIp: string,
		currentTimestamp: number,
	): Promise<AnomalyEvent | null> {
		if (!this.config.checkImpossibleTravel) return null;

		const maxKmh = this.config.impossibleTravelKmh ?? 800;
		const records = await this.config.storage!.getRecentRecords(userId, 1);
		if (records.length === 0) return null;

		const last = records[0]!;
		if (last.ip === currentIp) return null;

		const timeDiffHours = (currentTimestamp - last.timestamp) / 3600000;
		if (timeDiffHours <= 0) return null;

		const distanceKm = await this.estimateDistance(last.ip, currentIp);
		const speedKmh = distanceKm / timeDiffHours;

		if (speedKmh > maxKmh) {
			return {
				type: "impossible_travel",
				severity: "critical",
				userId,
				ip: currentIp,
				timestamp: currentTimestamp,
				userAgent: "",
				details: {
					fromIP: last.ip,
					fromTime: last.timestamp,
					speedKmh: Math.round(speedKmh),
					distanceKm: Math.round(distanceKm),
				},
			};
		}
		return null;
	}

	private async checkCredentialStuffing(
		userId: string,
	): Promise<AnomalyEvent | null> {
		if (!this.config.checkCredentialStuffing) return null;

		const threshold = this.config.credentialStuffingThreshold ?? 20;
		const windowMs = 300000;
		const records = await this.config.storage!.getRecordsInTimeRange(
			userId,
			Date.now() - windowMs,
			Date.now(),
		);

		const failedAttempts = records.filter(
			(r: LoginRecord) => !r.success,
		).length;
		if (failedAttempts >= threshold) {
			return {
				type: "credential_stuffing",
				severity: "high",
				userId,
				ip: "",
				timestamp: Date.now(),
				userAgent: "",
				details: { failedAttempts, windowMs },
			};
		}
		return null;
	}

	private async checkTorUsage(ip: string): Promise<AnomalyEvent | null> {
		if (!this.config.checkTorUsage) return null;

		const isTor = await this.isTorExitNode(ip);
		if (isTor) {
			return {
				type: "tor_usage",
				severity: "medium",
				userId: "",
				ip,
				timestamp: Date.now(),
				userAgent: "",
				details: { torNode: true },
			};
		}
		return null;
	}

	private async handleAnomalies(events: AnomalyEvent[]): Promise<void> {
		if (events.length === 0) return;

		const severityOrder: Record<AnomalySeverity, number> = {
			low: 1,
			medium: 2,
			high: 3,
			critical: 4,
		};

		const highestSeverity = events.reduce((max, e) => {
			return severityOrder[e.severity] > severityOrder[max.severity] ? e : max;
		}, events[0]!);

		if (!highestSeverity) return;

		const action = this.config.onAnomaly ?? this.config.defaultAction ?? "log";

		if (this.config.onAnomalyDetected) {
			for (const event of events) {
				await this.config.onAnomalyDetected(event);
			}
		}

		if (action === "block") {
			throw new LoginAnomalyError(
				`Suspicious login activity detected: ${highestSeverity.severity}: ${highestSeverity.type} for user ${highestSeverity.userId}`,
				{ cause: new Error(JSON.stringify(highestSeverity)) },
			);
		}
	}

	private extractIP(request: Request): Promise<string> {
		return getRequestIP(request);
	}

	private async sha256(text: string): Promise<string> {
		const encoder = new TextEncoder();
		const data = encoder.encode(text);
		const hashBuffer = await crypto.subtle.digest("SHA-256", data);
		const hashArray = Array.from(new Uint8Array(hashBuffer));
		return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
	}

	private async estimateDistance(ip1: string, ip2: string): Promise<number> {
		const [coord1, coord2] = await Promise.all([
			this.resolveCoordinates(ip1),
			this.resolveCoordinates(ip2),
		]);

		if (!coord1 || !coord2) return 0;

		return haversineDistanceKm(
			coord1.latitude,
			coord1.longitude,
			coord2.latitude,
			coord2.longitude,
		);
	}

	private async resolveCoordinates(
		ip: string,
	): Promise<{ latitude: number; longitude: number } | null> {
		const provider = this.config.geolocation;
		if (provider) {
			const coords = await provider.resolve(ip);
			if (coords) return coords;
		}
		return deterministicCoordinates(ip);
	}

	private async isTorExitNode(ip: string): Promise<boolean> {
		const provider = this.config.torExitProvider;
		if (!provider) return false;
		return provider.isExitNode(ip);
	}
}

function deterministicCoordinates(ip: string): {
	latitude: number;
	longitude: number;
} {
	let hash = 2166136261;
	for (let i = 0; i < ip.length; i++) {
		hash ^= ip.charCodeAt(i);
		hash = Math.imul(hash, 16777619);
	}
	const latitude = ((hash >>> 16) % 180) - 90;
	const longitude = ((hash >>> 0) % 360) - 180;
	return { latitude, longitude };
}

function haversineDistanceKm(
	lat1: number,
	lon1: number,
	lat2: number,
	lon2: number,
): number {
	const EARTH_RADIUS_KM = 6371;
	const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
	const dLat = toRadians(lat2 - lat1);
	const dLon = toRadians(lon2 - lon1);
	const a =
		Math.sin(dLat / 2) * Math.sin(dLat / 2) +
		Math.cos(toRadians(lat1)) *
			Math.cos(toRadians(lat2)) *
			Math.sin(dLon / 2) *
			Math.sin(dLon / 2);
	const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
	return EARTH_RADIUS_KM * c;
}
