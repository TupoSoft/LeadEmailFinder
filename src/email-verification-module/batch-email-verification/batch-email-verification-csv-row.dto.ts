import { IsEmail } from 'class-validator'

export class BatchEmailVerificationCsvRowDto {
    @IsEmail({ host_blacklist: ['tuposoft.com', 'localhost'] })
    email: string
}
