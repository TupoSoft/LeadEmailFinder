export interface SMTPVerificationResult {
    exists?: boolean
    catchAllStatus?: boolean
    targetExchange?: string
    mxDomain?: string
}
