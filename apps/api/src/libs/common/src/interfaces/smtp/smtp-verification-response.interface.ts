export interface ISmtpVerificationResponse {
    email: string
    reason:
        | 'accepted_email'
        | 'rejected_email'
        | 'timeout'
        | 'temporarily_blocked'
        | 'no_mx_records'
        | 'unexpected_error'
        | 'blacklisted'
        | 'no_connect'
        | 'exceeded_storage'
        | 'sender_blocked'
        | 'secure_transport_unavailable'
        | 'unknown'
    exists: boolean | null
    targetExchange?: string
    proxyId?: string
}
