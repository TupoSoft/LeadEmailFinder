import { z, ZodType } from 'zod'
import { IMicrosoftLoginErrorData } from './interfaces'
import { MicrosoftLoginErrorCode } from './enums'

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
