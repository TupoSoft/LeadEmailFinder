import { EmailResponseDto } from '../../../email-module/dto'
import { ICreateEmailOptions } from './create-email-options.interface'

export type IUpdateEmailOptions = Partial<Pick<ICreateEmailOptions, 'format' | 'exists'>>

export interface IEmailService {
    createEmail(options: ICreateEmailOptions): Promise<EmailResponseDto>

    getEmails(): Promise<EmailResponseDto[]>

    getEmail(email: string): Promise<EmailResponseDto>

    updateEmail(email: string, options: IUpdateEmailOptions): Promise<EmailResponseDto>
}
