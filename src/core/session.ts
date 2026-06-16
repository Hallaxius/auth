import { JwtSessionAdapter } from "../adapters/session/jwt";
import { ServerSessionAdapter } from "../adapters/session/server";
import type { SessionAdapter, SessionConfig } from "./types";

export function createSessionAdapter(config: SessionConfig): SessionAdapter {
	switch (config.type) {
		case "jwt":
			return new JwtSessionAdapter(config);
		case "server":
			return new ServerSessionAdapter(config);
		default:
			throw new Error(`Unknown session type: ${config.type}`);
	}
}

export type { SessionAdapter };
