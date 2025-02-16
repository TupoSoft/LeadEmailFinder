import type { EmailVerificationRequest, EmailVerificationResponse } from './dto'
import type { EmailVerificationResult, EmailVerifier } from './email-verifier'

export interface IEmailVerificationRunner {
    verify: (emailVerificationRequest: EmailVerificationRequest) => Promise<EmailVerificationResponse>
}

export class EmailVerificationRunner implements IEmailVerificationRunner {
    constructor(private readonly emailVerifiers: Record<string, EmailVerifier>) {}

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
            exists: Object.values(results).some(result => result.success),
            sources: results,
            domain,
            localPart,
            email,
            format,
        }
    }
}
