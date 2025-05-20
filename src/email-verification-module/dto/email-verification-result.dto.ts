import { Expose } from 'class-transformer'
import { EmailVerificationReason, EmailVerificationSource } from '../enums'
import { EmailPatternEnum } from '../../common'

export class EmailVerificationResultDto {
    @Expose()
    email: string

    @Expose()
    domain: string

    @Expose()
    localPart: string

    @Expose()
    format?: EmailPatternEnum

    @Expose()
    mxDomain?: string

    @Expose()
    targetExchange?: string

    @Expose()
    sources: EmailVerificationSource[]

    @Expose()
    exists: boolean | null

    @Expose()
    catchAll: boolean | null

    reason: EmailVerificationReason
}
