export function escapeHtml(str: string): string {
	const map: Record<string, string> = {
		"&": "&amp;",
		"<": "&lt;",
		">": "&gt;",
		'"': "&quot;",
		"'": "&#x27;",
	};
	return str.replace(/[&<>"']/g, (ch) => map[ch] ?? ch);
}

export function sanitizeQueryParam(value: string | null): string {
	if (value === null) return "";
	return escapeHtml(value.slice(0, 1000));
}

export function sanitizeErrorMessage(error: string): string {
	return escapeHtml(error.replace(/<[^>]*>/g, ""));
}
