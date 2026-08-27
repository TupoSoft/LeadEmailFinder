import { EmailPatternEnum, EmailVerificationReason } from '@tuposoft/lead-email-finder/common'
import { Expose } from 'class-transformer'
import { OldEmailVerificationResponse } from './old-sync-email-verification-response.interface'
import { IsDateString, IsEmail, IsEnum, IsFQDN } from 'class-validator'
import { CatchAllStatus, DeliveryStatus } from './old-email-verification.enums'
import { AutoMap } from '@automapper/classes'

export class OldSyncEmailVerificationResponseDto implements OldEmailVerificationResponse {
    @Expose()
    @IsEmail()
    @AutoMap()
    email: string

    @Expose()
    @IsFQDN()
    @AutoMap()
    domain: string

    @Expose()
    @AutoMap()
    localPart: string

    @Expose()
    @IsEnum(DeliveryStatus)
    @AutoMap()
    deliveryStatus: DeliveryStatus

    @Expose()
    @IsEmail()
    @AutoMap()
    catchAll: CatchAllStatus

    @Expose()
    @IsEnum(EmailVerificationReason)
    @AutoMap()
    reason: EmailVerificationReason

    @Expose()
    @IsFQDN()
    @AutoMap()
    targetExchange?: string

    @Expose()
    @IsFQDN()
    @AutoMap()
    mxDomain?: string

    @Expose()
    @IsEnum(EmailPatternEnum)
    @AutoMap()
    format?: EmailPatternEnum

    @Expose()
    @IsDateString()
    @AutoMap()
    verifiedAt: string
}
