import z, { type ZodType, type ZodTypeDef } from 'zod'
import type { CreateEmailRequest, GetEmailsRequestQueryParams, UpdateEmailRequest } from './dto'
import type { EmailRecord } from './repository'
import { EMAIL_PATTERNS } from './constants'
import { EmailPattern } from './enums'

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

export const getEmailsQueryValidationSchema = z
    .object({
        exists: z
            .union([
                z.literal('true').transform(() => true),
                z.literal('false').transform(() => false),
                z.literal('null').transform(() => null),
            ])
            .optional()
            .openapi({
                example: 'true',
                nullable: true,
                enum: [true, false, null],
            }),
        domain: z.string().nonempty().optional().openapi({ example: 'example.com' }),
        format: z.enum(EMAIL_PATTERNS).optional().openapi({ example: EmailPattern.LastFirst }),
        formatExists: z
            .union([z.literal('true').transform(() => true), z.literal('false').transform(() => false)])
            .optional()
            .openapi({ example: 'true', type: 'boolean' }),
    })
    .strict() satisfies ZodType<GetEmailsRequestQueryParams, ZodTypeDef, unknown>

export const getEmailsResponseValidationSchema = z.array(emailRecordValidationSchema)
