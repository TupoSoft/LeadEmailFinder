export const BFF_SESSION_CONFIGURATION = Symbol('BFF_SESSION_CONFIGURATION')

export interface BrowserSessionConfiguration {
    readonly appBaseUrl: string
    readonly sessionIdleTimeoutMs: number
    readonly sessionAbsoluteTimeoutMs: number
    readonly isSecureCookie: boolean
}

/** Configuration retained for the inactive legacy flow until its planned removal. */
export interface BffSessionConfiguration extends BrowserSessionConfiguration {
    readonly issuer: string
    readonly backchannelUrl: string
    readonly jwksUri: string
    readonly clientId: string
    readonly clientSecret: string
}
