import { z } from 'zod'
import { env } from 'node:process'
import { DEFAULT_PORT, EXIT_FAILURE } from './constants'
import { readFileSync } from 'fs'

const STRING_MIN_LENGTH = 1
const JWT_HS256_SECRET_MIN_LENGTH = 32

const stringZodReadonly = z.string().min(STRING_MIN_LENGTH).readonly()
const numberArrayZod = z.string().transform(Number).readonly()

for (const [key, value] of Object.entries(env)) {
    if (key.endsWith('_FILE') && value !== undefined) {
        const keyWithoutFile = key.replace('_FILE', '')
        env[keyWithoutFile] = readFileSync(value, 'utf8')
    }
}

const envSchema = z.object({
    NODE_ENV: z.enum(['development', 'production']),
    PORT: numberArrayZod.default(String(DEFAULT_PORT)),
    JWT_HS256_SECRET: z.string().min(JWT_HS256_SECRET_MIN_LENGTH).readonly(),
    JWT_ISSUER: stringZodReadonly,
    JWT_AUDIENCE: stringZodReadonly,
    MONGO_URL: stringZodReadonly,
    REDIS_CONFIG: stringZodReadonly,
    AUTH_TOKENS: stringZodReadonly,
})

const parsedEnv = envSchema.safeParse(env)

if (!parsedEnv.success) {
    console.error('Invalid environment variables:', parsedEnv.error.format())
    process.exit(EXIT_FAILURE)
}

export const {
    data: { NODE_ENV, PORT, JWT_ISSUER, JWT_HS256_SECRET, JWT_AUDIENCE, MONGO_URL, REDIS_CONFIG, AUTH_TOKENS },
} = parsedEnv
