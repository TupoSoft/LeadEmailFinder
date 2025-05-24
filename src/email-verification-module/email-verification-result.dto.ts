import { Expose } from 'class-transformer'
import {
    EmailPatternEnum,
    EmailVerificationReason,
    EmailVerificationSource,
    IEmailVerificationResultDto,
} from '../common'

export class EmailVerificationResultDto implements IEmailVerificationResultDto {
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

    @Expose()
    reason: EmailVerificationReason
}
