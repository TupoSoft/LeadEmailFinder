import z, { type ZodType } from 'zod'
import type { CreateEmailRequest, UpdateEmailRequest } from './dto'
import type { EmailRecord } from './repository'
import { EMAIL_PATTERNS } from './constants'

const email = z.string().email().nonempty()
const exists = z.boolean().nullable()
const createdAt = z.date()

export const createEmailRequestValidationSchema = z
    .object({
        email,
        format: z.enum(EMAIL_PATTERNS).optional(),
        exists,
    })
    .strict() satisfies ZodType<CreateEmailRequest>

export const updateEmailRequestValidationSchema = z
    .object({
        exists: z.boolean().nullable(),
        format: z.enum(EMAIL_PATTERNS).optional(),
    })
    .strict() satisfies ZodType<UpdateEmailRequest>

export const requestWithIdParamValidationSchema = z
    .object({
        email,
    })
    .strict()

export const emailRecordValidationSchema = z.object({
    email,
    username: z.string().nonempty(),
    domain: z.string().nonempty(),
    format: z.enum(EMAIL_PATTERNS).optional(),
    exists,
    lastVerificationId: z.string().nonempty().optional(),
    createdAt,
    updatedAt: createdAt,
}) satisfies ZodType<EmailRecord>
