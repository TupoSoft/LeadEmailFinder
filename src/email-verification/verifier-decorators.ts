import type { ICatchAllVerifier } from './catch-all-verifier'
import type { Logger } from '../logging'
import type { EmailVerificationRequest, EmailVerificationResult } from './dto'
import { isNativeError } from 'node:util/types'
import type { EmailVerificationRepository } from './repository'
import type { EmailVerifier } from './verifier'

export class CatchAllEmailVerifierDecorator implements EmailVerifier {
    constructor(
        private readonly emailVerifier: EmailVerifier,
        private readonly catchAllVerifier: ICatchAllVerifier,
        private readonly logger: Logger,
    ) {}

    verify: (emailVerificationRequest: EmailVerificationRequest) => Promise<EmailVerificationResult> =
        async emailVerificationRequest => {
            const emailVerificationResult = await this.emailVerifier.verify(emailVerificationRequest)
            const { email, exists } = emailVerificationResult

            try {
                if (exists === null) {
                    const { source, success } = await this.catchAllVerifier.tryAll(email)
                    emailVerificationResult.sources.push(source)
                    emailVerificationResult.exists = success
                }
            } catch (error) {
                const errorMessage = `${email} catch-all verification failed`

                if (isNativeError(error)) {
                    this.logger.error(`${errorMessage}: ${error}`)
                } else {
                    this.logger.error(errorMessage)
                }
            }

            return emailVerificationResult
        }
}

export class ThrowableEmailVerifierDecorator implements EmailVerifier {
    constructor(private readonly emailVerifier: EmailVerifier) {}

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

export class PersistenceEmailVerifierDecorator implements EmailVerifier {
    constructor(
        private readonly emailVerifier: EmailVerifier,
        private readonly emailVerificationRepository: EmailVerificationRepository,
    ) {}

    verify: (emailVerificationRequest: EmailVerificationRequest) => Promise<EmailVerificationResult> =
        async emailVerificationRequest => {
            const emailVerificationResult = await this.emailVerifier.verify(emailVerificationRequest)
            await this.emailVerificationRepository.save(emailVerificationResult)
            return emailVerificationResult
        }
}
