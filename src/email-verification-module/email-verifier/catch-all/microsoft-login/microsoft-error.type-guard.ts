import { z, ZodType } from 'zod'
import { MicrosoftLoginErrorCode } from './microsoft-login-error-code.enum'
import { IMicrosoftLoginErrorData } from './microsoft-login-error-data.interface'

const microsoftErrorSchema = z.object({
    response: z.object({
        data: z.object({
            error_codes: z.array(z.nativeEnum(MicrosoftLoginErrorCode)),
        }) satisfies ZodType<IMicrosoftLoginErrorData>,
    }),
})

export function isMicrosoftError(value: unknown): value is z.infer<typeof microsoftErrorSchema> {
    return microsoftErrorSchema.safeParse(value).success
}
