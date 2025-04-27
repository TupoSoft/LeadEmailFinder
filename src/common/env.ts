import { z, type ZodType, type ZodTypeDef } from 'zod'
import { env } from 'node:process'
import { DEFAULT_PORT } from './constants'
import { readFile } from 'node:fs/promises'

const JWT_HS256_SECRET_MIN_LENGTH = 32

const stringWithMinLength = z.string().nonempty()

export interface Environment {
    NODE_ENV: 'development' | 'production' | 'test'
    API_URL: string
    PORT: number
    MONGO_URL: string
    REDIS_URL: string
    AUTH_TOKENS: string
    CATCH_ALL_HTTP_PROXY_URL: string
    npm_package_version: string
}

const envSchema = z.object({
    NODE_ENV: z.enum(['development', 'production', 'test']),
    API_URL: stringWithMinLength,
    PORT: z.coerce.number().default(DEFAULT_PORT),
    JWT_HS256_SECRET: z.string().min(JWT_HS256_SECRET_MIN_LENGTH),
    JWT_ISSUER: stringWithMinLength,
    JWT_AUDIENCE: stringWithMinLength,
    JWT_EXPIRATION: stringWithMinLength.default('1h'),
    MONGO_URL: stringWithMinLength,
    AUTH_TOKENS: stringWithMinLength,
    REDIS_URL: stringWithMinLength,
    CATCH_ALL_HTTP_PROXY_URL: stringWithMinLength,
    npm_package_version: stringWithMinLength,
}) satisfies ZodType<Environment, ZodTypeDef, Partial<Environment>>

async function loadSecrets(): Promise<void> {
    for (const [key, value] of Object.entries(env)) {
        if (key.endsWith('_FILE') && value !== undefined) {
            const keyWithoutFile = key.replace('_FILE', '')
            env[keyWithoutFile] = await readFile(value, 'utf8')
        }
    }
}

export async function parseEnv(): Promise<Environment> {
    await loadSecrets()
    return await envSchema.parseAsync(process.env)
}
