import { z, type ZodType } from 'zod'
import { SmtpVerificationReasonEnum, type SmtpVerificationResult } from './dto'

export const smtpVerificationResultValidationSchema = z.object({
    email: z.string().email().nonempty(),
    exists: z.boolean().nullable(),
    reason: z.nativeEnum(SmtpVerificationReasonEnum),
    targetExchange: z.string().optional(),
}) satisfies ZodType<SmtpVerificationResult>
