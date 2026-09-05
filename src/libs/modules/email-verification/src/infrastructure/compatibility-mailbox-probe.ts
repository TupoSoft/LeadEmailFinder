import { ISmtpVerifier } from '@tuposoft/lead-email-finder/common'
import { MailboxProbe, MailboxProbeResult } from '../application/ports/mailbox-probe'

/** Wraps the existing SMTP verifier unchanged; module-architecture/14 replaces this with a real adapter. */
export class CompatibilityMailboxProbe implements MailboxProbe {
    constructor(private readonly smtpVerifier: ISmtpVerifier) {}

    async probe(organizationId: string, email: string): Promise<MailboxProbeResult> {
        return this.smtpVerifier.verify(organizationId, email)
    }
}
