export interface DataExportRequest {
  userId: string;
  email: string;
  requestedAt: number;
  status: "pending" | "processing" | "completed" | "failed";
  exportData?: UserDataExport;
  completedAt?: number;
  expiresAt: number;
}

export interface UserDataExport {
  version: string;
  exportedAt: string;
  user: {
    id: string;
    email: string;
    username?: string;
    createdAt?: string;
    lastLoginAt?: string;
  };
  profile?: Record<string, unknown>;
  sessions?: Array<{
    id: string;
    createdAt: string;
    expiresAt: string;
    ipAddress?: string;
    userAgent?: string;
  }>;
  auditLog?: Array<{
    timestamp: string;
    action: string;
    ipAddress?: string;
    details?: Record<string, unknown>;
  }>;
  consents?: Array<{
    type: string;
    granted: boolean;
    grantedAt: string;
    withdrawnAt?: string;
  }>;
  mfaMethods?: Array<{
    type: string;
    enabled: boolean;
    setupAt?: string;
  }>;
  dataCategories?: DataCategory[];
}

export interface DataCategory {
  name: string;
  description: string;
  items: Array<Record<string, unknown>>;
  itemCount: number;
}

export interface DataDeletionRequest {
  id: string;
  userId: string;
  email: string;
  requestedAt: number;
  status: "pending" | "scheduled" | "processing" | "completed" | "cancelled";
  scheduledFor?: number;
  completedAt?: number;
  reason?: string;
  confirmationCode?: string;
}

export interface ConsentRecord {
  userId: string;
  consentType: string;
  granted: boolean;
  grantedAt: Date;
  withdrawnAt?: Date;
  version: string;
  metadata?: Record<string, unknown>;
}

export interface ConsentConfig {
  consentTypes: Array<{
    name: string;
    description: string;
    required: boolean;
    version: string;
  }>;
  storage: ConsentStorage;
  minAge?: number;
  requireParentalConsent?: boolean;
}

export interface ConsentStorage {
  getConsents(userId: string): Promise<ConsentRecord[]>;
  setConsent(consent: ConsentRecord): Promise<void>;
  withdrawConsent(userId: string, consentType: string): Promise<void>;
  getConsentHistory(userId: string): Promise<ConsentRecord[]>;
}

export interface RetentionPolicy {
  name: string;
  description: string;
  retentionDays: number;
  dataCategories: string[];
  action: "delete" | "anonymize" | "archive";
  enabled: boolean;
}

export interface RetentionPolicyConfig {
  policies: RetentionPolicy[];
  storage: RetentionStorage;
  checkIntervalMs?: number;
}

export interface RetentionStorage {
  getDataCategories(userId: string): Promise<string[]>;
  deleteData(userId: string, categories: string[]): Promise<void>;
  anonymizeData(userId: string, categories: string[]): Promise<void>;
  archiveData(userId: string, categories: string[]): Promise<void>;
  getUsersWithDataOlderThan(days: number): Promise<string[]>;
}

export interface PrivacySettings {
  userId: string;
  dataProcessingConsent: boolean;
  marketingConsent: boolean;
  analyticsConsent: boolean;
  thirdPartySharingConsent: boolean;
  dataPortabilityEnabled: boolean;
  deletionRequested: boolean;
  updatedAt: Date;
}

export class ComplianceManager {
  private exportStorage: DataExportStorage;
  private deletionStorage: DeletionStorage;
  private consentStorage: ConsentStorage;
  private retentionStorage: RetentionStorage;
  private policies: RetentionPolicy[];

  constructor(config: {
    exportStorage: DataExportStorage;
    deletionStorage: DeletionStorage;
    consentStorage: ConsentStorage;
    retentionStorage: RetentionStorage;
    retentionPolicies?: RetentionPolicy[];
  }) {
    this.exportStorage = config.exportStorage;
    this.deletionStorage = config.deletionStorage;
    this.consentStorage = config.consentStorage;
    this.retentionStorage = config.retentionStorage;
    this.policies = config.retentionPolicies ?? [];
  }

