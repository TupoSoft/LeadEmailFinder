import { IEmailVerificationRequestDto } from './email-verification-request-dto.interface'
import { IEmailVerificationResultDto } from './email-verification-result-dto.interface'

export interface IEmailVerifier {
    verify: (emailVerificationRequestDto: IEmailVerificationRequestDto) => Promise<IEmailVerificationResultDto>
}
