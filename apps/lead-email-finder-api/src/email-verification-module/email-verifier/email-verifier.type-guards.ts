import { EmailVerificationSource } from '@tuposoft/lead-email-finder/common'

export function isEmailVerificationSource(str: string): str is EmailVerificationSource {
    return Object.values(EmailVerificationSource as object).includes(str)
}
