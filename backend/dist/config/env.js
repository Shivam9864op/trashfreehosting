import dotenv from 'dotenv';
import { z } from 'zod';
dotenv.config();
const envSchema = z.object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().default(3001),
    CORS_ORIGIN: z.string().default('https://shivam9864op.github.io,https://shivam9864op.github.io/trashfreehosting,https://hosting.trashmcpe.com'),
    PTERO_URL: z.string().url(),
    PTERO_API_KEY: z.string().min(10),
    NODE_ID: z.coerce.number().int().positive(),
    EGG_ID: z.coerce.number().int().positive(),
    USER_ID: z.coerce.number().int().positive(),
    ALLOC_ID: z.coerce.number().int().positive(),
});
const parsed = envSchema.parse(process.env);
const corsOrigins = parsed.CORS_ORIGIN.split(',').map((v) => v.trim()).filter(Boolean);
export const env = {
    ...parsed,
    corsOrigins,
};
