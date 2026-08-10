import { describe, expect, it, mock, spyOn, jest } from "bun:test"
import {
	AnomalyDetector,
	type GeolocationProvider,
	LoginAnomalyError,
	type TorExitProvider,
} from "../../../src/security/anomaly-detector"
import type { LoginHistoryStore, LoginRecord } from "../../../src/types"

class MemoryLoginStore implements LoginHistoryStore {
	public records: LoginRecord[] = []

	async addRecord(record: LoginRecord): Promise<void> {
		this.records.push(record)
	}

	async getRecentIPs(userId: string): Promise<string[]> {
		return [
			...new Set(
				this.records
					.filter((r) => r.userId === userId)
					.map((r) => r.ip),
			),
		]
	}

	async getRecentUserAgents(userId: string): Promise<string[]> {
		return [
			...new Set(
				this.records
					.filter((r) => r.userId === userId)
					.map((r) => r.userAgent),
			),
		]
	}

	async getDistinctCountriesInWindow(
		_userId: string,
		_windowMs: number,
	): Promise<string[]> {
		return []
	}

	async getRecentRecords(
		userId: string,
		limit = 50,
	): Promise<LoginRecord[]> {
		return this.records
			.filter((r) => r.userId === userId)
			.sort((a, b) => b.timestamp - a.timestamp)
			.slice(0, limit)
	}

	async getRecordsInTimeRange(
		userId: string,
		startMs: number,
		endMs: number,
	): Promise<LoginRecord[]> {
		return this.records.filter(
			(r) =>
				r.userId === userId &&
				r.timestamp >= startMs &&
				r.timestamp <= endMs,
		)
	}
}

function requestWithIP(ip: string, userAgent = "test-agent"): Request {
	const request = new Request("http://localhost/login", {
		headers: { "user-agent": userAgent },
	})
	const withSocket = request as unknown as {
		socket?: { remoteAddress?: string }
	}
	withSocket.socket = { remoteAddress: ip }
	return request
}

function geolocationProvider(
	coords: Record<string, { latitude: number; longitude: number }>,
): GeolocationProvider {
	return {
		async resolve(ip: string) {
			return coords[ip] ?? null
		},
	}
}

function torExitProvider(torIPs: string[]): TorExitProvider {
	return {
		async isExitNode(ip: string) {
			return torIPs.includes(ip)
		},
	}
}

const baseConfig = {
	enabled: true,
	checkNewLocation: false,
	checkNewDevice: false,
	checkUnusualHour: false,
	checkMultipleCountries: false,
	checkCredentialStuffing: false,
	checkTorUsage: false,
	checkImpossibleTravel: true,
}

const FROM_IP = "203.0.113.10"
const TO_IP = "198.51.100.20"

function previousRecord(ip: string, userId = "user-1"): LoginRecord {
	return {
		userId,
		ip,
		userAgent: "previous-agent",
		timestamp: Date.now() - 60_000,
		success: true,
		hour: 12,
	}
}

describe("AnomalyDetector impossible travel", () => {
	it("emits impossible_travel when provider maps both IPs and speed exceeds threshold", async () => {
		const store = new MemoryLoginStore()
		store.records.push(previousRecord(FROM_IP))

		const detector = new AnomalyDetector({
			...baseConfig,
			impossibleTravelKmh: 800,
			storage: store,
			geolocation: geolocationProvider({
				[FROM_IP]: { latitude: 0, longitude: 0 },
				[TO_IP]: { latitude: 0, longitude: 1 },
			}),
		})

		const events = await detector.analyze(
			requestWithIP(TO_IP),
			"user-1",
			true,
		)

		const travel = events.find((e) => e.type === "impossible_travel")
		expect(travel).toBeDefined()
		const details = travel?.details ?? {}
		expect(details.distanceKm as number).toBeGreaterThan(0)
		expect(details.speedKmh as number).toBeGreaterThan(800)
	})

	it("does not emit impossible_travel when speed is below threshold", async () => {
		const store = new MemoryLoginStore()
		store.records.push(previousRecord(FROM_IP))

		const detector = new AnomalyDetector({
			...baseConfig,
			impossibleTravelKmh: 800,
			storage: store,
			geolocation: geolocationProvider({
				[FROM_IP]: { latitude: 0, longitude: 0 },
				[TO_IP]: { latitude: 0, longitude: 0 },
			}),
		})

		const events = await detector.analyze(
			requestWithIP(TO_IP),
			"user-1",
			true,
		)

		expect(events.find((e) => e.type === "impossible_travel")).toBeUndefined()
	})

	it("resolves without a provider (deterministic fallback, no crash)", async () => {
		const store = new MemoryLoginStore()
		store.records.push(previousRecord(FROM_IP))

		const detector = new AnomalyDetector({
			...baseConfig,
			impossibleTravelKmh: 1_000_000_000,
			storage: store,
		})

		const events = await detector.analyze(
			requestWithIP(TO_IP),
			"user-1",
			true,
		)

		expect(events.find((e) => e.type === "impossible_travel")).toBeUndefined()
		expect(store.records).toHaveLength(2)
	})
})

