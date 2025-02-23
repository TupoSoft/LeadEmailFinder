import type { EMAIL_VERIFICATION_SOURCES } from './constants'
import type { CatchAllStatus, DeliveryStatus } from './enums'
import type { EmailPattern } from '../email/enums'

export interface EmailVerificationRequest {
    email: string
    format?: EmailPattern
    throwIfNonexistent?: boolean
}

export interface EmailVerificationResult {
    id?: string
    email: string
    domain: string
    localPart: string
    format?: EmailPattern
    mxDomain?: string
    sources: EmailVerificationSource[]
    exists: boolean | null
    deliveryStatus: DeliveryStatus
    catchAll: CatchAllStatus
    targetExchange?: string
    verifiedAt?: string
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
