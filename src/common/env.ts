import { z, type ZodType, type ZodTypeDef } from 'zod'
import { env } from 'node:process'
import { readFileSync } from 'fs'
import { DEFAULT_PORT } from './constants'

const STRING_MIN_LENGTH = 1
const JWT_HS256_SECRET_MIN_LENGTH = 32

const stringWithMinLength = z.string().min(STRING_MIN_LENGTH)

for (const [key, value] of Object.entries(env)) {
    if (key.endsWith('_FILE') && value !== undefined) {
        const keyWithoutFile = key.replace('_FILE', '')
        env[keyWithoutFile] = readFileSync(value, 'utf8')
    }
}

export interface Environment {
    NODE_ENV: 'development' | 'production' | 'test'
    PORT: number
    JWT_HS256_SECRET: string
    JWT_ISSUER: string
    JWT_AUDIENCE: string
    MONGO_URL: string
    REDIS_CONFIG: string
    AUTH_TOKENS: string
}

const envSchema = z.object({
    NODE_ENV: z.enum(['development', 'production', 'test']),
    PORT: z.coerce.number().default(DEFAULT_PORT),
    JWT_HS256_SECRET: z.string().min(JWT_HS256_SECRET_MIN_LENGTH).readonly(),
    JWT_ISSUER: stringWithMinLength,
    JWT_AUDIENCE: stringWithMinLength,
    MONGO_URL: stringWithMinLength,
    REDIS_CONFIG: stringWithMinLength,
    AUTH_TOKENS: stringWithMinLength,
}) satisfies ZodType<Environment, ZodTypeDef, Partial<Environment>>

export async function parseEnv(): Promise<Environment> {
    return await envSchema.parseAsync(process.env)
}
