import { Expose } from 'class-transformer'
import { IsArray, IsEnum, IsOptional, IsString } from 'class-validator'
import { KeyPermissions } from '../../../domain/key.enum'

export class ApiKeyDescriptorDto {
    @Expose()
    id: string

    @Expose()
    token: string

    @Expose()
    description?: string

    @Expose()
    permissions: KeyPermissions[]

    @Expose()
    expiresAt: Date

    @Expose()
    createdAt: Date

    @Expose()
    updatedAt: Date
}

export class GenerateKeyRequestDto {
    @IsOptional()
    @IsArray()
    @IsEnum(KeyPermissions, { each: true })
    permissions?: KeyPermissions[]

    @IsOptional()
    @IsString()
    description?: string
}

export class GenerateKeyResponseDto {
    @Expose()
    apiKey: ApiKeyDescriptorDto
}

export class RevokeKeyResponseDto {
    @Expose()
    apiKey: ApiKeyDescriptorDto
}

export class CheckKeyPermissionsRequestDto {
    @IsString()
    token: string

    @IsOptional()
    @IsArray()
    @IsEnum(KeyPermissions, { each: true })
    requiredPermissions?: KeyPermissions[]
}

export class CheckKeyPermissionsResponseDto {
    @Expose()
    allowed: boolean
}
