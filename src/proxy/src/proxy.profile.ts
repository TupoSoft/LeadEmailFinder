import { AutomapperProfile, InjectMapper } from '@automapper/nestjs'
import { Injectable } from '@nestjs/common'
import { createMap, forMember, mapFrom, Mapper, MappingProfile } from '@automapper/core'
import { Proxy } from './proxy.entity'
import { ProxyDto } from './proxy.dto'

@Injectable()
export class ProxyProfile extends AutomapperProfile {
    constructor(@InjectMapper() mapper: Mapper) {
        super(mapper)
    }

    get profile(): MappingProfile {
        return mapper => {
            createMap(
                mapper,
                Proxy,
                ProxyDto,
                forMember<Proxy, ProxyDto>(
                    obj => obj.auth,
                    mapFrom(src => src.auth),
                ),
            )
        }
    }
}
