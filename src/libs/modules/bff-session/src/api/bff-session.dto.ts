import { Expose, Type } from 'class-transformer'
import { ApiProperty } from '@nestjs/swagger'
import { AUTH_ROLES, AuthRole } from '@tuposoft/lead-email-finder/modules/identity'
import {
    SERVICE_CLIENT_GRANTABLE_PERMISSIONS,
    ServiceClientGrantablePermission,
} from '@tuposoft/lead-email-finder/modules/auth'
import { BROWSER_CAPABILITIES, BrowserCapability } from '../application/browser-capability-policy'

export class CurrentAccountMembershipDto {
    @ApiProperty({ type: String, format: 'uuid', description: 'Active organization membership identifier.' })
    @Expose()
    id: string

    @ApiProperty({ enum: AUTH_ROLES, description: 'Role of the active organization membership.' })
    @Expose()
    role: AuthRole
}

export class CurrentAccountOrganizationDto {
    @ApiProperty({ type: String, format: 'uuid', description: 'Active organization identifier.' })
    @Expose()
    id: string

    @ApiProperty({ type: String, description: 'Display name of the active organization.' })
    @Expose()
    name: string
}

export class CurrentAccountContextDto {
    @ApiProperty({
        type: String,
        format: 'email',
        nullable: true,
        example: 'owner@example.test',
        description: 'Current external-identity email, or null when the provider has no email.',
    })
    @Expose()
    email: string | null

    @ApiProperty({ type: CurrentAccountMembershipDto })
    @Expose()
    @Type(() => CurrentAccountMembershipDto)
    membership: CurrentAccountMembershipDto

    @ApiProperty({ type: CurrentAccountOrganizationDto })
    @Expose()
    @Type(() => CurrentAccountOrganizationDto)
    organization: CurrentAccountOrganizationDto

    @ApiProperty({ enum: BROWSER_CAPABILITIES, isArray: true, description: 'Presentation-only browser capabilities.' })
    @Expose()
    capabilities: readonly BrowserCapability[]

    @ApiProperty({
        enum: SERVICE_CLIENT_GRANTABLE_PERMISSIONS,
        isArray: true,
        description: 'Ordered permissions this human account may grant to a service client.',
    })
    @Expose()
    grantableServiceClientPermissions: readonly ServiceClientGrantablePermission[]
}

export class AuthenticationRequiredResponseDto {
    @ApiProperty({ enum: ['authentication_required'] })
    @Expose()
    code: 'authentication_required'
}

export class HumanSessionRequiredResponseDto {
    @ApiProperty({ enum: ['human_session_required'] })
    @Expose()
    code: 'human_session_required'
}
