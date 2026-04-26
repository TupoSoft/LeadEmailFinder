import { AutomapperProfile, InjectMapper } from '@automapper/nestjs'
import { Injectable } from '@nestjs/common'
import { createMap, forMember, mapFrom, Mapper, MappingProfile } from '@automapper/core'
import { Auth, Proxy } from './proxy.schema'
import { AuthDto, ProxyDescriptorDto } from './proxy.dto'

@Injectable()
export class ProxyProfile extends AutomapperProfile {
    constructor(@InjectMapper() mapper: Mapper) {
        super(mapper)
    }

    get profile(): MappingProfile {
        return mapper => {
            createMap(mapper, Auth, AuthDto)
            createMap(
                mapper,
                Proxy,
                ProxyDescriptorDto,
                forMember<Proxy, ProxyDescriptorDto>(
                    obj => obj.id,
                    mapFrom(src => src._id.toHexString()),
                ),
            )
        }
    }
}
