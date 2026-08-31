import { ICreateEmailRequestDto } from './create-email-options.interface'
import { IUpdateEmailRequestDto } from './update-email-request-dto.interface'
import { IEmailResponseDto } from './email-response-dto.interface'

export interface IEmailService {
    createEmail(organizationId: string, options: ICreateEmailRequestDto): Promise<IEmailResponseDto>

    getEmails(organizationId: string): Promise<IEmailResponseDto[]>

    getEmail(organizationId: string, email: string): Promise<IEmailResponseDto>

    updateEmail(organizationId: string, email: string, options: IUpdateEmailRequestDto): Promise<IEmailResponseDto>

    upsertEmail(organizationId: string, email: string, options: IUpdateEmailRequestDto): Promise<IEmailResponseDto>
}
