import { KeyPermissions } from '@tuposoft/lead-email-finder/key/key.enum'
import { Expose } from 'class-transformer'
import { IsArray, IsEnum, IsOptional, IsString } from 'class-validator'
import {
    ApiKeyDescriptor,
    CheckKeyPermissionsRequest,
    CheckKeyPermissionsResponse,
    GenerateKeyRequest,
    GenerateKeyResponse,
    RevokeKeyRequest,
    RevokeKeyResponse,
} from '@tuposoft/lead-email-finder/proto/api_key/v1/api_key'

export class ApiKeyDescriptorDto implements ApiKeyDescriptor {
    @Expose()
    id: string

    @Expose()
    token: string

    @Expose()
    description: string

    @Expose()
    permissions: KeyPermissions[]

    @Expose()
    expiresAt: Date

    @Expose()
    createdAt: Date

    @Expose()
    updatedAt: Date
}

export class GenerateKeyRequestDto implements GenerateKeyRequest {
    @IsArray()
    @IsEnum(KeyPermissions, { each: true })
    permissions: KeyPermissions[] = [KeyPermissions.READ]

    @IsOptional()
    @IsString()
    description?: string
}

export class GenerateKeyResponseDto implements GenerateKeyResponse {
    @Expose()
    apiKey: ApiKeyDescriptorDto
}

export class RevokeKeyRequestDto implements RevokeKeyRequest {
    @IsString()
    token: string
}

export class RevokeKeyResponseDto implements RevokeKeyResponse {
    @Expose()
    apiKey: ApiKeyDescriptorDto
}

export class CheckKeyPermissionsRequestDto implements CheckKeyPermissionsRequest {
    @IsString()
    token: string

    @IsOptional()
    @IsArray()
    @IsEnum(KeyPermissions, { each: true })
    requiredPermissions: KeyPermissions[]
}

export class CheckKeyPermissionsResponseDto implements CheckKeyPermissionsResponse {
    @Expose()
    allowed: boolean
}
