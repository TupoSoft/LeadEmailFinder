import { IsVerifiableEmail } from '../is-verifiable-email.decorator'

export class BatchEmailVerificationCsvRowDto {
    @IsVerifiableEmail()
    email: string
}
