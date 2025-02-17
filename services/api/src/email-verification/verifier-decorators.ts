import { type EmailVerificationRequest, type EmailVerificationResponse, ExistenceStatus } from './dto'
import type { EmailVerificationRepository } from './repository'
import type { IEmailVerificationRunner } from './runner'

export class ThrowableEmailVerifierDecorator implements IEmailVerificationRunner {
    constructor(private readonly emailVerifier: IEmailVerificationRunner) {}

    verify: (emailVerificationRequest: EmailVerificationRequest) => Promise<EmailVerificationResponse> =
        async emailVerificationRequest => {
            const emailVerificationResult = await this.emailVerifier.verify(emailVerificationRequest)
            const { email, status } = emailVerificationResult

            if (status !== ExistenceStatus.Exists) {
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
