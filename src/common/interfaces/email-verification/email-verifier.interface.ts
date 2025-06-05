import { VerifyOptions } from './verify-options.interface'
import { IEmailVerificationResultDto } from './email-verification-result-dto.interface'

export interface IEmailVerifier {
    verify: (emailVerificationRequestDto: VerifyOptions) => Promise<IEmailVerificationResultDto>
}
