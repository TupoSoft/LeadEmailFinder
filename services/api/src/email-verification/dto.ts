import type { EmailVerificationResult } from './email-verifier'

export interface EmailVerificationRequest {
    readonly email: string
    readonly format?: string
}

export const enum ExistenceStatus {
    Exists = 'exists',
    DoesNotExist = 'does_not_exist',
    Unknown = 'unknown',
}

export interface EmailVerificationResponse {
    readonly email: string
    readonly domain: string
    readonly username: string
    readonly format?: string
    readonly verificationResults: Record<string, EmailVerificationResult>
    readonly status: ExistenceStatus
    readonly checkedAt: Date
}

export interface VerifyEmailBulkResponse {
    message: string
    taskId: string
    monitorUrl: string
}

export interface VerifyEmailBulkStatusResponse {
    status: string
}

export interface ExistenceStrategy {
    predicate: (results: Record<string, EmailVerificationResult>) => boolean
    action: (results: Record<string, EmailVerificationResult>) => ExistenceStatus
}
