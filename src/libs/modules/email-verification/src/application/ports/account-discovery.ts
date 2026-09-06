export const ACCOUNT_DISCOVERY = Symbol('ACCOUNT_DISCOVERY')

export interface AccountDiscovery {
    readonly sourceName: string
    verify(email: string): Promise<boolean>
}
