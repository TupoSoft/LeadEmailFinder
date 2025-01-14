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
    sources: z.array(
        z.enum([
            'SMTP',
            'MicrosoftGetCredentialType',
            'MicrosoftLogin',
            'MimecastLogin',
            'OfficeApps',
            'LinkedInLogin',
            'None',
        ]),
    ),
    exists: z.boolean().openapi({ example: false }),
}) satisfies ZodType<EmailVerificationResult>
