export const AUTH_MAIL_DELIVERY = Symbol('AUTH_MAIL_DELIVERY')

export interface AuthMailMessage {
    readonly to: string
    readonly subject: string
    readonly text: string
}

/** Transactional authentication mail only; it never performs email-verification probes. */
export interface AuthMailDelivery {
    /** Resolves once the transport accepted the message; rejects with `AuthMailDeliveryError` otherwise. */
    send(message: AuthMailMessage): Promise<void>
}

/** A redacted failure: neither the recipient, the message body, nor transport diagnostics are included. */
export class AuthMailDeliveryError extends Error {
    constructor(public readonly reason: 'invalid-message' | 'rejected' | 'unavailable') {
        super(`Authentication mail delivery failed: ${reason}`)
        this.name = AuthMailDeliveryError.name
    }
}