describe("AnomalyDetector checkTorUsage", () => {
	it("emits tor_usage when the provider flags the IP", async () => {
		const store = new MemoryLoginStore()
		const detector = new AnomalyDetector({
			...baseConfig,
			checkImpossibleTravel: false,
			checkTorUsage: true,
			storage: store,
			torExitProvider: torExitProvider([TO_IP]),
		})

		const events = await detector.analyze(
			requestWithIP(TO_IP),
			"user-1",
			false,
		)

		expect(events.find((e) => e.type === "tor_usage")).toBeDefined()
	})

	it("returns no tor_usage and does not crash without a provider", async () => {
		const store = new MemoryLoginStore()
		const detector = new AnomalyDetector({
			...baseConfig,
			checkImpossibleTravel: false,
			checkTorUsage: true,
			storage: store,
		})

		const events = await detector.analyze(
			requestWithIP(TO_IP),
			"user-1",
			false,
		)

		expect(events.find((e) => e.type === "tor_usage")).toBeUndefined()
	})
})

describe("AnomalyDetector onAnomaly actions", () => {
	it("rejects with LoginAnomalyError when onAnomaly is block", async () => {
		const store = new MemoryLoginStore()
		const detector = new AnomalyDetector({
			...baseConfig,
			checkImpossibleTravel: false,
			checkTorUsage: true,
			onAnomaly: "block",
			storage: store,
			torExitProvider: torExitProvider([TO_IP]),
		})

		await expect(
			detector.analyze(requestWithIP(TO_IP), "user-1", false),
		).rejects.toBeInstanceOf(LoginAnomalyError)
	})

	it("does not persist the record when block throws", async () => {
		const store = new MemoryLoginStore()
		const detector = new AnomalyDetector({
			...baseConfig,
			checkImpossibleTravel: false,
			checkTorUsage: true,
			onAnomaly: "block",
			storage: store,
			torExitProvider: torExitProvider([TO_IP]),
		})

		await expect(
			detector.analyze(requestWithIP(TO_IP), "user-1", false),
		).rejects.toBeInstanceOf(LoginAnomalyError)

		expect(store.records).toHaveLength(0)
	})

	it("resolves and does not call console.warn when onAnomaly is log", async () => {
		const warn = spyOn(console, "warn").mockImplementation(() => {})
		try {
			const detector = new AnomalyDetector({
				...baseConfig,
				checkImpossibleTravel: false,
				checkTorUsage: true,
				onAnomaly: "log",
				storage: new MemoryLoginStore(),
				torExitProvider: torExitProvider([TO_IP]),
			})

			const events = await detector.analyze(
				requestWithIP(TO_IP),
				"user-1",
				false,
			)

			expect(events.find((e) => e.type === "tor_usage")).toBeDefined()
			expect(warn).not.toHaveBeenCalled()
		} finally {
			warn.mockRestore()
		}
	})

	it("persists the record on success", async () => {
		const store = new MemoryLoginStore()
		const detector = new AnomalyDetector({
			...baseConfig,
			checkImpossibleTravel: false,
			storage: store,
		})

		const events = await detector.analyze(
			requestWithIP(TO_IP),
			"user-1",
			true,
		)

		expect(events).toHaveLength(0)
		expect(store.records).toHaveLength(1)
		expect(store.records[0]?.ip).toBe(TO_IP)
	})
})
