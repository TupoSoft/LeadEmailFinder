import { ISmtpVerificationResponse } from '@tuposoft/lead-email-finder/common'
import { MailboxEvidence } from '../../domain/verification-evidence'

export const MAILBOX_PROBE = Symbol('MAILBOX_PROBE')

/** Server-owned evidence extends the shared response shape; a client input can never supply it. */
export interface MailboxProbeResult extends ISmtpVerificationResponse {
    evidence: MailboxEvidence
}

export interface MailboxProbe {
    /** `signal`, when supplied, aborts an in-flight connection or command — the caller's lease was lost or its
     *  generation superseded. The financial fence remains authoritative even if an unresponsive process misses
     *  the abort; this only closes the socket promptly when the process is responsive. */
    probe(organizationId: string, email: string, signal?: AbortSignal): Promise<MailboxProbeResult>
}
