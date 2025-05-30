import { IEmailVerificationRequestDto } from '../../common'
import { IsEmail } from 'class-validator'
import { HOST_BLACKLIST } from '../email-verification.constants'

export class EmailVerificationRequestDto implements IEmailVerificationRequestDto {
    @IsEmail({ host_blacklist: HOST_BLACKLIST })
    email: string
}
