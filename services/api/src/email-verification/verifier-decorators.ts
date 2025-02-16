import type { EmailVerificationRequest, EmailVerificationResponse } from './dto'
import type { EmailVerificationRepository } from './repository'
import type { IEmailVerificationRunner } from './verifier'

export class ThrowableEmailVerifierDecorator implements IEmailVerificationRunner {
    constructor(private readonly emailVerifier: IEmailVerificationRunner) {}

    verify: (emailVerificationRequest: EmailVerificationRequest) => Promise<EmailVerificationResponse> =
        async emailVerificationRequest => {
            const emailVerificationResult = await this.emailVerifier.verify(emailVerificationRequest)
            const { email, exists } = emailVerificationResult

            if (exists !== true) {
                throw new Error(`The email ${email} doesn't exist`)
            }

            return emailVerificationResult
        }
}

export class PersistenceEmailVerifierDecorator implements IEmailVerificationRunner {
    constructor(
        private readonly emailVerifier: IEmailVerificationRunner,
        private readonly emailVerificationRepository: EmailVerificationRepository,
    ) {}

    verify: (emailVerificationRequest: EmailVerificationRequest) => Promise<EmailVerificationResponse> =
        async emailVerificationRequest => {
            const emailVerificationResult = await this.emailVerifier.verify(emailVerificationRequest)
            await this.emailVerificationRepository.save(emailVerificationResult)
            return emailVerificationResult
        }
}
