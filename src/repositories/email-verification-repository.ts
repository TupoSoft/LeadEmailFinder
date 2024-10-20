import type { EmailVerification } from '../entities'

export interface EmailVerificationRepository {
    save: (emailVerification: EmailVerification) => Promise<void>
    findById: (id: string) => Promise<EmailVerification | null>
}
