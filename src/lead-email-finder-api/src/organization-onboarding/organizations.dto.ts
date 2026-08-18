import { Expose, Type } from 'class-transformer'
import { IsEmail, IsIn, IsNotEmpty, IsString, IsUUID, Length, MinLength } from 'class-validator'
import { AuthRole } from '@tuposoft/lead-email-finder/modules/identity'

export class CreateOrganizationDto {
    @IsString()
    @Length(1, 200)
    name: string

    @IsEmail()
    ownerEmail: string
}

export class InvitationResponseDto {
    @Expose()
    id: string

    @Expose()
    email: string

    @Expose()
    role: AuthRole

    @Expose()
    expiresAt: Date

    // Raw, one-time value: this plan has no production email delivery, so the only way a caller learns
    // the invitation token is this response body. A future plan adding real email delivery would stop
    // returning it here and send it only in the email instead.
    @Expose()
    token: string
}

export class CreateOrganizationResponseDto {
    @Expose()
    organizationId: string

    @Expose()
    @Type(() => InvitationResponseDto)
    invitation: InvitationResponseDto
}

export class OrganizationParamsDto {
    @IsUUID()
    organizationId: string
}

export class IssueInvitationDto {
    @IsEmail()
    email: string

    @IsIn(['owner', 'admin', 'member'])
    role: AuthRole
}

export class AcceptInvitationParamsDto {
    @IsString()
    @IsNotEmpty()
    token: string
}

export class AcceptInvitationDto {
    @IsString()
    @MinLength(12)
    password: string
}

export class AcceptInvitationResponseDto {
    @Expose()
    organizationId: string

    @Expose()
    role: AuthRole

    @Expose()
    email: string
}

export class MembershipParamsDto extends OrganizationParamsDto {
    @IsUUID()
    membershipId: string
}

export class ChangeMembershipRoleDto {
    @IsIn(['owner', 'admin', 'member'])
    role: AuthRole
}

export class MembershipResponseDto {
    @Expose()
    id: string

    @Expose()
    email: string | null

    @Expose()
    role: AuthRole

    @Expose()
    status: string
}
