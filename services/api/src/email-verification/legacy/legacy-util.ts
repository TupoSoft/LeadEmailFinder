import type { LegacyEmailVerificationResult } from './dto'
import type { EmailVerificationResponse } from '../dto'
import { CatchAllStatus, DeliveryStatus } from './enums'
import type { SMTPVerificationResult } from '../../smtp/dto'

function mapCatchAllStatus(catchAllStatus?: boolean): CatchAllStatus {
    if (catchAllStatus === undefined) {
        return CatchAllStatus.Unknown
    } else {
        return catchAllStatus ? CatchAllStatus.Enabled : CatchAllStatus.Disabled
    }
}

function mapDeliveryStatus(exists: boolean | null): DeliveryStatus {
    if (exists === null) {
        return DeliveryStatus.NotProcessed
    } else if (exists) {
        return DeliveryStatus.Accepted
    } else {
        return DeliveryStatus.Rejected
    }
}

export function toLegacyResult({
    email,
    localPart,
    domain,
    sources,
    exists,
    checkedAt,
}: EmailVerificationResponse): LegacyEmailVerificationResult {
    const mxData = sources.mx as SMTPVerificationResult
    const { catchAll, targetExchange } = mxData
    const catchAll = mapCatchAllStatus(catchAll)
    const deliveryStatus = mapDeliveryStatus(exists)

    return {
        catchAll,
        deliveryStatus,
        verifiedAt: checkedAt !== '' ? new Date(checkedAt) : new Date(),
        email,
        localPart,
        domain,
        targetExchange,
    }
}
