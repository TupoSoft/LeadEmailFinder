export class SmtpSecureTransportUnavailableException extends Error {
    name = 'SmtpSecureTransportUnavailableException'

    constructor(cause?: unknown) {
        super('smtp_secure_transport_unavailable', { cause })
    }
}
