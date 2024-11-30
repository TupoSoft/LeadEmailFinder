import type { DomainRepository } from './domain-repository'
import type { Domain } from './entities'

export class DomainService {
    constructor(private readonly domainRepository: DomainRepository) {}

    async create(domain: Domain): Promise<void> {
        await this.domainRepository.save(domain)
    }

    async get(name: string): Promise<Domain> {
        return await this.domainRepository.findByName(name)
    }
}
