import { z } from 'zod'
import { env } from 'node:process'
import { DEFAULT_PORT, EXIT_FAILURE } from './constants'

const MIN_LENGTH = 1

const stringZodReadonly = z.string().min(MIN_LENGTH).readonly()
const numberArrayZod = z.string().transform(Number).readonly()

const envSchema = z.object({
    NODE_ENV: stringZodReadonly,
    PORT: numberArrayZod.default(String(DEFAULT_PORT)),
})

const parsedEnv = envSchema.safeParse(env)

if (!parsedEnv.success) {
    console.error('Invalid environment variables:', parsedEnv.error.format())
    process.exit(EXIT_FAILURE)
}

export const {
    data: { NODE_ENV, PORT },
} = parsedEnv
