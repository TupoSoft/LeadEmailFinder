import { EmailPatternEnum } from '../../common'

export class EmailVerificationRequestDto {
    email: string
    format?: EmailPatternEnum
}
