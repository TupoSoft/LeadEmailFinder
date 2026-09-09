import { ISmtpVerificationResponse } from '@tuposoft/lead-email-finder/common'
import { MailboxEvidence } from '../../domain/verification-evidence'

export const MAILBOX_PROBE = Symbol('MAILBOX_PROBE')

/** Server-owned evidence extends the shared response shape; a client input can never supply it. */
export interface MailboxProbeResult extends ISmtpVerificationResponse {
    evidence: MailboxEvidence
}

export interface MailboxProbe {
    probe(organizationId: string, email: string): Promise<MailboxProbeResult>
}
