import { Expose } from 'class-transformer'
import { ArrayNotEmpty, ArrayUnique, IsArray, IsIn, IsOptional, IsString, IsUUID, Length } from 'class-validator'
import { AUTH_PERMISSIONS, AuthPermission, ServiceCredentialStatus } from '@tuposoft/lead-email-finder/modules/identity'

export class ServiceClientParamsDto {
    @IsUUID()
    organizationId: string
}

export class ServiceClientMemberParamsDto extends ServiceClientParamsDto {
    @IsUUID()
    serviceClientId: string
}

export class CreateServiceClientDto {
    @IsOptional()
    @IsString()
    @Length(1, 200)
    description?: string

    @IsArray()
    @ArrayNotEmpty()
    @ArrayUnique()
    @IsIn(AUTH_PERMISSIONS, { each: true })
    permissions: AuthPermission[]
}

export class ServiceClientResponseDto {
    @Expose()
    id: string

    // The literal Keycloak clientId string. `subject` (the service-account user UUID) and `issuer` are
    // internal identifiers with no product meaning to the caller and are never exposed here.
    @Expose()
    clientId: string

    @Expose()
    description: string | null

    @Expose()
    permissions: AuthPermission[]

    @Expose()
    status: ServiceCredentialStatus

    @Expose()
    createdAt: Date

    @Expose()
    updatedAt: Date
}

export class ServiceClientSecretResponseDto extends ServiceClientResponseDto {
    // One-time value: present only in create/rotate responses, never in list responses or logs.
    @Expose()
    clientSecret: string
}
