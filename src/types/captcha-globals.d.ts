declare global {
	interface Window {
		turnstile?: {
			reset: (id?: unknown) => void;
			execute: (id?: unknown, options?: Record<string, unknown>) => void;
			render: (
				element: HTMLElement,
				options: Record<string, unknown>,
			) => string | number;
		};

		hcaptcha?: {
			render: (
				element: HTMLElement,
				options: Record<string, unknown>,
			) => string;
			execute: (
				id: string,
				options?: Record<string, unknown>,
			) => Promise<{ response?: string } | undefined>;
			reset: (id: string, token?: string) => void;
			getResponse: (id: string) => string | undefined;
		};

		grecaptcha?: {
			render: (
				element: HTMLElement,
				options: Record<string, unknown>,
			) => string | number;
			execute: (
				id: string | number,
				options?: Record<string, unknown>,
			) => Promise<string>;
			reset: (id: string | number, token?: string | null) => void;
			getResponse: (id: string | number) => string;
		};
	}
}

export {};
