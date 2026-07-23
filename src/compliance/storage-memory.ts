import type {
  DataExportStorage,
  DataExportRequest,
  UserDataExport,
  DeletionStorage,
  DataDeletionRequest,
  ConsentStorage,
  ConsentRecord,
  RetentionStorage,
} from "../utils/compliance";

export class MemoryDataExportStorage implements DataExportStorage {
  private store = new Map<string, DataExportRequest>();

  async saveRequest(request: DataExportRequest): Promise<void> {
    this.store.set(request.userId, request);
  }

  async getRequest(requestId: string): Promise<DataExportRequest | null> {
    for (const request of this.store.values()) {
      if (request.userId === requestId || requestId === request.userId) {
        return request;
      }
    }
    return null;
  }

  async getPendingRequest(userId: string): Promise<DataExportRequest | null> {
    const request = this.store.get(userId);
    if (request && request.status === "pending") {
      return request;
    }
    return null;
  }

  async updateStatus(
    requestId: string,
    status: DataExportRequest["status"],
  ): Promise<void> {
    const request = await this.getRequest(requestId);
    if (request) {
      request.status = status;
      this.store.set(request.userId, request);
    }
  }

  async setExportData(requestId: string, data: UserDataExport): Promise<void> {
    const request = await this.getRequest(requestId);
    if (request) {
      request.exportData = data;
      this.store.set(request.userId, request);
    }
  }

  async deleteRequest(requestId: string): Promise<void> {
    const request = await this.getRequest(requestId);
    if (request) {
      this.store.delete(request.userId);
    }
  }
}

export class MemoryDeletionStorage implements DeletionStorage {
  private store = new Map<string, DataDeletionRequest>();

  async saveRequest(request: DataDeletionRequest): Promise<void> {
    this.store.set(request.id, request);
  }

  async getRequest(requestId: string): Promise<DataDeletionRequest | null> {
    return this.store.get(requestId) ?? null;
  }

  async updateStatus(
    requestId: string,
    status: DataDeletionRequest["status"],
  ): Promise<void> {
    const request = this.store.get(requestId);
    if (request) {
      request.status = status;
      this.store.set(requestId, request);
    }
  }

  async setCompletedAt(requestId: string, completedAt: number): Promise<void> {
    const request = this.store.get(requestId);
    if (request) {
      request.completedAt = completedAt;
      this.store.set(requestId, request);
    }
  }

  async cancelRequest(requestId: string): Promise<void> {
    const request = this.store.get(requestId);
    if (request) {
      request.status = "cancelled";
      this.store.set(requestId, request);
    }
  }
}

export class MemoryConsentStorage implements ConsentStorage {
  private store = new Map<string, ConsentRecord[]>();
  private history = new Map<string, ConsentRecord[]>();

  async getConsents(userId: string): Promise<ConsentRecord[]> {
    return this.store.get(userId) ?? [];
  }

  async setConsent(consent: ConsentRecord): Promise<void> {
    const userConsents = this.store.get(consent.userId) ?? [];
    const existingIndex = userConsents.findIndex(
      (c) => c.consentType === consent.consentType,
    );

    if (existingIndex >= 0) {
      const old = userConsents[existingIndex];
      if (old.granted && !consent.granted) {
        old.withdrawnAt = new Date();
        const historyList = this.history.get(consent.userId) ?? [];
        historyList.push(old);
        this.history.set(consent.userId, historyList);
      }
      userConsents[existingIndex] = consent;
    } else {
      userConsents.push(consent);
    }

    this.store.set(consent.userId, userConsents);
  }

  async withdrawConsent(userId: string, consentType: string): Promise<void> {
    const userConsents = this.store.get(userId) ?? [];
    const consent = userConsents.find((c) => c.consentType === consentType);

    if (consent) {
      consent.granted = false;
      consent.withdrawnAt = new Date();

      const historyList = this.history.get(userId) ?? [];
      historyList.push({ ...consent });
      this.history.set(userId, historyList);
    }

    this.store.set(userId, userConsents);
  }

  async getConsentHistory(userId: string): Promise<ConsentRecord[]> {
    return this.history.get(userId) ?? [];
  }
}

export class MemoryRetentionStorage implements RetentionStorage {
  private userData = new Map<string, { categories: string[]; lastActive: number }>();

  async getDataCategories(userId: string): Promise<string[]> {
    const data = this.userData.get(userId);
    return data?.categories ?? [];
  }

  async deleteData(userId: string, categories: string[]): Promise<void> {
    const data = this.userData.get(userId);
    if (data) {
      data.categories = data.categories.filter((c) => !categories.includes(c));
      if (data.categories.length === 0) {
        this.userData.delete(userId);
      }
    }
  }

  async anonymizeData(userId: string, categories: string[]): Promise<void> {
    await this.deleteData(userId, categories);
  }

  async archiveData(userId: string, categories: string[]): Promise<void> {
    await this.deleteData(userId, categories);
  }

  async getUsersWithDataOlderThan(days: number): Promise<string[]> {
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
    const users: string[] = [];

    for (const [userId, data] of this.userData.entries()) {
      if (data.lastActive < cutoff && data.categories.length > 0) {
        users.push(userId);
      }
    }

    return users;
  }

  async setUserData(
    userId: string,
    categories: string[],
    lastActive?: number,
  ): Promise<void> {
    this.userData.set(userId, {
      categories,
      lastActive: lastActive ?? Date.now(),
    });
  }
}

export function createMemoryComplianceStorage() {
  return {
    exportStorage: new MemoryDataExportStorage(),
    deletionStorage: new MemoryDeletionStorage(),
    consentStorage: new MemoryConsentStorage(),
    retentionStorage: new MemoryRetentionStorage(),
  };
}
