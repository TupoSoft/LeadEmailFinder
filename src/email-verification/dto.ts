import type { EMAIL_VERIFICATION_SOURCES } from './constants'
import type { EmailPattern } from '../email/enums'
import type { SmtpVerificationReasonEnum } from '../smtp/dto'

export interface EmailVerificationRequest {
    email: string
    format?: EmailPattern
}

export type EmailVerificationReason = `${SmtpVerificationReasonEnum}` | 'webmail' | 'unknown'

export interface EmailVerificationResult {
    id?: string
    email: string
    domain: string
    localPart: string
    format?: EmailPattern
    mxDomain?: string
    sources: EmailVerificationSource[]
    exists: boolean | null
    catchAll: boolean | null
    reason: EmailVerificationReason
    targetExchange?: string
    verifiedAt?: string
}

export type EmailVerificationSource = (typeof EMAIL_VERIFICATION_SOURCES)[number]
