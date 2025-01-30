import type { EmailVerificationResult, EmailVerificationSource, LegacyEmailVerificationResult } from './dto'
import { CatchAllStatus, DeliveryStatus } from './enums'
import { isEmptyArray } from '../common'

function mapCatchAllStatus(sources: EmailVerificationSource[]): CatchAllStatus {
    if (isEmptyArray(sources)) {
        return CatchAllStatus.Unknown
    } else if (sources.includes('SMTP')) {
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
