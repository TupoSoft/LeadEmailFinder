import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { Expose, Transform } from 'class-transformer'
import { IsEmail, IsOptional, IsString, MaxLength, MinLength } from 'class-validator'
import { SIGN_IN_STATES, SignInState } from '../application/native-sign-in-state.service'

export class MagicLinkRequestDto {
    @ApiProperty({ format: 'email', description: 'Email address of the invited or seeded account.' })
    @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
    @IsEmail()
    @MaxLength(254)
    email: string

    @ApiPropertyOptional({ description: 'Relative destination under /app; invalid destinations use /app.' })
    @IsOptional()
    @IsString()
    @MaxLength(2048)
    destination?: string
}

export class MagicLinkVerifyDto {
    @ApiProperty({ description: 'One-time email-link token; never supplied in a URL or query parameter.' })
    @IsString()
    @MinLength(1)
    @MaxLength(2048)
    token: string
}

export class MfaCodeDto {
    @ApiProperty({ description: 'Authenticator code or single-use recovery code.' })
    @IsString()
    @MinLength(1)
    @MaxLength(256)
    code: string
}

/** An empty object also makes unsupported mutation fields fail validation. */
export class EmptyAuthMutationDto {}

export class SignInStateDto {
    @ApiProperty({ enum: SIGN_IN_STATES })
    @Expose()
    state: SignInState
}

export class MagicLinkAcceptedDto {
    @ApiProperty({ enum: ['accepted'] })
    @Expose()
    status: 'accepted'
}

export class MagicLinkVerifiedDto extends SignInStateDto {
    @ApiProperty({ description: 'Validated relative application destination from the server-owned attempt.' })
    @Expose()
    destination: string
}

export class MfaEnrollmentDto {
    @ApiProperty({ description: 'Sensitive enrollment URI; display only on the local enrollment screen.' })
    @Expose()
    totpUri: string

    @ApiProperty({ type: String, isArray: true, description: 'Sensitive single-use codes, shown only once.' })
    @Expose()
    recoveryCodes: string[]
}

export class AuthenticationUnavailableDto {
    @ApiProperty({ enum: ['authentication_unavailable'] })
    @Expose()
    code: 'authentication_unavailable'
}
