import 'zod-openapi/extend'
import { z, type ZodType } from 'zod'
import type { EmailVerificationResponse } from './dto'

const email = z.string().email().openapi({ example: 'danilo@microsoft.com' })

export const verifyEmailRequestBody = z.object({
    email,
})

export const verifyEmailResponseBody = z.object({
    email,
    localPart: z.string().nonempty().openapi({ example: 'danilo' }),
    domain: z.string().nonempty().openapi({ example: 'microsoft.com' }),
    sources: z.object({}).openapi({
        example: {
            mx: {
                success: true,
                catchAllStatus: false,
                targetExchange: 'mx1.microsoft.com',
                mxDomain: 'microsoft.com',
            },
        },
    }),
    exists: z.boolean().openapi({ example: false }),
    checkedAt: z.string().nonempty().date(),
}) satisfies ZodType<EmailVerificationResponse>

export const verifyEmailBulkRequestBody = z.object({
    emails: z.array(email),
})

export const verifyEmailBulkResultResponseBody = z.array(verifyEmailResponseBody)
