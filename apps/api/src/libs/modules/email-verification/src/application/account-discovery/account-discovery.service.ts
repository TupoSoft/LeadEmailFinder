import { AccountDiscoveryProvider } from './account-discovery-provider'
import { AccountDiscovery, AccountDiscoveryEvidence } from '../ports/account-discovery'

export class AccountDiscoveryService implements AccountDiscovery {
    constructor(private readonly verifier?: AccountDiscoveryProvider) {}

    async discover(email: string): Promise<readonly AccountDiscoveryEvidence[]> {
        if (!this.verifier) {
            return []
        }

        try {
            if ((await this.verifier.verify(email)) === true) {
                return [{ sourceName: this.verifier.sourceName }]
            }
        } catch {
            return []
        }

        return []
    }
}
