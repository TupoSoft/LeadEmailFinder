import { AutoMap } from '@automapper/classes'
import { Exclude, Expose, Type } from 'class-transformer'
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import {
    IsBoolean,
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

export enum ProxyProtocol {
    HTTP = 1,
    HTTPS = 2,
    SOCKS5 = 3,
}

@Expose()
export class ProxyAuthDto {
    @AutoMap()
    @IsString()
    @IsNotEmpty()
    user: string

    @AutoMap()
    @IsString()
    @IsNotEmpty()
    pass: string
}

@Expose()
export class ProxyDto {
    @AutoMap()
    id: string

    @AutoMap()
    @ApiProperty({ enum: ProxyProtocol })
    protocol: ProxyProtocol

    @AutoMap()
    host: string

    @AutoMap()
    port: number

    @Exclude()
    auth?: never

    @AutoMap()
    weight: number

    @AutoMap()
    description?: string

    @AutoMap()
    enabled: boolean

    @AutoMap()
    createdAt: Date

    @AutoMap()
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

    @ApiPropertyOptional({ default: true })
    @IsOptional()
    @IsBoolean()
    enabled?: boolean
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
    @IsBoolean()
    enabled?: boolean
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
