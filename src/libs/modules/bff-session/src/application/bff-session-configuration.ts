export const BFF_SESSION_CONFIGURATION = Symbol('BFF_SESSION_CONFIGURATION')

export interface BffSessionConfiguration {
    readonly appBaseUrl: string
    readonly issuer: string
    readonly clientId: string
    readonly clientSecret: string
    readonly sessionIdleTimeoutMs: number
    readonly sessionAbsoluteTimeoutMs: number
    readonly isSecureCookie: boolean
}
