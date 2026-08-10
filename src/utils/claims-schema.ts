import { z } from "zod";

export const SessionClaimsSchema = z.object({
	jti: z.string().uuid(),
	iss: z.string().optional(),
	iat: z.number(),
	exp: z.number(),
	discordId: z.string(),
	username: z.string(),
	globalName: z.string().nullable(),
	avatar: z.string().nullable(),
	email: z.string().nullable(),
	locale: z.string(),
	roles: z.array(z.string()).optional(),
	mfaEnabled: z.boolean().optional(),
	permissions: z.array(z.string()).optional(),
	type: z.string().optional(),
	discriminator: z.string().optional(),
	verified: z.boolean().optional(),
	banner: z.string().nullable().optional(),
	bannerColor: z.string().nullable().optional(),
	accentColor: z.number().nullable().optional(),
	premiumType: z.number().optional(),
	publicFlags: z.number().optional(),
	flags: z.number().optional(),
	avatarDecoration: z.string().nullable().optional(),
	storedUserId: z.string().optional(),
	discordRefreshToken: z.string().optional(),
});

export const CredentialsClaimsSchema = z.object({
	jti: z.string().uuid(),
	iss: z.string().optional(),
	iat: z.number(),
	exp: z.number(),
	userId: z.string(),
	username: z.string().optional(),
	email: z.string().optional(),
	roles: z.array(z.string()),
	type: z.string().optional(),
});

export type SessionClaims = z.infer<typeof SessionClaimsSchema>;
export type CredentialsClaims = z.infer<typeof CredentialsClaimsSchema>;
