import type { EmailVerifier } from './verifier'
import type { EmailVerificationRepository } from './repository'
import type { EmailVerificationRequest, EmailVerificationResult } from './dto'
import type { EmailPatternUsage } from '../domain'

export class EmailVerificationService {
    constructor(
        private readonly emailVerifier: EmailVerifier,
        private readonly emailVerificationRepository: EmailVerificationRepository,
    ) {}

    async verify(emailVerificationRequest: EmailVerificationRequest): Promise<EmailVerificationResult> {
        return await this.emailVerifier.verify(emailVerificationRequest)
    }

    async aggregateEmailPatternUsageForDomain(domain: string): Promise<EmailPatternUsage[]> {
        return await this.emailVerificationRepository.aggregateEmailPatternUsageForDomain(domain)
    }
}
