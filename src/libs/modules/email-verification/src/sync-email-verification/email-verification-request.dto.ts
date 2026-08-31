import { IsVerifiableEmail } from '../is-verifiable-email.decorator'

export class EmailVerificationRequestDto {
    @IsVerifiableEmail()
    email: string
}
