import { Injectable } from '@nestjs/common'
import { IDomainService } from '@tuposoft/lead-email-finder/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Domain } from './domain.entity'
import { Repository } from 'typeorm'
import { InjectMapper } from '@automapper/nestjs'
import { Mapper } from '@automapper/core'
import { DomainNotFoundException } from './domain-not-found.exception'
import { DomainResponseDto } from './domain-response.dto'

@Injectable()
export class DomainService implements IDomainService {
    constructor(
        @InjectRepository(Domain) private readonly domainRepo: Repository<Domain>,
        @InjectMapper() private readonly mapper: Mapper,
    ) {}

    async getDomain(name: string): Promise<DomainResponseDto> {
        const domain = await this.domainRepo.findOneBy({ id: name })

        if (domain === null) {
            throw new DomainNotFoundException(name)
        }

        return this.mapper.map(domain, Domain, DomainResponseDto)
    }

    async isVerificationAllowed(name: string): Promise<boolean> {
        const domain = await this.domainRepo.findOneBy({ id: name })

        if (domain === null) {
            return true
        }

        return !domain.isVerificationForbidden
    }
}