  async requestDataExport(
    userId: string,
    email: string,
  ): Promise<{ requestId: string; expiresAt: number }> {
    const existingRequest = await this.exportStorage.getPendingRequest(userId);
    if (existingRequest) {
      const now = Date.now();
      if (now < existingRequest.expiresAt) {
        throw new Error("Export request already pending");
      }
    }

    const requestId = crypto.randomUUID();
    const request: DataExportRequest = {
      userId,
      email,
      requestedAt: Date.now(),
      status: "pending",
      expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000,
    };

    await this.exportStorage.saveRequest(request);
    return { requestId, expiresAt: request.expiresAt };
  }

  async processExport(
    requestId: string,
    dataCollector: (userId: string) => Promise<UserDataExport>,
  ): Promise<void> {
    const request = await this.exportStorage.getRequest(requestId);
    if (!request || request.status !== "pending") {
      throw new Error("Invalid or expired export request");
    }

    try {
      await this.exportStorage.updateStatus(requestId, "processing");

      const exportData = await dataCollector(request.userId);

      await this.exportStorage.updateStatus(requestId, "completed");
      await this.exportStorage.setExportData(requestId, exportData);
    } catch (error) {
      await this.exportStorage.updateStatus(requestId, "failed");
      throw error;
    }
  }

  async getExportData(requestId: string): Promise<UserDataExport | null> {
    const request = await this.exportStorage.getRequest(requestId);
    if (!request || request.status !== "completed") {
      return null;
    }

    if (Date.now() > request.expiresAt) {
      await this.exportStorage.deleteRequest(requestId);
      return null;
    }

    return request.exportData ?? null;
  }

  async requestDeletion(
    userId: string,
    email: string,
    reason?: string,
  ): Promise<{
    requestId: string;
    confirmationCode: string;
    scheduledFor: number;
  }> {
    const requestId = crypto.randomUUID();
    const confirmationCode = crypto
      .getRandomValues(new Uint8Array(8))
      .reduce((str, byte) => str + byte.toString(16).padStart(2, "0"), "");

    const request: DataDeletionRequest = {
      id: requestId,
      userId,
      email,
      requestedAt: Date.now(),
      status: "pending",
      reason,
      confirmationCode,
      scheduledFor: Date.now() + 30 * 24 * 60 * 60 * 1000,
    };

    await this.deletionStorage.saveRequest(request);
    return {
      requestId,
      confirmationCode,
      scheduledFor: request.scheduledFor!,
    };
  }

  async confirmDeletion(requestId: string, confirmationCode: string): Promise<void> {
    const request = await this.deletionStorage.getRequest(requestId);
    if (!request || request.confirmationCode !== confirmationCode) {
      throw new Error("Invalid deletion request or confirmation code");
    }

    await this.deletionStorage.updateStatus(requestId, "scheduled");
  }

  async cancelDeletion(requestId: string): Promise<void> {
    const request = await this.deletionStorage.getRequest(requestId);
    if (!request || request.status === "completed") {
      throw new Error("Cannot cancel deletion request");
    }

    await this.deletionStorage.updateStatus(requestId, "cancelled");
  }

  async processDeletion(
    requestId: string,
    deleter: (userId: string) => Promise<void>,
  ): Promise<void> {
    const request = await this.deletionStorage.getRequest(requestId);
    if (!request || request.status !== "scheduled") {
      throw new Error("Invalid or unconfirmed deletion request");
    }

    if (request.scheduledFor && Date.now() < request.scheduledFor) {
      throw new Error("Deletion not yet scheduled");
    }

    try {
      await this.deletionStorage.updateStatus(requestId, "processing");
      await deleter(request.userId);
      await this.deletionStorage.updateStatus(requestId, "completed");
      await this.deletionStorage.setCompletedAt(requestId, Date.now());
    } catch (error) {
      await this.deletionStorage.updateStatus(requestId, "failed");
      throw error;
    }
  }

