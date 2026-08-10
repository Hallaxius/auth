import * as jose from "jose";
import { bench, run } from "mitata";

const secret = new TextEncoder().encode("test-secret-32-char-min-length!!");

bench("JWT sign - HS256", async () => {
	await new jose.SignJWT({ sub: "user_123", role: "user" })
		.setProtectedHeader({ alg: "HS256" })
		.setIssuedAt()
		.setExpirationTime("1h")
		.sign(secret);
});

bench("JWT verify - valid token", async () => {
	const token = await new jose.SignJWT({ sub: "user_123" })
		.setProtectedHeader({ alg: "HS256" })
		.setIssuedAt()
		.setExpirationTime("1h")
		.sign(secret);

	await jose.jwtVerify(token, secret);
});

bench("JWT verify - expired token", async () => {
	const token = await new jose.SignJWT({ sub: "user_123" })
		.setProtectedHeader({ alg: "HS256" })
		.setIssuedAt()
		.setExpirationTime("-1h")
		.sign(secret);

	try {
		await jose.jwtVerify(token, secret);
	} catch (_e) {}
});

bench("JWT parse (no verify)", async () => {
	const token = await new jose.SignJWT({ sub: "user_123", role: "admin" })
		.setProtectedHeader({ alg: "HS256" })
		.setIssuedAt()
		.setExpirationTime("1h")
		.sign(secret);

	jose.decodeJwt(token);
});

await run();
