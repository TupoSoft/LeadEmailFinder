import type { IEmailVerifier } from './verifier'
import type { EmailVerificationRepository } from './repository'
import type {
    EmailVerificationRequest,
    EmailVerificationResult,
    VerifyEmailBulkResponse,
    VerifyEmailBulkStatusResponse,
} from './dto'
import type { EmailPatternUsage } from '../domain'
import type { EmailVerificationQueue } from './queue'
import { API_PREFIX } from '../common'
import { VERIFY_EMAIL_BULK_STATUS_ROUTE } from './constants'

export class EmailVerificationService {
    constructor(
        private readonly emailVerifier: IEmailVerifier,
        private readonly emailVerificationRepository: EmailVerificationRepository,
        private readonly emailVerificationQueue: EmailVerificationQueue,
    ) {}

    async verify(emailVerificationRequest: EmailVerificationRequest): Promise<EmailVerificationResult> {
        return await this.emailVerifier.verify(emailVerificationRequest)
    }

    async verifyBulk(emails: string[]): Promise<VerifyEmailBulkResponse> {
        const taskId = await this.emailVerificationQueue.addJob('verifyBulk', emails)

        return {
            taskId,
            message: 'Request accepted. Starting to find emails.',
            monitorUrl: `${API_PREFIX}${VERIFY_EMAIL_BULK_STATUS_ROUTE.replace(':id', taskId)}`,
        }
    }

    async findBulkStatus(id: string): Promise<VerifyEmailBulkStatusResponse> {
        const status = await this.emailVerificationQueue.getStatus(id)

        return {
            status,
        }
    }

    async getFindBulkResult(id: string): Promise<EmailVerificationResult[]> {
        return await this.emailVerificationQueue.getResult(id)
    }

    async aggregateEmailPatternUsageForDomain(domain: string): Promise<EmailPatternUsage[]> {
        return await this.emailVerificationRepository.aggregateEmailPatternUsageForDomain(domain)
    }
}
