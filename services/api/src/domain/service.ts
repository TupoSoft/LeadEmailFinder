import type { DomainRepository } from './repository'
import type { Domain } from './entity'

export class DomainService {
    constructor(private readonly domainRepository: DomainRepository) {}

    async create(domain: Domain): Promise<void> {
        await this.domainRepository.save(domain)
    }

    async get(name: string): Promise<Domain> {
        return await this.domainRepository.findById(name)
    }
}
