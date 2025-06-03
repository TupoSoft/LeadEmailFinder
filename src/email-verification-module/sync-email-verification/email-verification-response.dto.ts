import { Expose } from 'class-transformer'
import {
    EmailPatternEnum,
    EmailVerificationReason,
    EmailVerificationSource,
    IEmailVerificationResponseDto,
} from '../../common'
import { AutoMap } from '@automapper/classes'

export class EmailVerificationResponseDto implements IEmailVerificationResponseDto {
    @Expose()
    @AutoMap()
    id: string

    @Expose()
    @AutoMap()
    email: string

    @Expose()
    @AutoMap()
    domain: string

    @Expose()
    @AutoMap()
    localPart: string

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
    mxDomain?: string

    @Expose()
    @AutoMap()
    targetExchange?: string
}
