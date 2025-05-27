import { IEmailVerificationRequestDto } from '../../common'
import { IsEmail } from 'class-validator'

export class EmailVerificationRequestDto implements IEmailVerificationRequestDto {
    @IsEmail()
    email: string
}
