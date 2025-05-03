import { EmailPatternEnum } from '../enums'
import { Email } from '../Email.schema'

export interface CreateEmailOptions {
    email: string
    exists: boolean | null
    format?: EmailPatternEnum
}

export type UpdateEmailOptions = Partial<Pick<CreateEmailOptions, 'format' | 'exists'>>

export interface IEmailService {
    createEmail(options: CreateEmailOptions): Promise<Email>

    getEmails(): Promise<Email[]>

    getEmail(email: string): Promise<Email>

    updateEmail(email: string, options: UpdateEmailOptions): Promise<Email>
}
