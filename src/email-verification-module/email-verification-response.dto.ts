import { Expose } from 'class-transformer'
import {
    EmailPatternEnum,
    EmailVerificationReason,
    EmailVerificationSource,
    IEmailVerificationResponseDto,
} from '../common'

export class EmailVerificationResponseDto implements IEmailVerificationResponseDto {
    @Expose()
    id: string

    @Expose()
    email: string

    @Expose()
    domain: string

    @Expose()
    localPart: string

    @Expose()
    format?: EmailPatternEnum

    @Expose()
    exists: boolean | null

    @Expose()
    catchAll: boolean | null

    @Expose()
    reason: EmailVerificationReason

    @Expose()
    sources: EmailVerificationSource[]

    @Expose()
    mxDomain?: string

    @Expose()
    targetExchange?: string
}
