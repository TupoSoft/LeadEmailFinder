import { Expose } from 'class-transformer'
import {
    EmailPatternEnum,
    EmailVerificationReadSource,
    EmailVerificationReason,
    IEmailVerificationResponseDto,
} from '@tuposoft/lead-email-finder/common'
import { IsEmail, IsFQDN, IsUUID } from 'class-validator'

export class EmailVerificationResponseDto implements IEmailVerificationResponseDto {
    @Expose()
    @IsUUID()
    id: string

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
    sources: EmailVerificationReadSource[]

    @Expose()
    @IsFQDN()
    mxDomain?: string

    @Expose()
    @IsFQDN()
    targetExchange?: string

    @Expose({ toClassOnly: true })
    createdAt: Date
}
