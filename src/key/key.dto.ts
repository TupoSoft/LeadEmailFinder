import { KeyPermissions } from './key.enum'
import { Expose } from 'class-transformer'
import { IsArray, IsEnum, IsOptional, IsString } from 'class-validator'

export class GenerateKeyDto {
    @IsArray()
    @IsEnum(KeyPermissions, { each: true })
    permissions: KeyPermissions[] = [KeyPermissions.READ]

    @IsOptional()
    @IsString()
    description?: string
}

export class ApiKeyResponseDto {
    @Expose()
    token: string

    @Expose()
    permissions: KeyPermissions[]

    @Expose()
    _id: string

    @Expose()
    expiresAt: Date

    @Expose()
    createdAt: Date

    @Expose()
    updatedAt: Date
}
