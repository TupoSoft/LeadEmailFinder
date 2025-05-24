import { ICreateEmailRequestDto } from './create-email-options.interface'
import { IUpdateEmailRequestDto } from './update-email-request-dto.interface'
import { IEmailResponseDto } from './email-response-dto.interface'

export interface IEmailService {
    createEmail(options: ICreateEmailRequestDto): Promise<IEmailResponseDto>

    getEmails(): Promise<IEmailResponseDto[]>

    getEmail(email: string): Promise<IEmailResponseDto>

    updateEmail(email: string, options: IUpdateEmailRequestDto): Promise<IEmailResponseDto>
}
