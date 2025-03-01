import { z, type ZodType } from 'zod'
import { SmtpVerificationReasonEnum, type SmtpVerificationResult } from './dto'

export const smtpVerificationResultValidationSchema = z.intersection(
    z.object({
        email: z.string().email().nonempty(),
        reason: z.nativeEnum(SmtpVerificationReasonEnum),
    }),
    z.union([
        z.object({
            exists: z.null(),
            targetExchange: z.string().nonempty().optional(),
        }),
        z.object({
            exists: z.boolean(),
            targetExchange: z.string().nonempty(),
        }),
    ]),
) satisfies ZodType<SmtpVerificationResult>
