import type { IEmailVerificationResponseDto } from '@tuposoft/lead-email-finder/common'

export const ASYNC_VERIFICATION_JOBS = Symbol('AsyncVerificationJobs')

export interface AsyncVerificationJobData {
    email: string
    organizationId: string
    credentialId: string
}

export interface AsyncVerificationJob {
    organizationId: string
    readStatus(): Promise<{ state: string; result?: IEmailVerificationResponseDto }>
}

export interface AsyncVerificationJobs {
    enqueue(data: AsyncVerificationJobData, jobId: string): Promise<{ id?: string }>
    find(id: string): Promise<AsyncVerificationJob | undefined>
}
