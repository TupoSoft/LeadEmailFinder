import { EmailVerification, NewEmailVerification } from '../../domain/email-verification'

export const VERIFICATION_STORE = Symbol('VERIFICATION_STORE')

export interface VerificationStore {
    create(organizationId: string, record: NewEmailVerification): Promise<EmailVerification>
}
