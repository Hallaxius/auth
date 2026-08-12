import type {
	ConsentRecord,
	ConsentStorage,
	DataExportStorage,
	DeletionStorage,
	UserDataExport,
} from "../utils/compliance";
import { createSecurityLogger } from "../utils/logger";

const logger = createSecurityLogger("compliance");

function logError(message: string, error: unknown): void {
	logger.error(message, {
		error: error instanceof Error ? error.message : String(error),
	});
}

interface RequestLike {
	user?: { id: string; email: string };
	params: Record<string, string>;
	body: Record<string, unknown>;
}

interface ResponseLike {
	status(code: number): ResponseLike;
	json(data: unknown): ResponseLike;
	setHeader(name: string, value: string): ResponseLike;
}

export interface ComplianceHandlersConfig {
	exportStorage: DataExportStorage;
	deletionStorage: DeletionStorage;
	consentStorage: ConsentStorage;
	userDataCollector: (userId: string) => Promise<UserDataExport>;
	userDataDeleter: (userId: string) => Promise<void>;
	secret: string;
}

export function createComplianceHandlers(config: ComplianceHandlersConfig) {
	const { exportStorage, deletionStorage, userDataCollector, userDataDeleter } =
		config;

	return {
		handleExportRequest,
		handleExportDownload,
		handleDeletionRequest,
		handleDeletionConfirm,
		handleDeletionCancel,
		handleConsentGrant,
		handleConsentWithdraw,
		handleConsentList,
	};

	async function handleExportRequest(
		req: RequestLike,
		res: ResponseLike,
	): Promise<void> {
		try {
			const userId = req.user?.id;
			const email = req.user?.email;

			if (!userId || !email) {
				res.status(401).json({ error: "Unauthorized" });
				return;
			}

			const existingRequest = await exportStorage.getPendingRequest(userId);
			if (existingRequest && Date.now() < existingRequest.expiresAt) {
				res.status(429).json({
					error: "Export request already pending",
					retryAfter: existingRequest.expiresAt - Date.now(),
				});
				return;
			}

			const requestId = crypto.randomUUID();
			const request = {
				userId,
				email,
				requestedAt: Date.now(),
				status: "pending" as const,
				expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000,
			};

			await exportStorage.saveRequest(requestId, request);

			queueExportProcessing(requestId, userDataCollector, exportStorage).catch(
				(err) => logError("Export processing failed", err),
			);

			res.status(202).json({
				message: "Export request accepted",
				requestId,
				estimatedCompletionTime: Date.now() + 5 * 60 * 1000,
				expiresAt: request.expiresAt,
			});
		} catch (error) {
			logError("Export request error", error);
			res.status(500).json({ error: "Failed to process export request" });
		}
	}

	async function handleExportDownload(
		req: RequestLike,
		res: ResponseLike,
	): Promise<void> {
		try {
			const requestId = req.params.requestId;

			if (!requestId) {
				res.status(400).json({ error: "Missing requestId" });
				return;
			}

			const request = await exportStorage.getRequest(requestId);
			if (!request) {
				res.status(404).json({ error: "Export request not found" });
				return;
			}

			if (request.status !== "completed") {
				res.status(400).json({
					error: "Export not ready",
					status: request.status,
				});
				return;
			}

			if (Date.now() > request.expiresAt) {
				await exportStorage.deleteRequest(requestId);
				res.status(410).json({ error: "Export expired" });
				return;
			}

			res.setHeader("Content-Type", "application/json");
			res.setHeader(
				"Content-Disposition",
				`attachment; filename="data-export-${request.userId}.json"`,
			);
			res.json(request.exportData);
		} catch (error) {
			logError("Export download error", error);
			res.status(500).json({ error: "Failed to download export" });
		}
	}

	async function handleDeletionRequest(
		req: RequestLike,
		res: ResponseLike,
	): Promise<void> {
		try {
			const userId = req.user?.id;
			const email = req.user?.email;
			const { reason } = req.body as { reason?: string };

			if (!userId || !email) {
				res.status(401).json({ error: "Unauthorized" });
				return;
			}

			const requestId = crypto.randomUUID();
			const confirmationCode = crypto
				.getRandomValues(new Uint8Array(8))
				.reduce((str, byte) => str + byte.toString(16).padStart(2, "0"), "");

			const request = {
				id: requestId,
				userId,
				email,
				requestedAt: Date.now(),
				status: "pending" as const,
				reason,
				confirmationCode,
				scheduledFor: Date.now() + 30 * 24 * 60 * 60 * 1000,
			};

			await deletionStorage.saveRequest(request);

			res.status(202).json({
				message:
					"Deletion request created. Please confirm with the code sent to your email.",
				requestId,
				confirmationRequired: true,
			});
		} catch (error) {
			logError("Deletion request error", error);
			res.status(500).json({ error: "Failed to process deletion request" });
		}
	}

	async function handleDeletionConfirm(
		req: RequestLike,
		res: ResponseLike,
	): Promise<void> {
		try {
			const { requestId, confirmationCode } = req.body as {
				requestId: string;
				confirmationCode: string;
			};

			const request = await deletionStorage.getRequest(requestId);
			if (!request || request.confirmationCode !== confirmationCode) {
				res.status(400).json({ error: "Invalid confirmation code" });
				return;
			}

			await deletionStorage.updateStatus(requestId, "scheduled");

			queueDeletionProcessing(
				requestId,
				userDataDeleter,
				deletionStorage,
			).catch((err) => logError("Deletion processing failed", err));

			res.status(200).json({
				message:
					"Deletion confirmed. Your data will be deleted within 30 days.",
				scheduledFor: request.scheduledFor,
			});
		} catch (error) {
			logError("Deletion confirm error", error);
			res.status(500).json({ error: "Failed to confirm deletion" });
		}
	}

	async function handleDeletionCancel(
		req: RequestLike,
		res: ResponseLike,
	): Promise<void> {
		try {
			const { requestId } = req.body as { requestId: string };

			const request = await deletionStorage.getRequest(requestId);
			if (!request || request.status === "completed") {
				res.status(400).json({ error: "Cannot cancel deletion request" });
				return;
			}

			await deletionStorage.updateStatus(requestId, "cancelled");

			res.status(200).json({
				message: "Deletion request cancelled",
			});
		} catch (error) {
			logError("Deletion cancel error", error);
			res.status(500).json({ error: "Failed to cancel deletion" });
		}
	}

	async function handleConsentGrant(
		req: RequestLike,
		res: ResponseLike,
	): Promise<void> {
		try {
			const userId = req.user?.id;
			const { consentType, version, metadata } = req.body as {
				consentType: string;
				version: string;
				metadata?: Record<string, unknown>;
			};

			if (!userId) {
				res.status(401).json({ error: "Unauthorized" });
				return;
			}

			if (!consentType || !version) {
				res.status(400).json({ error: "consentType and version are required" });
				return;
			}

			const consent = {
				userId,
				consentType,
				granted: true,
				grantedAt: new Date(),
				version,
				metadata,
			};

			await config.consentStorage.setConsent(consent);

			res.status(200).json({
				message: "Consent granted",
				consentType,
				version,
			});
		} catch (error) {
			logError("Consent grant error", error);
			res.status(500).json({ error: "Failed to grant consent" });
		}
	}

	async function handleConsentWithdraw(
		req: RequestLike,
		res: ResponseLike,
	): Promise<void> {
		try {
			const userId = req.user?.id;
			const { consentType } = req.body as { consentType: string };

			if (!userId) {
				res.status(401).json({ error: "Unauthorized" });
				return;
			}

			if (!consentType) {
				res.status(400).json({ error: "consentType is required" });
				return;
			}

			await config.consentStorage.withdrawConsent(userId, consentType);

			res.status(200).json({
				message: "Consent withdrawn",
				consentType,
			});
		} catch (error) {
			logError("Consent withdraw error", error);
			res.status(500).json({ error: "Failed to withdraw consent" });
		}
	}

	async function handleConsentList(
		req: RequestLike,
		res: ResponseLike,
	): Promise<void> {
		try {
			const userId = req.user?.id;

			if (!userId) {
				res.status(401).json({ error: "Unauthorized" });
				return;
			}

			const consents = await config.consentStorage.getConsents(userId);

			res.status(200).json({
				consents: consents.map((c: ConsentRecord) => ({
					consentType: c.consentType,
					granted: c.granted,
					grantedAt: c.grantedAt,
					withdrawnAt: c.withdrawnAt,
					version: c.version,
				})),
			});
		} catch (error) {
			logError("Consent list error", error);
			res.status(500).json({ error: "Failed to list consents" });
		}
	}
}

