import type {
	ConsentRecord,
	ConsentStorage,
	DataDeletionRequest,
	DataExportRequest,
	DataExportStorage,
	DeletionStorage,
	RetentionStorage,
	UserDataExport,
} from "./compliance";

export function createMemoryComplianceStorage() {
	const exportStore = new Map<
		string,
		DataExportRequest & { exportData?: UserDataExport }
	>();
	const deletionStore = new Map<string, DataDeletionRequest>();
	const consentStore = new Map<string, ConsentRecord[]>();
	const consentHistoryStore = new Map<string, ConsentRecord[]>();
	const retentionData = new Map<
		string,
		{ categories: string[]; lastActiveAt: number }
	>();

	const exportStorage: DataExportStorage = {
		async saveRequest(requestId, request) {
			exportStore.set(requestId, { ...request });
		},
		async getRequest(requestId) {
			const req = exportStore.get(requestId);
			if (!req) return null;
			return { ...req };
		},
		async getPendingRequest(userId) {
			for (const req of exportStore.values()) {
				if (req.userId === userId && req.status === "pending") {
					const now = Date.now();
					if (now < req.expiresAt) {
						return { ...req };
					}
				}
			}
			return null;
		},
		async updateStatus(requestId, status) {
			const req = exportStore.get(requestId);
			if (req) {
				req.status = status;
				if (status === "completed") {
					req.completedAt = Date.now();
				}
			}
		},
		async setExportData(requestId, data) {
			const req = exportStore.get(requestId);
			if (req) {
				req.exportData = data;
			}
		},
		async deleteRequest(requestId) {
			exportStore.delete(requestId);
		},
	};

	const deletionStorage: DeletionStorage = {
		async saveRequest(request) {
			deletionStore.set(request.id, { ...request });
		},
		async getRequest(requestId) {
			const req = deletionStore.get(requestId);
			if (!req) return null;
			return { ...req };
		},
		async getPendingRequestByUserId(userId) {
			for (const req of deletionStore.values()) {
				if (
					req.userId === userId &&
					(req.status === "pending" ||
						req.status === "scheduled" ||
						req.status === "processing")
				) {
					return { ...req };
				}
			}
			return null;
		},
		async updateStatus(requestId, status) {
			const req = deletionStore.get(requestId);
			if (req) {
				req.status = status;
				if (status === "completed") {
					req.completedAt = Date.now();
				}
			}
		},
		async setCompletedAt(requestId, completedAt) {
			const req = deletionStore.get(requestId);
			if (req) {
				req.completedAt = completedAt;
			}
		},
		async cancelRequest(requestId) {
			const req = deletionStore.get(requestId);
			if (req) {
				req.status = "cancelled";
			}
		},
	};

	const consentStorage: ConsentStorage = {
		async getConsents(userId) {
			return consentStore.get(userId) ?? [];
		},
		async setConsent(consent) {
			const existing = consentStore.get(consent.userId) ?? [];
			const history = consentHistoryStore.get(consent.userId) ?? [];
			const idx = existing.findIndex(
				(c) => c.consentType === consent.consentType,
			);
			if (idx >= 0) {
				const previous = existing[idx]!;
				if (previous.granted && !previous.withdrawnAt) {
					history.push({ ...previous, withdrawnAt: new Date() });
				}
				existing[idx] = consent;
			} else {
				existing.push(consent);
			}
			consentStore.set(consent.userId, existing);
			consentHistoryStore.set(consent.userId, history);
		},
		async withdrawConsent(userId, consentType) {
			const existing = consentStore.get(userId) ?? [];
			const history = consentHistoryStore.get(userId) ?? [];
			const idx = existing.findIndex((c) => c.consentType === consentType);
			if (idx >= 0) {
				const current = existing[idx]!;
				const updated: ConsentRecord = {
					userId: current.userId,
					consentType: current.consentType,
					granted: false,
					grantedAt: current.grantedAt,
					version: current.version,
					withdrawnAt: new Date(),
					metadata: current.metadata,
				};
				existing[idx] = updated;
				consentStore.set(userId, existing);
				consentHistoryStore.set(userId, [...history, updated]);
			}
		},
		async getConsentHistory(userId) {
			return consentHistoryStore.get(userId) ?? [];
		},
	};

	const retentionStorage: RetentionStorage = {
		async getDataCategories(userId) {
			return retentionData.get(userId)?.categories ?? [];
		},
		async deleteData(userId, categories) {
			const data = retentionData.get(userId);
			if (data) {
				data.categories = data.categories.filter(
					(c) => !categories.includes(c),
				);
				retentionData.set(userId, data);
			}
		},
		async anonymizeData(userId, _categories) {
			const data = retentionData.get(userId);
			if (data) {
				retentionData.set(userId, data);
			}
		},
		async archiveData(userId, _categories) {
			const data = retentionData.get(userId);
			if (data) {
				retentionData.set(userId, data);
			}
		},
		async getUsersWithDataOlderThan(days) {
			const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
			const users: string[] = [];
			for (const [userId, data] of retentionData.entries()) {
				if (data.lastActiveAt < cutoff) {
					users.push(userId);
				}
			}
			return users;
		},
	};

	return {
		exportStorage,
		deletionStorage,
		consentStorage,
		retentionStorage: {
			...retentionStorage,
			setUserData: async (
				userId: string,
				categories: string[],
				lastActiveAt: number,
			) => {
				retentionData.set(userId, { categories, lastActiveAt });
			},
		} as RetentionStorage & {
			setUserData: (
				userId: string,
				categories: string[],
				lastActiveAt: number,
			) => Promise<void>;
		},
	};
}
