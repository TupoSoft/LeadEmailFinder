import { IsEmail } from 'class-validator'
import { HOST_BLACKLIST } from '../email-verification.constants'

export class BatchEmailVerificationCsvRowDto {
    @IsEmail({ host_blacklist: HOST_BLACKLIST })
    email: string
}
