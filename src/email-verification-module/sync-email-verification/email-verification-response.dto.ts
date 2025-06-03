import { Expose } from 'class-transformer'
import {
    EmailPatternEnum,
    EmailVerificationReason,
    EmailVerificationSource,
    IEmailVerificationResponseDto,
} from '../../common'
import { IsEmail, IsFQDN } from 'class-validator'

export class EmailVerificationResponseDto implements IEmailVerificationResponseDto {
    @Expose()
    @IsEmail()
    email: string

    @Expose()
    localPart: string

    @Expose()
    @IsFQDN()
    domain: string

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
    @IsFQDN()
    mxDomain?: string

    @Expose()
    @IsFQDN()
    targetExchange?: string

    @Expose({ toClassOnly: true })
    createdAt: Date
}
