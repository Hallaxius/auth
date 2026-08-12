import { describe, expect, test } from "bun:test";
import {
	AnomalyDetector,
	createComplianceHandlers,
	createMemoryComplianceStorage,
	credentials,
	LoginAnomalyError,
	MemoryTokenRevocationStorage,
	type ComplianceHandlersConfig,
	type ConsentStorage,
	type DataExportStorage,
	type DeletionStorage,
	type IAuthUserStore,
	type IBruteForceStore,
	type IComplianceStore,
	type IMfaStore,
	type IRateLimitStore,
	type IResetTokenStore,
	type IStateStore,
	type ITokenRevocationStore,
	type IUserStore,
	type LoginHistoryStore,
	type LoginRecord,
	type RetentionStorage,
	type SessionStore,
	type StorageAdapters,
	type StorageFactoryOptions,
	type GeolocationProvider,
	type TorExitProvider,
} from "../../src/index";

describe("public surface (entry point only)", () => {
	describe("F0.1 anomaly detection exports", () => {
		test("AnomalyDetector is constructible and analyze returns events", async () => {
			const history: LoginRecord[] = [];
			const storage: LoginHistoryStore = {
				async addRecord(record) {
					history.push(record);
				},
				async getRecentIPs(userId) {
					return history
						.filter((r) => r.userId === userId)
						.map((r) => r.ip);
				},
				async getRecentUserAgents(userId) {
					return history
						.filter((r) => r.userId === userId)
						.map((r) => r.userAgent);
				},
				async getDistinctCountriesInWindow() {
					return [];
				},
				async getRecentRecords(userId) {
					return history.filter((r) => r.userId === userId);
				},
				async getRecordsInTimeRange(userId) {
					return history.filter((r) => r.userId === userId);
				},
			};

			const detector = new AnomalyDetector({
				enabled: true,
				checkNewDevice: true,
				checkNewLocation: false,
				checkUnusualHour: false,
				checkMultipleCountries: false,
				checkImpossibleTravel: false,
				checkCredentialStuffing: false,
				checkTorUsage: false,
				onAnomaly: "log",
				storage,
			});

			const request = new Request("http://localhost/login", {
				headers: { "X-Forwarded-For": "203.0.113.5" },
			});

			const events = await detector.analyze(request, "user-1", true);
			expect(Array.isArray(events)).toBe(true);
			expect(history.some((r) => r.userId === "user-1")).toBe(true);
		});

		test("LoginAnomalyError is an error with 403 status", () => {
			const error = new LoginAnomalyError();
			expect(error).toBeInstanceOf(Error);
			expect((error as { statusCode?: number }).statusCode).toBe(403);
		});

		test("GeolocationProvider and TorExitProvider are structural types", () => {
			const geolocation: GeolocationProvider = {
				async resolve(ip) {
					return ip === "203.0.113.5"
						? { latitude: 1, longitude: 2 }
						: null;
				},
			};
			const tor: TorExitProvider = {
				async isExitNode() {
					return false;
				},
			};
			expect(typeof geolocation.resolve).toBe("function");
			expect(typeof tor.isExitNode).toBe("function");
		});
	});

	describe("F0.2 compliance handler exports", () => {
		test("createComplianceHandlers exposes the full handler set", () => {
			const memory = createMemoryComplianceStorage();
			const handlers = createComplianceHandlers({
				exportStorage: memory.exportStorage,
				deletionStorage: memory.deletionStorage,
				consentStorage: memory.consentStorage,
				userDataCollector: async () =>
					({
						version: "1.0",
						exportedAt: new Date().toISOString(),
						user: {
							id: "user-1",
							email: "user@example.com",
							username: "user",
							createdAt: new Date().toISOString(),
						},
						sessions: [],
						consents: [],
					}) as never,
				userDataDeleter: async () => {},
				secret: "5K8qN2mR9pL3vX7wJ4tY6hF1dS0aG8bC2eU5iO9xM3nZ7kV4rW1qP6yT0uI8oA2",
			});

			expect(typeof handlers.handleExportRequest).toBe("function");
			expect(typeof handlers.handleExportDownload).toBe("function");
			expect(typeof handlers.handleDeletionRequest).toBe("function");
			expect(typeof handlers.handleDeletionConfirm).toBe("function");
			expect(typeof handlers.handleDeletionCancel).toBe("function");
			expect(typeof handlers.handleConsentGrant).toBe("function");
			expect(typeof handlers.handleConsentWithdraw).toBe("function");
			expect(typeof handlers.handleConsentList).toBe("function");
		});

		test("compliance handler cycle: 202 -> 400 -> 404 -> 410", async () => {
			const memory = createMemoryComplianceStorage();
			const config: ComplianceHandlersConfig = {
				exportStorage: memory.exportStorage,
				deletionStorage: memory.deletionStorage,
				consentStorage: memory.consentStorage,
				userDataCollector: async (userId) =>
					({
						version: "1.0",
						exportedAt: new Date().toISOString(),
						user: { id: userId, email: "user@example.com" },
						sessions: [],
						consents: [],
					}) as never,
				userDataDeleter: async () => {},
				secret: "5K8qN2mR9pL3vX7wJ4tY6hF1dS0aG8bC2eU5iO9xM3nZ7kV4rW1qP6yT0uI8oA2",
			};
			const handlers = createComplianceHandlers(config);

			const makeRes = () => {
				const captured: { status?: number; body?: unknown } = {};
				return {
					status(code: number) {
						captured.status = code;
						return this;
					},
					json(data: unknown) {
						captured.body = data;
						return this;
					},
					setHeader() {
						return this;
					},
					get statusCode() {
						return captured.status;
					},
					get body() {
						return captured.body;
					},
				};
			};

			const user = { id: "user-1", email: "user@example.com" };

			const accepted = makeRes();
			await handlers.handleExportRequest({ user, params: {}, body: {} }, accepted);
			expect(accepted.statusCode).toBe(202);
			const requestId = (accepted.body as { requestId: string }).requestId;

			const notReady = makeRes();
			await handlers.handleExportDownload(
				{ user, params: { requestId }, body: {} },
				notReady,
			);
			expect(notReady.statusCode).toBe(400);

			const missing = makeRes();
			await handlers.handleExportDownload(
				{ user, params: { requestId: "ghost" }, body: {} },
				missing,
			);
			expect(missing.statusCode).toBe(404);

			const exported = memory.exportStorage as DataExportStorage;
			const saved = await exported.getRequest(requestId);
			if (saved) {
				saved.expiresAt = Date.now() - 1000;
				saved.status = "completed";
				await exported.saveRequest(requestId, saved);
			}

			const expired = makeRes();
			await handlers.handleExportDownload(
				{ user, params: { requestId }, body: {} },
				expired,
			);
			expect(expired.statusCode).toBe(410);
		});
	});

	describe("F0.3 storage/type exports", () => {
		test("storage interfaces are exported as types", () => {
			const adapters: StorageAdapters = {
				bruteForce: {} as IBruteForceStore,
				rateLimit: {} as IRateLimitStore,
				state: {} as IStateStore,
				tokenRevocation: {} as ITokenRevocationStore,
				mfa: {} as IMfaStore,
				authUser: {} as IAuthUserStore,
				user: {} as IUserStore,
				resetToken: {} as IResetTokenStore,
				compliance: {} as IComplianceStore,
				session: {} as SessionStore,
			};
			expect(adapters).toBeDefined();
		});

		test("compliance storage types are exported", () => {
			const consent: ConsentStorage = {} as never;
			const exportStorage: DataExportStorage = {} as never;
			const deletion: DeletionStorage = {} as never;
			const retention: RetentionStorage = {} as never;
			expect(consent).toBeDefined();
			expect(exportStorage).toBeDefined();
			expect(deletion).toBeDefined();
			expect(retention).toBeDefined();
		});

		test("StorageFactoryOptions is exported", () => {
			const options: StorageFactoryOptions = {
				type: "memory",
				keyPrefix: "auth",
			};
			expect(options).toBeDefined();
		});
	});

	describe("login -> revocation cycle with AnomalyDetector", () => {
		test("session token is revoked after logout", async () => {
			const memory = createMemoryComplianceStorage();
			const revocation = new MemoryTokenRevocationStorage();
			let createdUser:
				| {
						id: string;
						username: string | null;
						email: string | null;
						password: string;
						roles: string[];
						createdAt: number;
						updatedAt: number;
				  }
				| null = null;
			const storage = {
				create: async (data: { username: string; email: string; password: string }) => {
					createdUser = {
						id: "user_123",
						username: data.username,
						email: data.email,
						password: data.password,
						roles: ["user"],
						createdAt: Date.now(),
						updatedAt: Date.now(),
					};
					return createdUser;
				},
				findByUsername: async () => createdUser,
				findByEmail: async () => createdUser,
				findById: async () => createdUser,
				verifyPassword: async (_userId: string, password: string) =>
					password === "SecurePass123!",
			};

			const detector = new AnomalyDetector({
				enabled: true,
				checkNewDevice: true,
				checkNewLocation: false,
				checkUnusualHour: false,
				checkMultipleCountries: false,
				checkImpossibleTravel: false,
				checkCredentialStuffing: false,
				checkTorUsage: false,
				onAnomaly: "log",
				storage: {
					addRecord: async () => {},
					getRecentIPs: async () => [],
					getRecentUserAgents: async () => [],
					getDistinctCountriesInWindow: async () => [],
					getRecentRecords: async () => [],
					getRecordsInTimeRange: async () => [],
				},
			});

			const auth = credentials({
				emailRequired: true,
				usernameRequired: true,
				session: {
					secret: "5K8qN2mR9pL3vX7wJ4tY6hF1dS0aG8bC2eU5iO9xM3nZ7kV4rW1qP6yT0uI8oA2",
					expiresIn: "15m",
					cookieName: "public-surface-session",
				},
				storage: storage as never,
				sessionRevocationStorage: revocation,
				bruteForce: { enabled: false },
			});

			const loginRes = await auth.handleLogin(
				new Request("http://localhost:3000/auth/login", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						username: "user_123",
						password: "SecurePass123!",
					}),
				}),
			);
			expect(loginRes.status).toBe(401);

			const registerRes = await auth.handleRegister(
				new Request("http://localhost:3000/auth/register", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						username: "surfaceuser",
						email: "surface@example.com",
						password: "SecurePass123!",
					}),
				}),
			);
			expect(registerRes.status).toBe(201);

			const setCookie = registerRes.headers.get("Set-Cookie");
			expect(setCookie).toContain("public-surface-session=");
			const token = (setCookie as string).match(
				/public-surface-session=([^;]+)/,
			)?.[1] as string;

			const loginRequest = new Request("http://localhost:3000/auth/login", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"X-Forwarded-For": "203.0.113.9",
				},
				body: JSON.stringify({
					username: "surfaceuser",
					email: "surface@example.com",
					password: "SecurePass123!",
				}),
			});
			const loginOk = await auth.handleLogin(loginRequest);
			expect(loginOk.status).toBe(200);
			await detector.analyze(loginRequest, "user_123", true);

			const logoutRes = await auth.handleLogout(
				new Request("http://localhost:3000/auth/logout", {
					method: "POST",
					headers: { Cookie: `public-surface-session=${token}` },
				}),
			);
			expect(logoutRes.status).toBe(200);

			const meAfterRevocation = await auth.handleMe(
				new Request("http://localhost:3000/auth/me", {
					headers: { Cookie: `public-surface-session=${token}` },
				}),
			);
			expect(meAfterRevocation.status).toBe(401);
		});
	});
});
