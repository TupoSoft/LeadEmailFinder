import { EmailPatternEnum, IEmailVerificationRequestDto } from '../common'

export class EmailVerificationRequestDto implements IEmailVerificationRequestDto {
    email: string
    format?: EmailPatternEnum
}
