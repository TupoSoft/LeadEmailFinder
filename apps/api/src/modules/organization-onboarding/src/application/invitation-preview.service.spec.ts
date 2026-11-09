import { InvitationPreviewReader, InvitationPreviewRecord } from '@tuposoft/lead-email-finder/modules/identity'
import { InvitationConsumedError, InvitationExpiredError, InvitationNotFoundError } from '../domain/organization-onboarding.errors'
import { hashInvitationToken } from '../domain/invitation-token'
import { InvitationPreviewService } from './invitation-preview.service'

describe('InvitationPreviewService', () => {
    const record: InvitationPreviewRecord = {
        organizationName: 'Acme', email: 'invitee@example.test', role: 'member',
        expiresAt: new Date('2100-01-01T00:00:00Z'), status: 'pending',
    }
    let reader: jest.Mocked<InvitationPreviewReader>
    let service: InvitationPreviewService
    beforeEach(() => {
        reader = { findByTokenHash: jest.fn() }
        service = new InvitationPreviewService(reader)
    })
    it('hashes authority and returns only pending display fields', async () => {
        reader.findByTokenHash.mockResolvedValue({ ...record, internalId: 'not-public' } as InvitationPreviewRecord)
        expect(await service.preview('test-authority')).toEqual(record)
        expect(reader.findByTokenHash).toHaveBeenCalledWith(hashInvitationToken('test-authority'))
    })
    it('rejects unknown authority', async () => {
        await expect(service.preview('test-authority')).rejects.toThrow(InvitationNotFoundError)
    })
    it('rejects expired authority using a deterministic past fixture', async () => {
        reader.findByTokenHash.mockResolvedValue({ ...record, expiresAt: new Date('2000-01-01T00:00:00Z') })
        await expect(service.preview('test-authority')).rejects.toThrow(InvitationExpiredError)
    })
    it('rejects consumed authority even when its original expiry is in the past', async () => {
        reader.findByTokenHash.mockResolvedValue({ ...record, status: 'accepted', expiresAt: new Date('2000-01-01T00:00:00Z') })
        await expect(service.preview('test-authority')).rejects.toThrow(InvitationConsumedError)
    })
})
