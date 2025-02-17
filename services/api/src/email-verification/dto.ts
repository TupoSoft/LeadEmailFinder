import type { EMAIL_VERIFICATION_SOURCES } from './constants'
import type { EmailVerificationResult } from './email-verifier'

export interface EmailVerificationRequest {
    email: string
    format?: string
}

export const enum ExistenceStatus {
    Exists = 'exists',
    DoesNotExist = 'does_not_exist',
    Unknown = 'unknown',
}

export interface EmailVerificationResponse {
    email: string
    domain: string
    username: string
    format?: string
    sources: Record<string, EmailVerificationResult>
    status: ExistenceStatus
    checkedAt: string
}

export type EmailVerificationSource = (typeof EMAIL_VERIFICATION_SOURCES)[number]

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
