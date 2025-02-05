import type { EmailVerificationRequest, EmailVerificationResult } from './dto'
import type { EmailVerificationRepository } from './repository'
import type { IEmailVerifier } from './verifier'

export class ThrowableEmailVerifierDecorator implements IEmailVerifier {
    constructor(private readonly emailVerifier: IEmailVerifier) {}

    verify: (emailVerificationRequest: EmailVerificationRequest) => Promise<EmailVerificationResult> =
        async emailVerificationRequest => {
            const emailVerificationResult = await this.emailVerifier.verify(emailVerificationRequest)
            const { email, exists } = emailVerificationResult

            if (exists !== true) {
                throw new Error(`The email ${email} doesn't exist`)
            }

            return emailVerificationResult
        }
}

export class PersistenceEmailVerifierDecorator implements IEmailVerifier {
    constructor(
        private readonly emailVerifier: IEmailVerifier,
        private readonly emailVerificationRepository: EmailVerificationRepository,
    ) {}

    verify: (emailVerificationRequest: EmailVerificationRequest) => Promise<EmailVerificationResult> =
        async emailVerificationRequest => {
            const emailVerificationResult = await this.emailVerifier.verify(emailVerificationRequest)
            await this.emailVerificationRepository.save(emailVerificationResult)
            return emailVerificationResult
        }
}
