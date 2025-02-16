import 'zod-openapi/extend'
import { z, type ZodType } from 'zod'
import type { EmailVerificationResult } from './dto'

const email = z.string().email().openapi({ example: 'danilo@microsoft.com' })

export const verifyEmailRequestBody = z.object({
    email,
})

export const verifyEmailResponseBody = z.object({
    email,
    localPart: z.string().nonempty().openapi({ example: 'danilo' }),
    domain: z.string().nonempty().openapi({ example: 'microsoft.com' }),
    sources: z.array(z.enum(['mx', 'microsoft_4', 'outlook', 'mimecast', 'o365', 'linkedin'])),
    exists: z.boolean().openapi({ example: false }),
}) satisfies ZodType<EmailVerificationResult>

export const verifyEmailBulkRequestBody = z.object({
    emails: z.array(email),
})

export const verifyEmailBulkResultResponseBody = z.array(verifyEmailResponseBody)
