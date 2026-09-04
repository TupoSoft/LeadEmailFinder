import { EmailPatternEnum, EmailVerificationReadSource, EmailVerificationReason } from '@tuposoft/lead-email-finder/common'

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
}

export type NewEmailVerification = Omit<EmailVerification, 'id' | 'organizationId' | 'createdAt'>

export type OwnedEmailVerification = Omit<EmailVerification, 'organizationId'>
