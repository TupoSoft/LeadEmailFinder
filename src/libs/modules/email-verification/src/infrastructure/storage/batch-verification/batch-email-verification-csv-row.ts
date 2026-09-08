import { IsVerifiableEmail } from './is-verifiable-email.decorator'

export class BatchEmailVerificationCsvRow {
    @IsVerifiableEmail()
    email: string
}
