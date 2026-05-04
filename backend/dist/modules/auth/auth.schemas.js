import { z } from 'zod';
const credentials = z.object({ email: z.string().email(), password: z.string().min(8) });
export const registerSchema = z.object({ body: credentials });
export const loginSchema = z.object({ body: credentials });
export const refreshSchema = z.object({ body: z.object({ refreshToken: z.string().min(10) }) });
export const logoutSchema = z.object({ body: z.object({ refreshToken: z.string().min(10) }) });
