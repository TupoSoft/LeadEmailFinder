import { EmailPatternEnum } from '../../enums'

export interface IEmailVerificationRequestDto {
    email: string
    format?: EmailPatternEnum
}
