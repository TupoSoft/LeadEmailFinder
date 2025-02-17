import {
    type EmailVerificationRequest,
    type EmailVerificationResponse,
    ExistenceStatus,
    type ExistenceStrategy,
} from './dto'
import type { EmailVerificationResult, EmailVerifier } from './email-verifier'

export interface IEmailVerificationRunner {
    verify: (emailVerificationRequest: EmailVerificationRequest) => Promise<EmailVerificationResponse>
}

export class EmailVerificationRunner implements IEmailVerificationRunner {
    constructor(
        private readonly emailVerifiers: Record<string, EmailVerifier>,
        private readonly existenceStrategies: ExistenceStrategy[],
    ) {}

    async verify(emailVerificationRequest: EmailVerificationRequest): Promise<EmailVerificationResponse> {
        const { email, format } = emailVerificationRequest
        const [localPart, domain] = email.split('@')
        const results: Record<string, EmailVerificationResult> = {}

        const promises = Object.entries(this.emailVerifiers).map(async ([name, verifier]) => {
            results[name] = await verifier.verify(email)
        })

        await Promise.allSettled(promises)

        return {
            checkedAt: new Date().toISOString(),
            status: this.determineExistence(results),
            sources: results,
            domain,
            username: localPart,
            email,
            format,
        }
    }

    private determineExistence(results: Record<string, EmailVerificationResult>): ExistenceStatus {
        const matchingStrategy = this.existenceStrategies.find(strategy => strategy.predicate(results))
        return matchingStrategy !== undefined ? matchingStrategy.action(results) : ExistenceStatus.Unknown
    }
}
