import { IEmailVerificationRequestDto } from '../../common'
import { IsVerifiableEmail } from '../is-verifiable-email.decorator'

export class EmailVerificationRequestDto implements IEmailVerificationRequestDto {
    @IsVerifiableEmail()
    email: string
}
