import type { CatchAllVerificationSource } from './catch-all-verifier'
import type { CatchAllStatus, DeliveryStatus } from './enums'

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

export type EmailVerificationSource = CatchAllVerificationSource | 'SMTP'

export interface VerifyEmailBulkResponse {
    message: string
    taskId: string
    monitorUrl: string
}

export interface VerifyEmailBulkStatusResponse {
    status: string
}

export interface LegacyEmailVerificationResult {
    email: string
    localPart: string
    domain: string
    targetExchange?: string
    verifiedAt: Date
    deliveryStatus: DeliveryStatus
    catchAll: CatchAllStatus
}
