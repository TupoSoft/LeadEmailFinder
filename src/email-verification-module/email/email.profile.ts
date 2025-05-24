import { Injectable } from '@nestjs/common'
import { AutomapperProfile, InjectMapper } from '@automapper/nestjs'
import { createMap, forMember, mapFrom, Mapper, MappingConfiguration, MappingProfile } from '@automapper/core'
import { Email } from './email.schema'
import { EmailResponseDto } from './email-response.dto'

@Injectable()
export class EmailProfile extends AutomapperProfile {
    constructor(@InjectMapper() mapper: Mapper) {
        super(mapper)
    }

    get profile(): MappingProfile {
        return mapper => {
            createMap(mapper, Email, EmailResponseDto)
        }
    }

    protected get mappingConfigurations(): MappingConfiguration[] {
        return [
            forMember<Email, EmailResponseDto>(
                destination => destination.email,
                mapFrom(source => source._id),
            ),
        ]
    }
}
