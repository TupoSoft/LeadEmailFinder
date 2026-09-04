import { Expose } from 'class-transformer'
import {
    EmailPatternEnum,
    EmailVerificationReadSource,
    EmailVerificationReason,
    IEmailVerificationResponseDto,
} from '@tuposoft/lead-email-finder/common'
import { IsEmail, IsFQDN, IsUUID } from 'class-validator'
import { AutoMap } from '@automapper/classes'

export class EmailVerificationResponseDto implements IEmailVerificationResponseDto {
    @Expose()
    @IsUUID()
    @AutoMap()
    id: string

    @Expose()
    @IsEmail()
    @AutoMap()
    email: string

    @Expose()
    @AutoMap()
    localPart: string

    @Expose()
    @AutoMap()
    @IsFQDN()
    domain: string

    @Expose()
    @AutoMap(() => String)
    format?: EmailPatternEnum

    @Expose()
    @AutoMap(() => Boolean)
    exists: boolean | null

    @Expose()
    @AutoMap(() => Boolean)
    catchAll: boolean | null

    @Expose()
    @AutoMap(() => String)
    reason: EmailVerificationReason

    @Expose()
    @AutoMap(() => [String])
    sources: EmailVerificationReadSource[]

    @Expose()
    @AutoMap()
    @IsFQDN()
    mxDomain?: string

    @Expose()
    @AutoMap()
    @IsFQDN()
    targetExchange?: string

    @Expose({ toClassOnly: true })
    @AutoMap()
    createdAt: Date
}
