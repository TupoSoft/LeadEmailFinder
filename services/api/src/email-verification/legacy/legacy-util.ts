import type { LegacyEmailVerificationResult } from './dto'
import { type EmailVerificationResponse, ExistenceStatus } from '../dto'
import { CatchAllStatus, DeliveryStatus } from './enums'
import type { SMTPVerificationResult } from '../../smtp/dto'

function mapCatchAllStatus(catchAllStatus?: boolean): CatchAllStatus {
    if (catchAllStatus === undefined) {
        return CatchAllStatus.Unknown
    } else {
        return catchAllStatus ? CatchAllStatus.Enabled : CatchAllStatus.Disabled
    }
}

function mapDeliveryStatus(exists: ExistenceStatus): DeliveryStatus {
    switch (exists) {
        case ExistenceStatus.Exists:
            return DeliveryStatus.Accepted
        case ExistenceStatus.DoesNotExist:
            return DeliveryStatus.Rejected
        case ExistenceStatus.Unknown:
            return DeliveryStatus.NotProcessed
    }
}

export function toLegacyResult({
    email,
    username,
    domain,
    sources,
    status,
    checkedAt,
}: EmailVerificationResponse): LegacyEmailVerificationResult {
    const mxData = sources.mx as SMTPVerificationResult
    const { catchAll, mxRecord } = mxData
    const catchAllStatus = mapCatchAllStatus(catchAll)
    const deliveryStatus = mapDeliveryStatus(status)

    return {
        catchAll: catchAllStatus,
        deliveryStatus,
        verifiedAt: checkedAt !== '' ? new Date(checkedAt) : new Date(),
        email,
        localPart: username,
        domain,
        targetExchange: mxRecord,
    }
}
