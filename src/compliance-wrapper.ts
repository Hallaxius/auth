import type {
	ComplianceManager as ComplianceManagerType,
	ConsentStorage,
	DataExportStorage,
	DeletionStorage,
	RetentionPolicy,
	RetentionStorage,
} from "./utils/compliance";
import { createComplianceManager } from "./utils/compliance";

export interface ComplianceConfig {
	exportStorage: DataExportStorage;
	deletionStorage: DeletionStorage;
	consentStorage: ConsentStorage;
	retentionStorage: RetentionStorage;
	retentionPolicies?: RetentionPolicy[];
}

export function compliance(config: ComplianceConfig): ComplianceManagerType {
	return createComplianceManager({
		exportStorage: config.exportStorage,
		deletionStorage: config.deletionStorage,
		consentStorage: config.consentStorage,
		retentionStorage: config.retentionStorage,
		retentionPolicies: config.retentionPolicies,
	});
}

export type {
	ConsentRecord,
	DataDeletionRequest,
	DataExportRequest,
	PrivacySettings,
	RetentionPolicy,
	UserDataExport,
} from "./utils/compliance";
export { ComplianceManager } from "./utils/compliance";
