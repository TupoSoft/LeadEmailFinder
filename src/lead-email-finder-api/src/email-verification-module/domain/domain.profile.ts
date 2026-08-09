import { AutomapperProfile, InjectMapper } from '@automapper/nestjs'
import { createMap, forMember, mapFrom, Mapper, MappingConfiguration, MappingProfile } from '@automapper/core'
import { Domain } from './domain.entity'
import { Injectable } from '@nestjs/common'
import { DomainResponseDto } from './domain-response.dto'

@Injectable()
export class DomainProfile extends AutomapperProfile {
    constructor(@InjectMapper() mapper: Mapper) {
        super(mapper)
    }

    get profile(): MappingProfile {
        return mapper => createMap(mapper, Domain, DomainResponseDto)
    }

    protected get mappingConfigurations(): MappingConfiguration[] {
        return [
            forMember<Domain, DomainResponseDto>(
                destination => destination.name,
                mapFrom(source => source.id),
            ),
        ]
    }
}
