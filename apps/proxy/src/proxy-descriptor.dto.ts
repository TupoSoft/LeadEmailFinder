import { Auth, Protocol, ProxyDescriptor } from '@tuposoft/lead-email-finder/proto/proxy/v1/proxy'
import { AutoMap } from '@automapper/classes'

export class ProxyDescriptorDto implements ProxyDescriptor {
    @AutoMap()
    id: string

    @AutoMap()
    protocol: Protocol

    @AutoMap()
    host: string

    @AutoMap()
    port: number

    @AutoMap()
    auth: Auth | undefined

    @AutoMap()
    weight: number

    @AutoMap()
    description: string

    @AutoMap()
    enabled: boolean

    @AutoMap()
    createdAt: Date

    @AutoMap()
    updatedAt: Date
}
