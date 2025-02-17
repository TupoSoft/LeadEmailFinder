import type { IEmailVerificationRunner } from './runner'
import type { EmailVerificationRepository } from './repository'
import type {
    EmailVerificationRequest,
    EmailVerificationResponse,
    VerifyEmailBulkResponse,
    VerifyEmailBulkStatusResponse,
} from './dto'
import type { EmailPatternUsage } from '../domain'
import type { EmailVerificationQueue } from './queue'
import { VERIFY_EMAIL_BULK_STATUS_ROUTE } from './constants'

export interface IEmailVerificationService {
    verify: (emailVerificationRequest: EmailVerificationRequest) => Promise<EmailVerificationResponse>

    verifyBulk: (emails: string[]) => Promise<VerifyEmailBulkResponse>

    getVerifyBulkStatus: (id: string) => Promise<VerifyEmailBulkStatusResponse>

    getVerifyBulkResult: (id: string) => Promise<EmailVerificationResponse[]>
}

export class EmailVerificationService implements IEmailVerificationService {
    constructor(
        private readonly emailVerifier: IEmailVerificationRunner,
        private readonly emailVerificationRepository: EmailVerificationRepository,
        private readonly emailVerificationQueue: EmailVerificationQueue,
    ) {}

    async verify(emailVerificationRequest: EmailVerificationRequest): Promise<EmailVerificationResponse> {
        return await this.emailVerifier.verify(emailVerificationRequest)
    }

    async verifyBulk(emails: string[]): Promise<VerifyEmailBulkResponse> {
        const taskId = await this.emailVerificationQueue.addJob('verifyBulk', emails)

        return {
            taskId,
            message: 'Request accepted. Starting to find emails.',
            monitorUrl: VERIFY_EMAIL_BULK_STATUS_ROUTE.replace(':id', taskId),
        }
    }

    async getVerifyBulkStatus(id: string): Promise<VerifyEmailBulkStatusResponse> {
        const status = await this.emailVerificationQueue.getStatus(id)

        return {
            status,
        }
    }

    async getVerifyBulkResult(id: string): Promise<EmailVerificationResponse[]> {
        return await this.emailVerificationQueue.getResult(id)
    }

    async aggregateEmailPatternUsageForDomain(domain: string): Promise<EmailPatternUsage[]> {
        return await this.emailVerificationRepository.aggregateEmailPatternUsageForDomain(domain)
    }
}
