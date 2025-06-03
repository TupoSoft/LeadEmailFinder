import { EmailPatternEnum, EmailVerificationReason, EmailVerificationSource } from '../../enums'

export interface IEmailVerificationResponseDto {
    email: string

    domain: string

    localPart: string

    format?: EmailPatternEnum

    mxDomain?: string

    targetExchange?: string

    sources: EmailVerificationSource[]

    exists: boolean | null

    catchAll: boolean | null

    reason: EmailVerificationReason

    createdAt: Date
}
