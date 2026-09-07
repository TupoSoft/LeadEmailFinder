import { ApiProperty } from '@nestjs/swagger'
import { Expose, Type } from 'class-transformer'
import { IsEmail, IsIn, IsNotEmpty, IsString, IsUUID, Length, MinLength } from 'class-validator'
import { AuthRole, MembershipStatus } from '@tuposoft/lead-email-finder/modules/identity'

export class CreateOrganizationDto {
    @IsString()
    @Length(1, 200)
    name: string

    @IsEmail()
    ownerEmail: string
}

export class InvitationResponseDto {
    @Expose()
    @ApiProperty({ type: String, format: 'uuid' })
    id: string

    @Expose()
    @ApiProperty({ type: String, format: 'email' })
    email: string

    @Expose()
    @ApiProperty({ enum: ['owner', 'admin', 'member'] })
    role: AuthRole

    @Expose()
    @ApiProperty({ type: String, format: 'date-time' })
    expiresAt: Date

    // Raw, one-time value: this plan has no production email delivery, so the only way a caller learns
    // the invitation token is this response body. A future plan adding real email delivery would stop
    // returning it here and send it only in the email instead.
    @Expose()
    @ApiProperty({
        type: String,
        description: 'One-time secret. Keep only in ephemeral memory; never log or persist it.',
    })
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
    @ApiProperty({ type: String, format: 'email' })
    email: string

    @IsIn(['owner', 'admin', 'member'])
    @ApiProperty({ enum: ['owner', 'admin', 'member'] })
    role: AuthRole
}

export class AcceptInvitationParamsDto {
    @IsString()
    @IsNotEmpty()
    @ApiProperty({
        type: String,
        description: 'One-time secret. Keep only in ephemeral memory; never log or persist it.',
    })
    token: string
}

export class AcceptInvitationDto {
    @IsString()
    @MinLength(12)
    @ApiProperty({
        type: String,
        minLength: 12,
        writeOnly: true,
        description: 'New-account password; minimum 12 characters.',
    })
    password: string
}

export class AcceptInvitationResponseDto {
    @Expose()
    organizationId: string

    @Expose()
    @ApiProperty({ enum: ['owner', 'admin', 'member'] })
    role: AuthRole

    @Expose()
    @ApiProperty({ type: String, format: 'email' })
    email: string
}

export class MembershipParamsDto extends OrganizationParamsDto {
    @IsUUID()
    membershipId: string
}

export class ChangeMembershipRoleDto {
    @IsIn(['owner', 'admin', 'member'])
    @ApiProperty({ enum: ['owner', 'admin', 'member'] })
    role: AuthRole
}

export class MembershipResponseDto {
    @Expose()
    @ApiProperty({ type: String, format: 'uuid' })
    id: string

    @Expose()
    @ApiProperty({ type: String, nullable: true, format: 'email' })
    email: string | null

    @Expose()
    @ApiProperty({ enum: ['owner', 'admin', 'member'] })
    role: AuthRole

    @Expose()
    @ApiProperty({ enum: ['active', 'disabled'] })
    status: MembershipStatus
}

export class InvitationAcceptedResponseDto {
    @Expose()
    @ApiProperty({ enum: ['accepted'] })
    status: 'accepted'
}

export class InvitationPreviewResponseDto {
    @Expose()
    @ApiProperty({ type: String })
    organizationName: string

    @Expose()
    @ApiProperty({ type: String, format: 'email' })
    email: string

    @Expose()
    @ApiProperty({ enum: ['owner', 'admin', 'member'] })
    role: AuthRole

    @Expose()
    @ApiProperty({ type: String, format: 'date-time' })
    expiresAt: Date

    @Expose()
    @ApiProperty({ enum: ['pending'] })
    status: 'pending'
}

export class InvitationGoneResponseDto {
    @ApiProperty({ enum: ['invitation_expired', 'invitation_consumed'] })
    code: 'invitation_expired' | 'invitation_consumed'

    @ApiProperty({ enum: [410] })
    statusCode: 410

    @ApiProperty({ type: String, description: 'Generic reason without invitation or membership details.' })
    message: string
}
