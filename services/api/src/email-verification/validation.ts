import 'zod-openapi/extend'
import { z, type ZodType } from 'zod'
import { type EmailVerificationResponse, ExistenceStatus } from './dto'

const email = z.string().email().openapi({ example: 'danilo@microsoft.com' })

export const verifyEmailRequestBody = z.object({
    email,
})

export const verifyEmailResponseBody = z.object({
    email,
    username: z.string().nonempty().openapi({ example: 'danilo' }),
    domain: z.string().nonempty().openapi({ example: 'microsoft.com' }),
    verificationResults: z.object({}).openapi({
        example: {
            mx: {
                success: true,
                catchAllStatus: false,
                mxRecord: 'mx1.microsoft.com',
                mxDomain: 'microsoft.com',
            },
        },
    }),
    status: z
        .enum([ExistenceStatus.Exists, ExistenceStatus.DoesNotExist, ExistenceStatus.Unknown])
        .openapi({ example: ExistenceStatus.Exists }),
    checkedAt: z.date(),
}) satisfies ZodType<EmailVerificationResponse>

export const verifyEmailBulkRequestBody = z.object({
    emails: z.array(email),
})

export const verifyEmailBulkResultResponseBody = z.array(verifyEmailResponseBody)