  async grantConsent(
    userId: string,
    consentType: string,
    version: string,
    metadata?: Record<string, unknown>,
  ): Promise<void> {
    const consent: ConsentRecord = {
      userId,
      consentType,
      granted: true,
      grantedAt: new Date(),
      version,
      metadata,
    };

    await this.consentStorage.setConsent(consent);
  }

  async withdrawConsent(userId: string, consentType: string): Promise<void> {
    await this.consentStorage.withdrawConsent(userId, consentType);
  }

  async getConsents(userId: string): Promise<ConsentRecord[]> {
    return this.consentStorage.getConsents(userId);
  }

  async checkAgeConsent(
    userId: string,
    age: number,
    parentalEmail?: string,
  ): Promise<boolean> {
    const minAge = 16;
    if (age >= minAge) {
      return true;
    }

    if (!parentalEmail) {
      return false;
    }

    const parentalConsent = await this.consentStorage.getConsents(userId);
    return parentalConsent.some(
      (c) => c.consentType === "parental_consent" && c.granted,
    );
  }

  async enforceRetentionPolicy(): Promise<{
    processed: number;
    deleted: number;
    anonymized: number;
    archived: number;
  }> {
    const result = {
      processed: 0,
      deleted: 0,
      anonymized: 0,
      archived: 0,
    };

    for (const policy of this.policies.filter((p) => p.enabled)) {
      const users = await this.retentionStorage.getUsersWithDataOlderThan(
        policy.retentionDays,
      );

      for (const userId of users) {
        const categories = await this.retentionStorage.getDataCategories(userId);
        const applicableCategories = categories.filter((cat) =>
          policy.dataCategories.includes(cat),
        );

        if (applicableCategories.length === 0) continue;

        result.processed++;

        switch (policy.action) {
          case "delete":
            await this.retentionStorage.deleteData(userId, applicableCategories);
            result.deleted++;
            break;
          case "anonymize":
            await this.retentionStorage.anonymizeData(userId, applicableCategories);
            result.anonymized++;
            break;
          case "archive":
            await this.retentionStorage.archiveData(userId, applicableCategories);
            result.archived++;
            break;
        }
      }
    }

    return result;
  }

  getPrivacySettings(userId: string): PrivacySettings {
    return {
      userId,
      dataProcessingConsent: true,
      marketingConsent: false,
      analyticsConsent: true,
      thirdPartySharingConsent: false,
      dataPortabilityEnabled: true,
      deletionRequested: false,
      updatedAt: new Date(),
    };
  }
}

export interface DataExportStorage {
  saveRequest(request: DataExportRequest): Promise<void>;
  getRequest(requestId: string): Promise<DataExportRequest | null>;
  getPendingRequest(userId: string): Promise<DataExportRequest | null>;
  updateStatus(
    requestId: string,
    status: DataExportRequest["status"],
  ): Promise<void>;
  setExportData(requestId: string, data: UserDataExport): Promise<void>;
  deleteRequest(requestId: string): Promise<void>;
}

export interface DeletionStorage {
  saveRequest(request: DataDeletionRequest): Promise<void>;
  getRequest(requestId: string): Promise<DataDeletionRequest | null>;
  updateStatus(
    requestId: string,
    status: DataDeletionRequest["status"],
  ): Promise<void>;
  setCompletedAt(requestId: string, completedAt: number): Promise<void>;
  cancelRequest(requestId: string): Promise<void>;
}

export function createComplianceManager(config: {
  exportStorage: DataExportStorage;
  deletionStorage: DeletionStorage;
  consentStorage: ConsentStorage;
  retentionStorage: RetentionStorage;
  retentionPolicies?: RetentionPolicy[];
}): ComplianceManager {
  return new ComplianceManager(config);
}
