import { ICatchAllVerifier } from '@tuposoft/lead-email-finder/common'
import { AccountDiscovery, AccountDiscoveryEvidence } from '../ports/account-discovery'

export class AccountDiscoveryService implements AccountDiscovery {
    constructor(private readonly verifier?: ICatchAllVerifier) {}

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
