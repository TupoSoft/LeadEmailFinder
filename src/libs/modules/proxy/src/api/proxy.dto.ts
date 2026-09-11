import { Exclude, Expose, Type } from 'class-transformer'
import { ApiHideProperty, ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import {
    IsEnum,
    IsInt,
    IsNotEmpty,
    IsObject,
    IsOptional,
    IsString,
    IsUUID,
    Max,
    Min,
    ValidateIf,
    ValidateNested,
} from 'class-validator'
import { ProxyLifecycle } from '../domain/proxy-lifecycle'
import { ProxyProtocol } from '../domain/proxy-protocol'

export { ProxyLifecycle, ProxyProtocol }

@Expose()
export class ProxyAuthDto {
    @ApiProperty({ minLength: 1, writeOnly: true, description: 'Proxy authentication username. Never returned.' })
    @IsString()
    @IsNotEmpty()
    user: string

    @ApiProperty({ minLength: 1, writeOnly: true, description: 'Proxy authentication password. Never returned.' })
    @IsString()
    @IsNotEmpty()
    pass: string
}

@Expose()
export class ProxyDto {
    @ApiProperty({ format: 'uuid' })
    id: string

    @ApiProperty({ enum: ProxyProtocol, description: '1: HTTP, 2: HTTPS, 3: SOCKS5, 4: SOCKS4.' })
    protocol: ProxyProtocol

    @ApiProperty()
    host: string

    @ApiProperty({ type: 'integer', minimum: 1, maximum: 65535 })
    port: number

    @Exclude()
    @ApiHideProperty()
    auth?: never

    @ApiProperty({
        enum: ProxyLifecycle,
        description: 'Draining and disabled exclude new allocation; neither proves that active leases have ended.',
    })
    state: ProxyLifecycle

    @ApiProperty({ type: 'integer', minimum: 0 })
    weight: number

    @ApiProperty({ type: 'integer', minimum: 1 })
    maxConcurrent: number

    @ApiProperty({ type: 'integer', minimum: 1, description: 'Maximum allocation requests per minute.' })
    requestsPerMinute: number

    @ApiPropertyOptional()
    description?: string

    @ApiProperty({
        type: [String],
        description: 'MX hosts reported as blacklisting this proxy. Repeated reports are deduplicated.',
    })
    blacklists: string[]

    @ApiProperty({ type: String, format: 'date-time' })
    createdAt: Date

    @ApiProperty({ type: String, format: 'date-time' })
    updatedAt: Date
}

@Expose()
export class CreateProxyDto {
    @ApiProperty({ enum: ProxyProtocol, description: '1: HTTP, 2: HTTPS, 3: SOCKS5, 4: SOCKS4.' })
    @IsEnum(ProxyProtocol)
    protocol: ProxyProtocol

    @ApiProperty({ minLength: 1 })
    @IsString()
    @IsNotEmpty()
    host: string

    @ApiProperty({ type: 'integer', minimum: 1, maximum: 65535 })
    @Type(() => Number)
    @IsInt()
    @Min(1)
    @Max(65535)
    port: number

    @ApiPropertyOptional({
        type: ProxyAuthDto,
        writeOnly: true,
        description: 'Optional complete username/password pair. Never returned.',
    })
    @ValidateIf((_object, value) => value !== undefined)
    @IsObject()
    @ValidateNested()
    @Type(() => ProxyAuthDto)
    auth?: ProxyAuthDto

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    description?: string

    @ApiPropertyOptional({ type: 'integer', default: 1, minimum: 0 })
    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(0)
    weight?: number

    @ApiPropertyOptional({ enum: ProxyLifecycle, default: ProxyLifecycle.DISABLED })
    @IsOptional()
    @IsEnum(ProxyLifecycle)
    state?: ProxyLifecycle

    @ApiPropertyOptional({ type: 'integer', default: 1, minimum: 1 })
    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    maxConcurrent?: number

    @ApiPropertyOptional({ type: 'integer', default: 10, minimum: 1 })
    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    requestsPerMinute?: number
}

export class UpdateProxyDto {
    @ApiPropertyOptional({ enum: ProxyProtocol, description: '1: HTTP, 2: HTTPS, 3: SOCKS5, 4: SOCKS4.' })
    @IsOptional()
    @IsEnum(ProxyProtocol)
    protocol?: ProxyProtocol

    @ApiPropertyOptional({ minLength: 1 })
    @IsOptional()
    @IsString()
    @IsNotEmpty()
    host?: string

    @ApiPropertyOptional({ type: 'integer', minimum: 1, maximum: 65535 })
    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    @Max(65535)
    port?: number

    @ApiPropertyOptional({
        type: ProxyAuthDto,
        writeOnly: true,
        description:
            'Complete replacement username/password pair. Omission preserves stored authentication; clearing is unsupported.',
    })
    @ValidateIf((_object, value) => value !== undefined)
    @IsObject()
    @ValidateNested()
    @Type(() => ProxyAuthDto)
    auth?: ProxyAuthDto

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    description?: string

    @ApiPropertyOptional({ type: 'integer', minimum: 0 })
    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(0)
    weight?: number

    @ApiPropertyOptional({ enum: ProxyLifecycle })
    @IsOptional()
    @IsEnum(ProxyLifecycle)
    state?: ProxyLifecycle

    @ApiPropertyOptional({ type: 'integer', minimum: 1 })
    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    maxConcurrent?: number

    @ApiPropertyOptional({ type: 'integer', minimum: 1 })
    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    requestsPerMinute?: number
}

@Expose()
export class ProxyListDto {
    @ApiProperty({ type: [ProxyDto] })
    @Expose()
    @Type(() => ProxyDto)
    proxies: ProxyDto[]

    @ApiProperty({
        description:
            'Pass this cursor unchanged as pageToken. An empty string means this traversal is complete; no total is provided.',
    })
    @Expose()
    nextPageToken: string
}

export class ListProxiesQueryDto {
    @ApiPropertyOptional({ type: 'integer', minimum: 1, maximum: 100, default: 100 })
    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    @Max(100)
    pageSize?: number

    @ApiPropertyOptional({
        format: 'uuid',
        description: 'The nonempty nextPageToken from the previous page. Omit for the first page.',
    })
    @IsOptional()
    @IsUUID()
    pageToken?: string
}

export class HealthyProxyQueryDto {
    @ApiProperty({ minLength: 1 })
    @IsString()
    @IsNotEmpty()
    mxHost: string
}

export class ReportBlacklistDto {
    @ApiProperty({
        minLength: 1,
        description: 'MX host to exclude for this proxy. Repeating the same value does not duplicate it.',
    })
    @IsString()
    @IsNotEmpty()
    mxHost: string
}
