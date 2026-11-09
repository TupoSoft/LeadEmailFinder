export interface AccountDiscoveryProvider {
    readonly sourceName: string
    verify(email: string): Promise<boolean>
}
