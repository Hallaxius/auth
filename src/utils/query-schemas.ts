import { z } from "zod";

export const CallbackQuerySchema = z.object({
	code: z.string().min(1).max(256).optional(),
	state: z.string().min(1).max(512).optional(),
	error: z.string().optional(),
	error_description: z.string().max(1024).optional(),
});

export const LoginQuerySchema = z.object({
	redirect: z.string().max(2048).optional(),
	prompt: z.enum(["consent", "none"]).optional(),
});

export const LogoutQuerySchema = z.object({
	redirect: z.string().max(2048).optional(),
});

export const ErrorQuerySchema = z.object({
	error: z.string().min(1).max(256),
	error_description: z.string().max(1024).optional(),
});
