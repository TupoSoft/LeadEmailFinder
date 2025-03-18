import { microsoftErrorSchema } from './validation'
import type { z } from 'zod'

export function isMicrosoftError(value: unknown): value is z.infer<typeof microsoftErrorSchema> {
    return microsoftErrorSchema.safeParse(value).success
}
