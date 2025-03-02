import type { EMAIL_VERIFICATION_SOURCES } from './constants'
import type { CatchAllStatus, DeliveryStatus } from './enums'
import type { EmailPattern } from '../email/enums'

export interface EmailVerificationRequest {
    email: string
    format?: EmailPattern
}

export enum EmailVerificationReasonEnum {
    AcceptedEmail = 'accepted_email',
    RejectedEmail = 'rejected_email',
    Timeout = 'timeout',
    TemporarilyBlocked = 'temporarily_blocked',
    NoMxRecords = 'no_mx_records',
    UnexpectedError = 'unexpected_error',
    Blocked = 'blacklisted',
    Unknown = 'unknown',
    NoConnect = 'no_connect',
    ExceededStorage = 'exceeded_storage',
}

export type EmailVerificationReason = `${EmailVerificationReasonEnum}`

export interface CreateEmailVerification {
    email: string
    domain: string
    localPart: string
    sources: EmailVerificationSource[]
    exists: boolean | null
    deliveryStatus: DeliveryStatus
    catchAll: CatchAllStatus
    reason: EmailVerificationReason
    format?: EmailPattern
    mxDomain?: string
    targetExchange?: string
}

export interface UpdateEmailVerification {
    sources: EmailVerificationSource[]
    exists: boolean | null
    catchAll: CatchAllStatus
    reason: EmailVerificationReason
    format?: EmailPattern
    mxDomain?: string
    targetExchange?: string
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
    reason: EmailVerificationReason
    targetExchange?: string
    verifiedAt?: string
}

export type EmailVerificationSource = (typeof EMAIL_VERIFICATION_SOURCES)[number]
