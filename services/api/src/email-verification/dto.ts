import type { EMAIL_VERIFICATION_SOURCES } from './constants'
import type { CatchAllStatus, DeliveryStatus } from './enums'

export interface EmailVerificationRequest {
    email: string
    format?: string
}

export interface EmailVerificationResult {
    id?: string
    email: string
    domain: string
    localPart: string
    format?: string
    mxDomain?: string
    sources: EmailVerificationSource[]
    exists: boolean | null
    deliveryStatus: DeliveryStatus
    catchAll: CatchAllStatus
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
