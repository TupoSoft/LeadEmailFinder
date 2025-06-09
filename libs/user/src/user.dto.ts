import { IsEmail, IsString, MinLength, IsOptional, IsBoolean } from 'class-validator'
import { Expose, Transform } from 'class-transformer'

export class CreateUserDto {
    @IsEmail()
    email: string

    @IsString()
    @MinLength(6)
    password: string

    @IsString()
    name: string
}

export class UpdateUserDto {
    @IsOptional()
    @IsString()
    name?: string

    @IsOptional()
    @IsString()
    @MinLength(6)
    password?: string

    @IsOptional()
    @IsBoolean()
    isActive?: boolean
}

export class LoginDto {
    @IsEmail()
    email: string

    @IsString()
    password: string
}

export class RefreshTokenDto {
    @IsString()
    refreshToken: string
}

export class UserResponseDto {
    @Expose()
    @Transform(({ obj }) => obj._id.toString())
    id: string

    @Expose()
    email: string

    @Expose()
    name: string

    @Expose()
    isActive: boolean

    @Expose()
    isAdmin: boolean

    @Expose()
    createdAt: Date

    @Expose()
    updatedAt: Date
}

export class AuthResponseDto {
    @Expose()
    user: UserResponseDto

    @Expose()
    accessToken: string

    @Expose()
    refreshToken: string
}
