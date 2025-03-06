import { z, type ZodType } from 'zod'
import { SmtpVerificationReasonEnum, type SmtpVerifyResponse } from './dto'

export const smtpVerifyResponseSchema = z.object({
    email: z.string().email().nonempty(),
    exists: z.boolean().nullable(),
    reason: z.nativeEnum(SmtpVerificationReasonEnum),
    targetExchange: z.string().optional(),
    proxyId: z.string().optional(),
}) satisfies ZodType<SmtpVerifyResponse>
