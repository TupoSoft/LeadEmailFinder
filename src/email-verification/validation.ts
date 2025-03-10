import 'zod-openapi/extend'
import { z, type ZodType } from 'zod'
import type { EmailVerificationResult } from './dto'
import { CatchAllStatus, DeliveryStatus } from './enums'
import { SmtpVerificationReasonEnum } from '../smtp/dto'

const email = z.string().email().openapi({ example: 'danilo@microsoft.com' })

export const verifyEmailRequestBody = z
    .object({
        email,
    })
    .strict()

export const verifyEmailResponseBody = z
    .object({
        id: z.string().nonempty().openapi({ example: '67b8dcef89682b48577cd789' }),
        email,
        localPart: z.string().nonempty().openapi({ example: 'danilo' }),
        domain: z.string().nonempty().openapi({ example: 'microsoft.com' }),
        sources: z.array(z.enum(['mx', 'microsoft_4', 'microsoft_1', 'mimecast', 'microsoft_2', 'linkedin'])),
        exists: z.boolean().openapi({ example: false }),
        targetExchange: z
            .string()
            .nonempty()
            .optional()
            .openapi({ example: 'microsoft-com.mail.protection.outlook.com' }),
        mxDomain: z.string().nonempty().optional().openapi({ example: 'outlook.com' }),
        verifiedAt: z.string().date().openapi({ example: '2022-22-22T02:00:00.000Z' }),
        deliveryStatus: z.enum([DeliveryStatus.Accepted, DeliveryStatus.Rejected, DeliveryStatus.NotProcessed]),
        catchAll: z.enum([CatchAllStatus.Enabled, CatchAllStatus.Disabled, CatchAllStatus.Unknown]),
        reason: z.nativeEnum(SmtpVerificationReasonEnum),
    })
    .strict() satisfies ZodType<EmailVerificationResult>

export const verifyEmailBulkRequestBody = z.array(email)

export const verifyEmailBulkResultResponseBody = z.array(verifyEmailResponseBody)

export const legacyVerifyEmailRequestQueryParams = z.object({
    email,
})
