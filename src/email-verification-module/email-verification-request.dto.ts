import { EmailPatternEnum, IEmailVerificationRequestDto } from '../common'
import { IsEmail, IsEnum, IsOptional } from 'class-validator'

export class EmailVerificationRequestDto implements IEmailVerificationRequestDto {
    @IsEmail()
    email: string

    @IsOptional()
    @IsEnum(EmailPatternEnum)
    format?: EmailPatternEnum
}
