import type { CatchAllVerificationSource } from './catch-all-verifier'

export interface EmailVerificationRequest {
    email: string
    format?: string
}

export interface EmailVerificationResult {
    email: string
    domain: string
    localPart: string
    format?: string
    error?: string
    mxDomain?: string
    sources: EmailVerificationSource[]
    exists: boolean | null
    targetExchange?: string
    isDisposable: boolean,
    isFree: boolean,
    verifiedAt?: Date
}

export type EmailVerificationSource = CatchAllVerificationSource | 'SMTP'
