import { EmailVerificationSource } from '../../common'

export function isEmailVerificationSource(str: string): str is EmailVerificationSource {
    return Object.values(EmailVerificationSource as object).includes(str)
}
