import type { DomainRepository } from './domain-repository'
import type { Domain } from './entities'

export class DomainService {
    constructor(private readonly domainRepository: DomainRepository) {}

    async create(domain: Domain): Promise<void> {
        await this.domainRepository.save(domain)
    }
}
