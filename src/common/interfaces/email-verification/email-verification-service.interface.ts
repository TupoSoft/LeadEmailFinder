import { IEmailVerificationRequestDto } from './email-verification-request-dto.interface'
import { IEmailVerificationResultDto } from './email-verification-result-dto.interface'

export interface IEmailVerificationService {
    verify(emailVerificationRequest: IEmailVerificationRequestDto): Promise<IEmailVerificationResultDto>
}
