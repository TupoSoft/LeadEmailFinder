import { EmailPatternEnum } from '@tuposoft/lead-email-finder/common'
import { IsBoolean, IsEnum, IsOptional, IsString, ValidateIf } from 'class-validator'

export class CreateEmailRequestDto {
    @IsString()
    email: string

    @IsEnum(EmailPatternEnum)
    @IsOptional()
    format?: EmailPatternEnum

    @IsBoolean()
    @ValidateIf((_object, value: boolean | null) => value !== null)
    exists: boolean | null
}
