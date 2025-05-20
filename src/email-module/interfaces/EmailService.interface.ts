import { EmailPatternEnum } from '../../common'
import { EmailResponseDto } from '../dto'

export interface CreateEmailOptions {
    email: string
    exists: boolean | null
    format?: EmailPatternEnum
}

export type UpdateEmailOptions = Partial<Pick<CreateEmailOptions, 'format' | 'exists'>>

export interface IEmailService {
    createEmail(options: CreateEmailOptions): Promise<EmailResponseDto>

    getEmails(): Promise<EmailResponseDto[]>

    getEmail(email: string): Promise<EmailResponseDto>

    updateEmail(email: string, options: UpdateEmailOptions): Promise<EmailResponseDto>
}
