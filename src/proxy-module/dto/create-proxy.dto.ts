import { IsArray, IsEnum, IsNumber, IsOptional, IsString } from 'class-validator'
import { ProxyType } from '../enums'

export class CreateProxyDto {
    @IsEnum(ProxyType)
    type: ProxyType

    @IsString()
    host: string

    @IsNumber()
    port: number

    @IsOptional()
    @IsString()
    user?: string

    @IsOptional()
    @IsString()
    password?: string

    @IsOptional()
    @IsArray()
    @IsString({ each: true })
    blacklists?: string[]
}
