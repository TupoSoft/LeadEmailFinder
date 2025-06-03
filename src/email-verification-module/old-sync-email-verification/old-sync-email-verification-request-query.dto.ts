import { IEmailVerificationRequestDto } from '../../common'
import { IsVerifiableEmail } from '../is-verifiable-email.decorator'

export class OldSyncEmailVerificationRequestQueryDto implements IEmailVerificationRequestDto {
    @IsVerifiableEmail()
    email: string
}
