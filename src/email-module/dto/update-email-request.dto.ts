import { EmailPatternEnum } from '../../common'
import { IsBoolean, IsEnum, IsOptional, ValidateIf } from 'class-validator'

export class UpdateEmailRequestDto {
    @IsEnum(EmailPatternEnum)
    @IsOptional()
    format?: EmailPatternEnum

    @IsBoolean()
    @ValidateIf((_object, value: boolean | null) => value !== null)
    exists?: boolean | null
}
