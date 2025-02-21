import { z, type ZodType } from 'zod'
import type { LegacyEmailVerificationResult } from './dto'
import { CatchAllStatus, DeliveryStatus } from './enums'

const email = z.string().email().openapi({ example: 'danilo@microsoft.com' })

export const legacyVerifyEmailRequestQueryParams = z.object({
    email,
})

export const legacyVerifyEmailResponseBody = z.object({
    email,
    localPart: z.string().nonempty().openapi({ example: 'danilo' }),
    domain: z.string().nonempty().openapi({ example: 'microsoft.com' }),
    deliveryStatus: z.enum([DeliveryStatus.Accepted, DeliveryStatus.Rejected, DeliveryStatus.NotProcessed]),
    catchAll: z.enum([CatchAllStatus.Enabled, CatchAllStatus.Disabled, CatchAllStatus.Unknown]),
    verifiedAt: z.date(),
}) satisfies ZodType<LegacyEmailVerificationResult>
