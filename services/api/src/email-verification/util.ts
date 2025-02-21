import { CatchAllStatus, DeliveryStatus } from './enums'

export function booleanToCatchAllStatus(catchAllEnabled: boolean | null): CatchAllStatus {
    switch (catchAllEnabled) {
        case true:
            return CatchAllStatus.Enabled
        case false:
            return CatchAllStatus.Disabled
        case null:
            return CatchAllStatus.Unknown
    }
}

export function catchAllStatusToBoolean(catchAll: CatchAllStatus): boolean | null {
    switch (catchAll) {
        case CatchAllStatus.Enabled:
            return true
        case CatchAllStatus.Disabled:
            return false
        case CatchAllStatus.Unknown:
            return null
    }
}

export function existsToDeliveryStatus(exists: boolean | null): DeliveryStatus {
    switch (exists) {
        case true:
            return DeliveryStatus.Accepted
        case false:
            return DeliveryStatus.Rejected
        case null:
            return DeliveryStatus.NotProcessed
    }
}
