import { VerifyOptions } from '@tuposoft/lead-email-finder/common'
import { IsVerifiableEmail } from '../is-verifiable-email.decorator'

export class OldSyncEmailVerificationRequestQueryDto implements VerifyOptions {
    @IsVerifiableEmail()
    email: string
}
