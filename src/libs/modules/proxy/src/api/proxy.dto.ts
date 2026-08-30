import { Exclude, Expose, Type } from 'class-transformer'
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import {
    IsEnum,
    IsInt,
    IsNotEmpty,
    IsOptional,
    IsString,
    IsUUID,
    Max,
    Min,
    ValidateNested,
} from 'class-validator'
import { ProxyLifecycle } from '../domain/proxy-lifecycle'
import { ProxyProtocol } from '../domain/proxy-protocol'

export { ProxyLifecycle, ProxyProtocol }

@Expose()
export class ProxyAuthDto {
    @IsString()
    @IsNotEmpty()
    user: string

    @IsString()
    @IsNotEmpty()
    pass: string
}

@Expose()
export class ProxyDto {
    id: string

    @ApiProperty({ enum: ProxyProtocol })
    protocol: ProxyProtocol

    host: string

    port: number

    @Exclude()
    auth?: never

    @ApiProperty({ enum: ProxyLifecycle })
    state: ProxyLifecycle

    weight: number

    maxConcurrent: number

    requestsPerMinute: number

    description?: string

    createdAt: Date

    updatedAt: Date
}

@Expose()
export class CreateProxyDto {
    @ApiProperty({ enum: ProxyProtocol })
    @IsEnum(ProxyProtocol)
    protocol: ProxyProtocol

    @IsString()
    @IsNotEmpty()
    host: string

    @Type(() => Number)
    @IsInt()
    @Min(1)
    @Max(65535)
    port: number

    @ApiPropertyOptional({ type: ProxyAuthDto })
    @IsOptional()
    @ValidateNested()
    @Type(() => ProxyAuthDto)
    auth?: ProxyAuthDto

    @IsOptional()
    @IsString()
    description?: string

    @ApiPropertyOptional({ default: 1 })
    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(0)
    weight?: number

    @ApiPropertyOptional({ enum: ProxyLifecycle, default: ProxyLifecycle.DISABLED })
    @IsOptional()
    @IsEnum(ProxyLifecycle)
    state?: ProxyLifecycle

    @ApiPropertyOptional({ default: 1, minimum: 1 })
    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    maxConcurrent?: number

    @ApiPropertyOptional({ default: 10, minimum: 1 })
    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    requestsPerMinute?: number
}

export class UpdateProxyDto {
    @IsOptional()
    @IsEnum(ProxyProtocol)
    protocol?: ProxyProtocol

    @IsOptional()
    @IsString()
    @IsNotEmpty()
    host?: string

    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    @Max(65535)
    port?: number

    @IsOptional()
    @ValidateNested()
    @Type(() => ProxyAuthDto)
    auth?: ProxyAuthDto

    @IsOptional()
    @IsString()
    description?: string

    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(0)
    weight?: number

    @IsOptional()
    @IsEnum(ProxyLifecycle)
    state?: ProxyLifecycle

    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    maxConcurrent?: number

    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    requestsPerMinute?: number
}

@Expose()
export class ProxyListDto {
    @Expose()
    @Type(() => ProxyDto)
    proxies: ProxyDto[]

    @Expose()
    nextPageToken: string
}

export class ListProxiesQueryDto {
    @ApiPropertyOptional({ minimum: 1, maximum: 100 })
    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    @Max(100)
    pageSize?: number

    @ApiPropertyOptional()
    @IsOptional()
    @IsUUID()
    pageToken?: string
}

export class HealthyProxyQueryDto {
    @IsString()
    @IsNotEmpty()
    mxHost: string
}

export class ReportBlacklistDto {
    @IsString()
    @IsNotEmpty()
    mxHost: string
}
