import type { EMAIL_VERIFICATION_SOURCES } from './constants'
import type { EmailVerificationResult } from './email-verifier'

export interface EmailVerificationRequest {
    email: string
    format?: string
}

export interface EmailVerificationResponse {
    email: string
    domain: string
    localPart: string
    format?: string
    sources: Record<string, EmailVerificationResult>
    exists: boolean | null
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
