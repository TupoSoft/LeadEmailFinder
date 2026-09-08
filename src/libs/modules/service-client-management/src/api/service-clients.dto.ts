import { Expose } from 'class-transformer'
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { ArrayNotEmpty, ArrayUnique, IsArray, IsIn, IsOptional, IsString, IsUUID, Length } from 'class-validator'
import { AUTH_PERMISSIONS, AuthPermission, ServiceCredentialStatus } from '@tuposoft/lead-email-finder/modules/identity'

export class ServiceClientParamsDto {
    @ApiProperty({ type: String, format: 'uuid' })
    @IsUUID()
    organizationId: string
}

export class ServiceClientMemberParamsDto extends ServiceClientParamsDto {
    @ApiProperty({ type: String, format: 'uuid' })
    @IsUUID()
    serviceClientId: string
}

export class CreateServiceClientDto {
    @ApiPropertyOptional({ type: String, minLength: 1, maxLength: 200 })
    @IsOptional()
    @IsString()
    @Length(1, 200)
    description?: string

    @ApiProperty({
        type: [String],
        enum: AUTH_PERMISSIONS,
        isArray: true,
        minItems: 1,
        uniqueItems: true,
        description:
            'Choose only from the current account grantableServiceClientPermissions; the server enforces that ceiling.',
    })
    @IsArray()
    @ArrayNotEmpty()
    @ArrayUnique()
    @IsIn(AUTH_PERMISSIONS, { each: true })
    permissions: AuthPermission[]
}

export class ServiceClientResponseDto {
    @ApiProperty({ type: String, format: 'uuid' })
    @Expose()
    id: string

    // The literal Keycloak clientId string. `subject` (the service-account user UUID) and `issuer` are
    // internal identifiers with no product meaning to the caller and are never exposed here.
    @ApiProperty({ type: String })
    @Expose()
    clientId: string

    @ApiProperty({ type: String, nullable: true })
    @Expose()
    description: string | null

    @ApiProperty({ enum: AUTH_PERMISSIONS, isArray: true })
    @Expose()
    permissions: AuthPermission[]

    @ApiProperty({ enum: ['active', 'disabled'] })
    @Expose()
    status: ServiceCredentialStatus

    @ApiProperty({ type: String, format: 'date-time' })
    @Expose()
    createdAt: Date

    @ApiProperty({ type: String, format: 'date-time' })
    @Expose()
    updatedAt: Date
}

export class ServiceClientSecretResponseDto extends ServiceClientResponseDto {
    // One-time value: present only in create/rotate responses, never in list responses or logs.
    @ApiProperty({
        type: String,
        description: 'Returned only by this create or rotate response. Cannot be retrieved later.',
    })
    @Expose()
    clientSecret: string
}
