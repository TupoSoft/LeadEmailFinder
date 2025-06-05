import { VerifyOptions } from './verify-options.interface'
import { IEmailVerificationResponseDto } from './email-verification-response-dto.interface'

export interface IEmailVerificationService {
    verify(verifyOptions: VerifyOptions): Promise<IEmailVerificationResponseDto>
}
