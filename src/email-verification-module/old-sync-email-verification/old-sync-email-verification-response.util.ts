import { plainToInstance, TransformFnParams } from 'class-transformer'
import { EmailVerificationResponseDto } from '../sync-email-verification'
import { CatchAllStatus, DeliveryStatus } from './old-email-verification.enums'

export function transformDeliveryStatus({ obj }: TransformFnParams): DeliveryStatus {
    const { exists } = plainToInstance(EmailVerificationResponseDto, obj)

    switch (exists) {
        case true:
            return DeliveryStatus.Accepted
        case false:
            return DeliveryStatus.Rejected
        case null:
            return DeliveryStatus.NotProcessed
    }
}

export function transformCatchAll({ obj }: TransformFnParams): CatchAllStatus {
    const { catchAll } = plainToInstance(EmailVerificationResponseDto, obj)

    switch (catchAll) {
        case true:
            return CatchAllStatus.Enabled
        case false:
            return CatchAllStatus.Disabled
        case null:
            return CatchAllStatus.Unknown
    }
}

export function transformVerifiedAt({ obj }: TransformFnParams): string {
    const { createdAt } = plainToInstance(EmailVerificationResponseDto, obj)
    return createdAt.toISOString()
}
