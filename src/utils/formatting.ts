export function formatDuration(seconds: number): string {
	if (seconds % 604800 === 0) {
		return `${seconds / 604800}d`;
	}
	if (seconds % 3600 === 0) {
		return `${seconds / 3600}h`;
	}
	if (seconds % 60 === 0) {
		return `${seconds / 60}m`;
	}
	return `${seconds}s`;
}

export function parseDuration(duration: string): number {
	const match = duration.match(/^(\d+)([smhd])$/);
	if (!match) {
		throw new Error(`Invalid duration format: ${duration}`);
	}

	const value = Number.parseInt(match[1] as string, 10);
	const unit = match[2] as string;

	switch (unit) {
		case "s":
			return value;
		case "m":
			return value * 60;
		case "h":
			return value * 3600;
		case "d":
			return value * 86400;
		default:
			throw new Error(`Unknown duration unit: ${unit}`);
	}
}

export function formatNumber(num: number, locale = "en-US"): string {
	return num.toLocaleString(locale);
}

export function formatBytes(bytes: number, decimals = 2): string {
	if (bytes === 0) return "0 B";

	const k = 1024;
	const dm = decimals < 0 ? 0 : decimals;
	const sizes = ["B", "KB", "MB", "GB", "TB", "PB", "EB", "ZB", "YB"];

	const i = Math.floor(Math.log(bytes) / Math.log(k));

	return `${Number.parseFloat((bytes / k ** i).toFixed(dm))} ${sizes[i] as string}`;
}

export function truncate(
	str: string,
	maxLength: number,
	ellipsis = "...",
): string {
	if (str.length <= maxLength) {
		return str;
	}
	return str.slice(0, maxLength - ellipsis.length) + ellipsis;
}
