import { DomainPolicy } from '../domain/domain-policy'
import { DomainNotFoundError } from '../domain/errors'
import { DomainStore } from './ports/domain-store'

export class DomainPolicyService {
    constructor(private readonly store: DomainStore) {}

    async getDomain(name: string): Promise<DomainPolicy> {
        const domain = await this.store.findByName(name)

        if (domain === null) {
            throw new DomainNotFoundError(name)
        }

        return domain
    }

    async isVerificationAllowed(name: string): Promise<boolean> {
        const domain = await this.store.findByName(name)

        if (domain === null) {
            return true
        }

        return !domain.isVerificationForbidden
    }
}
