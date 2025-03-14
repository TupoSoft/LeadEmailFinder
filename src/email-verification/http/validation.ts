import { z } from 'zod'
import { MicrosoftLoginErrorCode } from './microsoft-login'

export const microsoftErrorSchema = z.object({
    response: z.object({
        data: z.object({
            error_codes: z.nativeEnum(MicrosoftLoginErrorCode),
        }),
    }),
})
