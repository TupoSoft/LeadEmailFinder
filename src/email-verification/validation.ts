import 'zod-openapi/extend'
import { z, type ZodType } from 'zod'
import type { EmailVerificationResult } from './dto'
import { VERIFY_EMAIL_BULK_STATUS_ROUTE } from './constants'
import { API_PREFIX } from '../common'

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

export const verifyEmailBulkRequestBody = z.array(verifyEmailRequestBody)

export const verifyEmailBulkResponseBody = z.object({
    taskId: z.string().nonempty().openapi({ example: '1' }),
    message: z.string().nonempty().openapi({ example: 'Request accepted. Starting to find emails.' }),
    monitorUrl: z
        .string()
        .nonempty()
        .url()
        .openapi({
            example: `https://leademailfinder.com${API_PREFIX}${VERIFY_EMAIL_BULK_STATUS_ROUTE.replace(':id', '1')}`,
        }),
})

export const verifyEmailBulkResultResponseBody = z.array(verifyEmailResponseBody)
