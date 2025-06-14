import { VerifyOptions } from '@tuposoft/lead-email-finder/common'
import { IsVerifiableEmail } from '../is-verifiable-email.decorator'

export class EmailVerificationRequestDto implements VerifyOptions {
    @IsVerifiableEmail()
    email: string
}
