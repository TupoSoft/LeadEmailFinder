import { Injectable } from '@nestjs/common'
import { IDomainService } from './interfaces'
import { DomainResponseDto } from './dto'
import { InjectModel } from '@nestjs/mongoose'
import { Domain } from './domain.schema'
import { Model } from 'mongoose'
import { InjectMapper } from '@automapper/nestjs'
import { Mapper } from '@automapper/core'
import { DomainNotFoundException } from './exceptions'

@Injectable()
export class DomainService implements IDomainService {
    constructor(
        @InjectModel(Domain.name) private readonly domainModel: Model<Domain>,
        @InjectMapper() private readonly mapper: Mapper,
    ) {}

    async getDomain(name: string): Promise<DomainResponseDto> {
        const domain = await this.domainModel.findById(name).exec()

        if (domain === null) {
            throw new DomainNotFoundException(name)
        }

        return this.mapper.map(domain, Domain, DomainResponseDto)
    }
}
