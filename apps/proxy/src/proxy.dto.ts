import { AddProxyResponse, Auth, Protocol, ProxyDescriptor } from '@tuposoft/lead-email-finder/proto/proxy/v1/proxy'
import { AutoMap } from '@automapper/classes'
import { Expose, Type } from 'class-transformer'

@Expose()
export class AuthDto implements Auth {
    @AutoMap()
    user: string

    @AutoMap()
    pass: string
}

@Expose()
export class ProxyDescriptorDto implements ProxyDescriptor {
    @AutoMap()
    id: string

    @AutoMap()
    protocol: Protocol

    @AutoMap()
    host: string

    @AutoMap()
    port: number

    @AutoMap(() => AuthDto)
    @Type(() => AuthDto)
    auth: AuthDto | undefined

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

@Expose()
export class AddProxyResponseDto implements AddProxyResponse {
    proxy: ProxyDescriptorDto
}
