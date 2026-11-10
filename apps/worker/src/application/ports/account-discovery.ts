export interface AccountDiscoveryEvidence {
    readonly sourceName: string
}

export interface AccountDiscovery {
    discover(email: string): Promise<readonly AccountDiscoveryEvidence[]>
}
