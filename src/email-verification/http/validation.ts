import { z, type ZodType } from 'zod'
import { MicrosoftLoginErrorCode, type MicrosoftLoginErrorData } from './microsoft-login'

export const microsoftErrorSchema = z.object({
    response: z.object({
        data: z.object({
            error_codes: z.array(z.nativeEnum(MicrosoftLoginErrorCode)),
        }) satisfies ZodType<MicrosoftLoginErrorData>,
    }),
})
