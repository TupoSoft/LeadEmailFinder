import { EmailPatternEnum } from '../../common'
import { IsBoolean, IsEnum, IsOptional, ValidateIf } from 'class-validator'
import { IUpdateEmailRequestDto } from '../../common/interfaces/email/update-email-request-dto.interface'

export class UpdateEmailRequestDto implements IUpdateEmailRequestDto {
    @IsEnum(EmailPatternEnum)
    @IsOptional()
    format?: EmailPatternEnum

    @IsBoolean()
    @ValidateIf((_object, value: boolean | null) => value !== null)
    exists?: boolean | null
}
