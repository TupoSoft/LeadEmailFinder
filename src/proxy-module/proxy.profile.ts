import { createMap, forMember, mapFrom, Mapper, MappingConfiguration, MappingProfile } from '@automapper/core'
import { AutomapperProfile, InjectMapper } from '@automapper/nestjs'
import { Proxy } from './proxy.schema'
import { ProxyResponse } from './dto'
import { Injectable } from '@nestjs/common'
import { Types } from 'mongoose'

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

    protected get mappingConfigurations(): MappingConfiguration[] {
        return [
            forMember<Proxy & { _id: Types.ObjectId }, ProxyResponse>(
                destination => destination.id,
                mapFrom(source => source._id.toHexString()),
            ),
        ]
    }
}
