import {
    AddProxyRequest,
    AddProxyResponse,
    Auth,
    GetProxyRequest,
    GetProxyResponse,
    ListProxiesRequest,
    ListProxiesResponse,
    Protocol,
    ProxyDescriptor,
} from '@tuposoft/lead-email-finder/proto/proxy/v1/proxy'
import { AutoMap } from '@automapper/classes'
import { Expose, Type } from 'class-transformer'
import {
    IsBoolean,
    IsEnum,
    IsMongoId,
    IsNotEmpty,
    IsOptional,
    IsPositive,
    IsString,
    ValidateNested,
} from 'class-validator'

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

@Expose()
export class AddProxyRequestDto implements AddProxyRequest {
    @IsEnum(Protocol)
    protocol: Protocol

    @IsNotEmpty()
    @IsString()
    host: string

    @IsPositive()
    port: number

    @IsOptional()
    @ValidateNested()
    @Type(() => AuthDto)
    auth?: Auth

    @IsOptional()
    @IsString()
    description?: string

    @IsOptional()
    @IsPositive()
    weight?: number

    @IsOptional()
    @IsBoolean()
    enabled?: boolean
}

@Expose()
export class AddProxyResponseDto implements AddProxyResponse {
    proxy: ProxyDescriptorDto
}

export class GetProxyRequestDto implements GetProxyRequest {
    @IsMongoId({
        message: ({ value }) => `Invalid ID: ${value}.`,
    })
    id: string
}

@Expose()
export class GetProxyResponseDto implements GetProxyResponse {
    proxy: ProxyDescriptorDto
}

@Expose()
export class ListProxiesRequestDto implements ListProxiesRequest {
    @IsOptional()
    @IsMongoId({
        message: ({ value }) => `Invalid ID: ${value}.`,
    })
    pageToken?: string

    @IsPositive()
    pageSize: number = 10
}

@Expose()
export class ListProxiesResponseDto implements ListProxiesResponse {
    @Type(() => ProxyDescriptorDto)
    proxies: ProxyDescriptorDto[]
    nextPageToken: string
}
