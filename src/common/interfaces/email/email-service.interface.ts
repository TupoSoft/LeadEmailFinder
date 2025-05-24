import { EmailResponseDto } from '../../../email-module/dto'
import { ICreateEmailRequestDto } from './create-email-options.interface'
import { IUpdateEmailRequestDto } from './update-email-request-dto.interface'

export interface IEmailService {
    createEmail(options: ICreateEmailRequestDto): Promise<EmailResponseDto>

    getEmails(): Promise<EmailResponseDto[]>

    getEmail(email: string): Promise<EmailResponseDto>

    updateEmail(email: string, options: IUpdateEmailRequestDto): Promise<EmailResponseDto>
}
