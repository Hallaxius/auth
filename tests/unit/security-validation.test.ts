import { describe, expect, it } from "bun:test";

describe("Email Validation (RFC 5322)", () => {
	const emailRegex =
		/^(?:"?[^"@\s\\]+\.?_?[^"@\s\\]*"?|"[^"\\]*(?:\\.[^"\\]*)*")@(?:(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}|(?:\[(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)|\[[a-fA-F0-9:]+\])])$/;

	it("should accept valid email addresses", () => {
		const validEmails = [
			"user@example.com",
			"user.name@example.com",
			"user_name@example.co.uk",
			"user+tag@example.com",
			"user123@test.org",
		];

		for (const email of validEmails) {
			expect(emailRegex.test(email)).toBe(true);
		}
	});

	it("should reject invalid email addresses", () => {
		const invalidEmails = [
			"invalid",
			"invalid@",
			"@example.com",
			"user@.com",
			"user@example",
			"user name@example.com",
			"user@exam ple.com",
		];

		for (const email of invalidEmails) {
			expect(emailRegex.test(email)).toBe(false);
		}
	});
});

describe("Password Complexity Requirements", () => {
	function checkPasswordComplexity(password: string): {
		valid: boolean;
		errors: string[];
	} {
		const errors: string[] = [];
		const minLen = 12;

		if (password.length < minLen) {
			errors.push(`Password must be at least ${minLen} characters`);
		}

		if (password.length >= minLen) {
			const hasUpper = /[A-Z]/.test(password);
			const hasLower = /[a-z]/.test(password);
			const hasNumber = /[0-9]/.test(password);
			const hasSpecial = /[^A-Za-z0-9]/.test(password);
			const varietyCount = [hasUpper, hasLower, hasNumber, hasSpecial].filter(
				Boolean,
			).length;

			if (varietyCount < 3) {
				errors.push(
					"Password must include at least 3 of: uppercase, lowercase, numbers, special characters",
				);
			}
		}

		return { valid: errors.length === 0, errors };
	}

	it("should accept strong passwords", () => {
		const strongPasswords = [
			"Str0ng!Passw0rd",
			"C0mpl3x#P@ssw0rd!",
			"V3ry$ecur3P@ss",
		];

		for (const password of strongPasswords) {
			const result = checkPasswordComplexity(password);
			expect(result.valid).toBe(true);
		}
	});

	it("should reject weak passwords", () => {
		const weakPasswords = [
			"short",
			"alllowercasepassword",
			"ALLUPPERCASEPASSWORD",
			"1234567890123456",
		];

		for (const password of weakPasswords) {
			const result = checkPasswordComplexity(password);
			expect(result.valid).toBe(false);
		}
	});
});
