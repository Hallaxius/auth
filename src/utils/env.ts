export function isProduction(): boolean {
	try {
		const nodeEnv =
			typeof process !== "undefined" ? process.env.NODE_ENV : undefined;
		return nodeEnv === "production";
	} catch {
		return false;
	}
}

export function requireRedisStorage(
	storage: unknown,
	componentName: string,
): void {
	if (isProduction() && !storage) {
		throw new Error(
			`[SECURITY] ${componentName}: In production (NODE_ENV=production), Redis storage is required. ` +
				`Memory storage is not secure for production environments. ` +
				`Please configure Redis storage or set NODE_ENV=development for local testing.`,
		);
	}
}

export function secret(value: string): string {
	return value;
}
