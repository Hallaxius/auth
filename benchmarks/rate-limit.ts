import { bench, run } from "mitata";
import { rateLimit } from "../src/rate-limit";

const limiter = rateLimit({
	maxRequests: 100,
	windowMs: 60000,
});

bench("rate limit check - allowed", async () => {
	const _request = new Request("http://localhost:3000", {
		headers: { "X-Forwarded-For": "192.168.1.1" },
	});
	await limiter.middleware(_request);
});

bench("rate limit check - different IPs", async () => {
	for (let i = 0; i < 10; i++) {
		const _request = new Request("http://localhost:3000", {
			headers: { "X-Forwarded-For": `192.168.1.${i}` },
		});
		await limiter.middleware(_request);
	}
});

await run();
