import type { EMAIL_VERIFICATION_SOURCES } from './constants'

export interface EmailVerificationRequest {
    email: string
    format?: string
}

export interface EmailVerificationResult {
    email: string
    domain: string
    localPart: string
    format?: string
    mxDomain?: string
    sources: EmailVerificationSource[]
    exists: boolean | null
    targetExchange?: string
    verifiedAt?: Date
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
