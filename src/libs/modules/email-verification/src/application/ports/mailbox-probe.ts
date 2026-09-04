import { ISmtpVerificationResponse } from '@tuposoft/lead-email-finder/common'

export const MAILBOX_PROBE = Symbol('MAILBOX_PROBE')

export type MailboxProbeResult = ISmtpVerificationResponse

export interface MailboxProbe {
    probe(organizationId: string, email: string): Promise<MailboxProbeResult>
}
