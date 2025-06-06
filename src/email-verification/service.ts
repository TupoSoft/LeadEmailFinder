import type { EmailVerificationRequest, EmailVerificationResult } from './dto'

export interface IEmailVerificationService {
    verify: (emailVerificationRequest: EmailVerificationRequest) => Promise<EmailVerificationResult>
}
