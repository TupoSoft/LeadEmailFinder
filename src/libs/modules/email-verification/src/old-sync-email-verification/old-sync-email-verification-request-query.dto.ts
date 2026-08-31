import { IsVerifiableEmail } from '../is-verifiable-email.decorator'

export class OldSyncEmailVerificationRequestQueryDto {
    @IsVerifiableEmail()
    email: string
}
