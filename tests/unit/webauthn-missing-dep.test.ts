import { describe, expect, mock, test } from "bun:test";
import type { WebAuthnConfig } from "../../src";

mock.module("@simplewebauthn/server", () => {
	throw new Error("Cannot find package '@simplewebauthn/server'");
});

const { webauthn } = await import("../../src");

describe("webauthn — missing peer dependency", () => {
	test("rejects with a clear ConfigurationError when the peer dep is not installed", async () => {
		const config = {
			rp: {
				id: "login.example.com",
				name: "Example Login",
				origins: ["https://login.example.com"],
			},
			storage: {
				credentials: {
					findById: async () => null,
					listByUser: async () => [],
					create: async () => {},
					delete: async () => {},
					deleteByUser: async () => {},
					updateSignCount: async () => {},
				},
				challenges: {
					set: async () => {},
					getAndConsume: async () => null,
				},
			},
		} satisfies WebAuthnConfig;
		await expect(webauthn(config)).rejects.toThrow(
			"webauthn() requires the optional peer dependency `@simplewebauthn/server` to be installed. Run `npm install @simplewebauthn/server`.",
		);
	});
});