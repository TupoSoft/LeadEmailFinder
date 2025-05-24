import { EmailPatternEnum } from '../../../common'
import { IsBoolean, IsEnum, IsOptional, IsString, ValidateIf } from 'class-validator'

export class CreateEmailRequestDto {
    @IsString()
    email: string

    @IsEnum(EmailPatternEnum as object)
    @IsOptional()
    format?: EmailPatternEnum

    @IsBoolean()
    @ValidateIf((_object, value: boolean | null) => value !== null)
    exists: boolean | null
}
