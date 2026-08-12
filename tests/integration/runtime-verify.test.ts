import { describe, expect, test } from "bun:test";
import { getRequestIP, MemoryTokenRevocationStorage } from "../../dist/index.js";
import { RefreshTokenManager } from "../../src/internal/refresh-token";

const SECRET =
	"5K8qN2mR9pL3vX7wJ4tY6hF1dS0aG8bC2eU5iO9xM3nZ7kV4rW1qP6yT0uI8oA2";

describe("runtime integration", () => {
	test("getRequestIP resolves the real peer IP on a live Bun server", async () => {
		const server = Bun.serve({
			port: 0,
			fetch: async (request, bunServer) => {
				const ip = await getRequestIP(request, {
					peerIp: bunServer.requestIP(request)?.address,
				});
				return new Response(JSON.stringify({ ip }));
			},
		});

		try {
			const res = await fetch(`http://127.0.0.1:${server.port}/`);
			const body = (await res.json()) as { ip: string };

			expect(body.ip).toBe("127.0.0.1");
		} finally {
			server.stop(true);
		}
	});

	test("getRequestIP falls back to a stable fingerprint when the peer is opaque", async () => {
		const server = Bun.serve({
			port: 0,
			fetch: async (request) => {
				const ip = await getRequestIP(request);
				return new Response(JSON.stringify({ ip }));
			},
		});

		try {
			const res = await fetch(`http://127.0.0.1:${server.port}/`);
			const body = (await res.json()) as { ip: string };

			expect(body.ip.startsWith("fp:")).toBe(true);
			expect(body.ip.length).toBeGreaterThan(6);
		} finally {
			server.stop(true);
		}
	});

	test("concurrent refresh rotation yields exactly one winner", async () => {
		const storage = new MemoryTokenRevocationStorage();
		const manager = new RefreshTokenManager({
			secret: SECRET,
			revocationStorage: storage,
			familyTracking: false,
		});

		const issued = await manager.issueRefreshToken("user-1");

		const results = await Promise.all(
			Array.from({ length: 5 }, () =>
				manager.rotateRefreshToken(issued.token),
			),
		);

		const winners = results.filter((r) => r !== null);
		expect(winners).toHaveLength(1);

		const winner = winners[0]!;
		expect(winner.jti).not.toBe(issued.jti);
		expect(await manager.validateRefreshToken(winner.token)).not.toBeNull();
		expect(await manager.validateRefreshToken(issued.token)).toBeNull();

		const winnerResults = await Promise.all(
			Array.from({ length: 3 }, () =>
				manager.rotateRefreshToken(winner.token),
			),
		);
		expect(winnerResults.filter((r) => r !== null)).toHaveLength(1);
	});

	test("family tracking revokes the whole family on replay", async () => {
		const storage = new MemoryTokenRevocationStorage();
		const manager = new RefreshTokenManager({
			secret: SECRET,
			revocationStorage: storage,
			familyTracking: true,
		});

		const issued = await manager.issueRefreshToken("user-1");
		const rotated = await manager.rotateRefreshToken(issued.token);
		expect(rotated).not.toBeNull();

		const replay = await manager.rotateRefreshToken(issued.token);
		expect(replay).toBeNull();
		expect(await storage.isFamilyRevoked(issued.familyId)).toBe(true);
		expect(await manager.validateRefreshToken(rotated!.token)).toBeNull();
	});
});