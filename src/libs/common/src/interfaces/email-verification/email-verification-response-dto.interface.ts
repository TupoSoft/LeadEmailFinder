import { EmailPatternEnum, EmailVerificationReason, EmailVerificationSource } from '../../enums'

// Retained only so rows written by older synchronized development databases remain readable.
export type EmailVerificationReadSource = EmailVerificationSource | 'linkedin'

export interface IEmailVerificationResponseDto {
    email: string

    domain: string

    localPart: string

    format?: EmailPatternEnum

    mxDomain?: string

    targetExchange?: string

    sources: EmailVerificationReadSource[]

    exists: boolean | null

    catchAll: boolean | null

    reason: EmailVerificationReason

    createdAt: Date
}
