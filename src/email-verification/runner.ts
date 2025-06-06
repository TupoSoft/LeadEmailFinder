import type { EmailVerificationRequest, EmailVerificationResult } from './dto'

export interface IEmailVerificationRunner {
    verify: (emailVerificationRequest: EmailVerificationRequest) => Promise<EmailVerificationResult>
}
