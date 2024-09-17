export const enum DeliveryStatus {
    Accepted = 'accepted',
    Rejected = 'rejected',
    NotProcessed = 'not-processed',
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
