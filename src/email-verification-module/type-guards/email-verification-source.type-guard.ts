import { EmailVerificationSource } from '../enums'

export function isEmailVerificationSource(str: string): str is EmailVerificationSource {
    return Object.values(EmailVerificationSource as object).includes(str)
}
