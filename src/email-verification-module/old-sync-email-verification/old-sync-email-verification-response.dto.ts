import { EmailPatternEnum, EmailVerificationReason } from '../../common'
import { Expose, Transform } from 'class-transformer'
import {
    transformCatchAll,
    transformDeliveryStatus,
    transformVerifiedAt,
} from './old-sync-email-verification-response.util'
import { OldEmailVerificationResponse } from './old-sync-email-verification-response.interface'
import { IsDateString, IsEmail, IsEnum, IsFQDN } from 'class-validator'
import { CatchAllStatus, DeliveryStatus } from './old-email-verification.enums'

export class OldSyncEmailVerificationResponseDto implements OldEmailVerificationResponse {
    @Expose()
    @IsEmail()
    email: string

    @Expose()
    @IsFQDN()
    domain: string

    @Expose()
    localPart: string

    @Expose()
    @Transform(transformDeliveryStatus)
    @IsEnum(DeliveryStatus)
    deliveryStatus: DeliveryStatus

    @Expose()
    @Transform(transformCatchAll, { toClassOnly: true })
    @IsEmail()
    catchAll: CatchAllStatus

    @Expose()
    @IsEnum(EmailVerificationReason)
    reason: EmailVerificationReason

    @Expose()
    @IsFQDN()
    targetExchange?: string

    @Expose()
    @IsFQDN()
    mxDomain?: string

    @Expose()
    @IsEnum(EmailPatternEnum)
    format?: EmailPatternEnum

    @Expose()
    @Transform(transformVerifiedAt, { toClassOnly: true })
    @IsDateString()
    verifiedAt: string
}
