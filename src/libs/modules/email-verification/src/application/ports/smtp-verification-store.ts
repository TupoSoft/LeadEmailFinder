import { SmtpVerification } from '../../domain/smtp-verification'

export const SMTP_VERIFICATION_STORE = Symbol('SMTP_VERIFICATION_STORE')

export type SmtpVerificationUpdate = Omit<SmtpVerification, 'organizationId' | 'id' | 'createdAt' | 'updatedAt'>

/** Consumed by the future real `MailboxProbe` adapter (module-architecture/14), not by application code. */
export interface SmtpVerificationStore {
    findByAddress(organizationId: string, address: string): Promise<SmtpVerification | null>

    upsert(organizationId: string, address: string, changes: SmtpVerificationUpdate): Promise<SmtpVerification>
}
