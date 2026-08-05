import { createMap, Mapper, MappingProfile } from '@automapper/core'
import { AutomapperProfile, InjectMapper } from '@automapper/nestjs'
import { Proxy } from './proxy.entity'
import { Injectable } from '@nestjs/common'
import { ProxyResponse } from './proxy-response.dto'

@Injectable()
export class ProxyProfile extends AutomapperProfile {
    constructor(@InjectMapper() mapper: Mapper) {
        super(mapper)
    }

    get profile(): MappingProfile {
        return mapper => {
            createMap(mapper, Proxy, ProxyResponse)
        }
    }
}
