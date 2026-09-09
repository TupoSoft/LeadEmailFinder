import { EmailPatternEnum, EmailVerificationReadSource, EmailVerificationReason } from '@tuposoft/lead-email-finder/common'
import { VerificationQuality } from './verification-evidence'

export interface EmailVerification {
    organizationId: string
    id: string
    email: string
    domain: string
    localPart: string
    format?: EmailPatternEnum
    targetExchange?: string
    mxDomain?: string
    exists: boolean | null
    catchAll: boolean | null
    reason: EmailVerificationReason
    sources: EmailVerificationReadSource[]
    createdAt: Date
    batchId?: string
    verificationQuality: VerificationQuality
    evidenceObservedAt: Date | null
    evidencePolicyVersion: number
}

export type NewEmailVerification = Omit<EmailVerification, 'id' | 'organizationId' | 'createdAt'>

export type OwnedEmailVerification = Omit<EmailVerification, 'organizationId'>
