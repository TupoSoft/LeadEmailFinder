import type { MicrosoftErrorData } from './microsoft-login'
import { microsoftErrorSchema } from './validation'
import type { AxiosError } from 'axios'

export function isMicrosoftError(value: unknown): value is AxiosError<MicrosoftErrorData> {
    return microsoftErrorSchema.safeParse(value).success
}
