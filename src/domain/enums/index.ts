export const enum DeliveryStatus {
    Accepted = 'accepted',
    Rejected = 'rejected',
    Unknown = 'unknown',
    NotProcessed = 'not-processed', // deprecated
}

export const enum CatchAllStatus {
    Enabled = 'enabled',
    Disabled = 'disabled',
    Unknown = 'unknown',
}

export const enum SMTPVerificationError {
    NoMxRecords,
    SenderIdentificationFailed,
    CatchAll,
}
