import { IEmailVerificationRequestDto } from './email-verification-request-dto.interface'
import { IEmailVerificationResponseDto } from './email-verification-response-dto.interface'

export interface IEmailVerificationService {
    verify(emailVerificationRequest: IEmailVerificationRequestDto): Promise<IEmailVerificationResponseDto>
}
