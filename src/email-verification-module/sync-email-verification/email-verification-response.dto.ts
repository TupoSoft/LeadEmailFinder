import { Expose } from 'class-transformer'
import {
    EmailPatternEnum,
    EmailVerificationReason,
    EmailVerificationSource,
    IEmailVerificationResponseDto,
} from '../../common'
import { IsEmail, IsFQDN } from 'class-validator'
import { AutoMap } from '@automapper/classes'

export class EmailVerificationResponseDto implements IEmailVerificationResponseDto {
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
    sources: EmailVerificationSource[]

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
