import { AutomapperProfile, InjectMapper } from '@automapper/nestjs'
import { Injectable } from '@nestjs/common'
import { createMap, forMember, mapFrom, Mapper, MappingConfiguration, MappingProfile } from '@automapper/core'
import { Proxy } from './proxy.schema'
import { ProxyDescriptorDto } from './proxy-descriptor.dto'

@Injectable()
export class ProxyProfile extends AutomapperProfile {
    constructor(@InjectMapper() mapper: Mapper) {
        super(mapper)
    }

    get profile(): MappingProfile {
        return mapper => {
            createMap(mapper, Proxy, ProxyDescriptorDto)
        }
    }

    protected get mappingConfigurations(): MappingConfiguration[] {
        return [
            forMember<Proxy, ProxyDescriptorDto>(
                obj => obj.id,
                mapFrom(src => src._id.toHexString()),
            ),
        ]
    }
}
