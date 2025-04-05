import type { EmailPattern } from '../email/enums'
import { CatchAllStatus, DeliveryStatus } from './enums'
import type { EmailVerificationReason, EmailVerificationResult } from './dto'

export interface VerifyEmailOldViewModel {
    email: string
    domain: string
    localPart: string
    deliveryStatus: DeliveryStatus
    catchAll: CatchAllStatus
    reason: EmailVerificationReason
    verifiedAt: string
    targetExchange?: string
    mxDomain?: string
    format?: EmailPattern
}

function booleanToCatchAllStatus(catchAllEnabled: boolean | null): CatchAllStatus {
    switch (catchAllEnabled) {
        case true:
            return CatchAllStatus.Enabled
        case false:
            return CatchAllStatus.Disabled
        case null:
            return CatchAllStatus.Unknown
    }
}

function booleanToDeliveryStatus(exists: boolean | null): DeliveryStatus {
    switch (exists) {
        case true:
            return DeliveryStatus.Accepted
        case false:
            return DeliveryStatus.Rejected
        case null:
            return DeliveryStatus.NotProcessed
    }
}

export function presentVerifyEmailOld({
    email,
    domain,
    localPart,
    exists,
    reason,
    verifiedAt,
    targetExchange,
    format,
    mxDomain,
    catchAll,
}: EmailVerificationResult): VerifyEmailOldViewModel {
    return {
        email,
        domain,
        localPart,
        targetExchange,
        mxDomain,
        reason,
        verifiedAt: verifiedAt?.toString() ?? new Date().toISOString(),
        format,
        catchAll: booleanToCatchAllStatus(catchAll),
        deliveryStatus: booleanToDeliveryStatus(exists),
    }
}
