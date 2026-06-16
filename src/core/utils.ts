export function parseExpiresIn(value: string | number | undefined): number {
	if (typeof value === "number") return value;
	if (typeof value === "string") {
		const match = value.match(/^(\d+)([dhms])$/);
		if (!match) return 604800;
		const num = Number.parseInt(match[1], 10);
		switch (match[2]) {
			case "d":
				return num * 86400;
			case "h":
				return num * 3600;
			case "m":
				return num * 60;
			case "s":
				return num;
			default:
				return 604800;
		}
	}
	return 604800;
}
