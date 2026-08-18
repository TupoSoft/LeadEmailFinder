import { Expose } from 'class-transformer'
import { IsNotEmpty, IsString } from 'class-validator'
import { AuthCredentialKind, AuthPermission, AuthPrincipal, AuthRole } from '@tuposoft/lead-email-finder/modules/identity'

export class AuthCallbackQueryDto {
    @IsString()
    @IsNotEmpty()
    code: string

    @IsString()
    @IsNotEmpty()
    state: string
}

export class SessionResponseDto implements AuthPrincipal {
    @Expose()
    credentialKind: AuthCredentialKind

    @Expose()
    issuer: string

    @Expose()
    subject: string

    @Expose()
    organizationId: string

    @Expose()
    membershipRole: AuthRole

    @Expose()
    permissions: readonly AuthPermission[]

    @Expose()
    credentialId: string
}
