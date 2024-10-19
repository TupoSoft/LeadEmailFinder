import type { EmailVerification } from '../domain/entities/EmailVerification'

export interface EmailVerificationRepository {
    save: (emailVerification: EmailVerification) => Promise<void>
    findById: (id: string) => Promise<EmailVerification | null>
}
