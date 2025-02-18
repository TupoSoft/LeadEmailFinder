import type { LegacyEmailVerificationResult } from './dto'
import { type EmailVerificationResponse, ExistenceStatus } from '../dto'
import { DeliveryStatus } from './enums'
import { CatchAllStatus, type SMTPVerificationResult } from '../../smtp/dto'

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
    verificationResults,
    status,
    checkedAt,
}: EmailVerificationResponse): LegacyEmailVerificationResult {
    const mxData = verificationResults.mx as SMTPVerificationResult
    const { catchAll, mxRecord } = mxData
    const deliveryStatus = mapDeliveryStatus(status)

    return {
        catchAll: catchAll ?? CatchAllStatus.Unknown,
        deliveryStatus,
        verifiedAt: new Date(checkedAt),
        email,
        localPart: username,
        domain,
        targetExchange: mxRecord,
    }
}
