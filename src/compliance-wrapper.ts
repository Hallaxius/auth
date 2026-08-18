import type {
	ComplianceConfig,
	ComplianceManager as ComplianceManagerType,
} from "./utils/compliance";
import { createComplianceManager } from "./utils/compliance";

export type { ComplianceConfig } from "./utils/compliance";

/**
 * @deprecated Use `createComplianceManager` from `./utils/compliance` directly.
 * This wrapper is kept for backward compatibility and will be removed in v2.
 */
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