async function queueExportProcessing(
	requestId: string,
	collector: (userId: string) => Promise<UserDataExport>,
	storage: DataExportStorage,
): Promise<void> {
	try {
		await storage.updateStatus(requestId, "processing");
		const request = await storage.getRequest(requestId);
		if (!request) return;

		const exportData = await collector(request.userId);

		await storage.updateStatus(requestId, "completed");
		await storage.setExportData(requestId, exportData);
	} catch (error) {
		logError("Export processing error", error);
		await storage.updateStatus(requestId, "failed");
	}
}

async function queueDeletionProcessing(
	requestId: string,
	deleter: (userId: string) => Promise<void>,
	storage: DeletionStorage,
): Promise<void> {
	try {
		const request = await storage.getRequest(requestId);
		if (request?.status !== "scheduled") return;

		if (request.scheduledFor && Date.now() < request.scheduledFor) {
			const delay = request.scheduledFor - Date.now();
			await new Promise((resolve) => setTimeout(resolve, delay));
		}

		await storage.updateStatus(requestId, "processing");
		await deleter(request.userId);
		await storage.updateStatus(requestId, "completed");
		await storage.setCompletedAt(requestId, Date.now());
	} catch (error) {
		logError("Deletion processing error", error);
		await storage.updateStatus(requestId, "failed");
	}
}
