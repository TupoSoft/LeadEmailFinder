import { ISmtpVerifier } from '@tuposoft/lead-email-finder/common'
import { CompatibilityMailboxProbe } from './compatibility-mailbox-probe'

describe('CompatibilityMailboxProbe', () => {
    it('delegates the probe to the existing SMTP verifier unchanged', async () => {
        const smtpVerifier: jest.Mocked<ISmtpVerifier> = {
            verify: jest.fn().mockResolvedValue({ email: 'person@example.com', exists: true, reason: 'accepted_email' }),
        }
        const probe = new CompatibilityMailboxProbe(smtpVerifier)

        await expect(probe.probe('org-1', 'person@example.com')).resolves.toEqual({
            email: 'person@example.com',
            exists: true,
            reason: 'accepted_email',
        })
        expect(smtpVerifier.verify).toHaveBeenCalledWith('org-1', 'person@example.com')
    })
})
