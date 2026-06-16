import type { DiscordAuthConfig, UserStorage } from "./core/types";
import { discordAuth } from "./elysia/plugin";

export class Discord {
	readonly config: DiscordAuthConfig;
	readonly storage: UserStorage | null;
	private _app: ReturnType<typeof discordAuth>;

	constructor(config: DiscordAuthConfig) {
		this.config = config;
		this.storage = config.storage ?? null;
		this._app = discordAuth(config);
	}

	get(
		path: string,
		handler: (...args: unknown[]) => unknown | Promise<unknown>,
		opts?: Record<string, unknown>,
	): this {
		(this._app as { get: (path: string, handler: any, opts?: any) => any }).get(
			path,
			handler,
			opts,
		);
		return this;
	}

	post(
		path: string,
		handler: (...args: unknown[]) => unknown | Promise<unknown>,
		opts?: Record<string, unknown>,
	): this {
		(
			this._app as { post: (path: string, handler: any, opts?: any) => any }
		).post(path, handler, opts);
		return this;
	}

	put(
		path: string,
		handler: (...args: unknown[]) => unknown | Promise<unknown>,
		opts?: Record<string, unknown>,
	): this {
		(this._app as { put: (path: string, handler: any, opts?: any) => any }).put(
			path,
			handler,
			opts,
		);
		return this;
	}

	delete(
		path: string,
		handler: (...args: unknown[]) => unknown | Promise<unknown>,
		opts?: Record<string, unknown>,
	): this {
		(
			this._app as { delete: (path: string, handler: any, opts?: any) => any }
		).delete(path, handler, opts);
		return this;
	}

	patch(
		path: string,
		handler: (...args: unknown[]) => unknown | Promise<unknown>,
		opts?: Record<string, unknown>,
	): this {
		(
			this._app as { patch: (path: string, handler: any, opts?: any) => any }
		).patch(path, handler, opts);
		return this;
	}

	all(
		path: string,
		handler: (...args: unknown[]) => unknown | Promise<unknown>,
		opts?: Record<string, unknown>,
	): this {
		(this._app as { all: (path: string, handler: any, opts?: any) => any }).all(
			path,
			handler,
			opts,
		);
		return this;
	}

	use(plugin: unknown): this {
		(this._app as { use: (plugin: any) => any }).use(plugin);
		return this;
	}

	onError(handler: (...args: unknown[]) => unknown | Promise<unknown>): this {
		(this._app as { onError: (handler: any) => any }).onError(handler);
		return this;
	}

	get raw(): ReturnType<typeof discordAuth> {
		return this._app;
	}

	listen(port: number, cb?: () => void): ReturnType<typeof discordAuth> {
		(this._app as { listen: (port: number, cb?: () => void) => any }).listen(
			port,
			() => {
				if (cb) cb();
			},
		);
		return this._app;
	}
}
