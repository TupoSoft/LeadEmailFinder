import type { LegacyEmailVerificationResult } from './dto'
import { isEmptyArray } from '../../common'
import type { EmailVerificationResult, EmailVerificationSource } from '../dto'
import { CatchAllStatus, DeliveryStatus } from './enums'

function mapCatchAllStatus(sources: EmailVerificationSource[]): CatchAllStatus {
    if (isEmptyArray(sources)) {
        return CatchAllStatus.Unknown
    } else if (sources.includes('mx')) {
        return CatchAllStatus.Disabled
    } else {
        return CatchAllStatus.Enabled
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
    targetExchange,
    verifiedAt,
}: EmailVerificationResult): LegacyEmailVerificationResult {
    const catchAll = mapCatchAllStatus(sources)
    const deliveryStatus = mapDeliveryStatus(exists)

    return {
        catchAll,
        deliveryStatus,
        verifiedAt: verifiedAt ?? new Date(),
        email,
        localPart,
        domain,
        targetExchange,
    }
}
