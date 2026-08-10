declare module "cookie" {
	export function parse(
		str: string,
		options?: {
			decode?: (str: string) => string;
		},
	): Record<string, string>;

	export function serialize(
		name: string,
		value: string,
		options?: {
			encode?: (str: string) => string;
			maxAge?: number;
			path?: string;
			httpOnly?: boolean;
			secure?: boolean;
			sameSite?: "lax" | "strict" | "none";
			domain?: string;
			expires?: Date;
		},
	): string;
}
