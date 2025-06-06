import type { EMAIL_VERIFICATION_SOURCES } from './constants'

export interface EmailVerificationRequest {
    email: string
}

export interface EmailVerificationResult {
    id?: string
    email: string
    domain: string
    localPart: string
    mxDomain?: string
    sources: EmailVerificationSource[]
    exists: boolean | null
    catchAll: boolean | null
    targetExchange?: string
    verifiedAt?: string
}

export type EmailVerificationSource = (typeof EMAIL_VERIFICATION_SOURCES)[number]
