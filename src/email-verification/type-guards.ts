import type { EmailVerificationSource } from './dto'
import { EMAIL_VERIFICATION_SOURCES } from './constants'

export function isEmailVerificationSource(str: string): str is EmailVerificationSource {
    return EMAIL_VERIFICATION_SOURCES.some(source => source === str)
}
