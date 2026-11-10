import { CreditReservationService } from '@tuposoft/lead-email-finder/modules/credits'
import { EmailAdministrationService } from '../email-administration.service'
import { VerificationSettlementStore } from '../ports/verification-settlement-store'
import { VerificationSettlementService } from './verification-settlement.service'

const organizationId = '10000000-0000-4000-8000-000000000001'
const executionId = 'execution-1'

function intention(
    overrides: Partial<Awaited<ReturnType<VerificationSettlementStore['findIntention']>>> = {},
): NonNullable<Awaited<ReturnType<VerificationSettlementStore['findIntention']>>> {
    return {
        executionId,
        organizationId,
        decision: 'capture' as const,
        resultId: 'result-1',
        state: 'pending' as const,
        createdAt: new Date(),
        confirmedAt: null,
        ...overrides,
    }
}

describe('VerificationSettlementService', () => {
    let settlements: jest.Mocked<VerificationSettlementStore>
    let credits: jest.Mocked<Pick<CreditReservationService, 'capture' | 'release'>>
    let emailAdministration: jest.Mocked<Pick<EmailAdministrationService, 'upsertEmail'>>
    let service: VerificationSettlementService

    beforeEach(() => {
        settlements = {
            persistResultAndIntention: jest.fn(),
            findIntention: jest.fn(),
            confirmSettlement: jest
                .fn()
                .mockResolvedValue({ resultId: 'result-1', normalizedAddress: 'person@example.test', exists: true }),
            pagePendingIntentions: jest.fn(),
        }
        credits = { capture: jest.fn(), release: jest.fn() }
        emailAdministration = { upsertEmail: jest.fn() }
        service = new VerificationSettlementService(
            settlements,
            credits as unknown as CreditReservationService,
            emailAdministration as unknown as EmailAdministrationService,
        )
    })

    it('captures and confirms for a capture intention', async () => {
        settlements.findIntention.mockResolvedValue(intention())
        await service.settle(executionId, organizationId)
        expect(credits.capture).toHaveBeenCalledWith(organizationId, executionId)
        expect(credits.release).not.toHaveBeenCalled()
        expect(settlements.confirmSettlement).toHaveBeenCalledWith(executionId, organizationId)
    })

    it('releases and confirms for a release intention', async () => {
        settlements.findIntention.mockResolvedValue(intention({ decision: 'release' }))
        await service.settle(executionId, organizationId)
        expect(credits.release).toHaveBeenCalledWith(organizationId, executionId)
        expect(credits.capture).not.toHaveBeenCalled()
    })

    it('does nothing when no intention exists yet', async () => {
        settlements.findIntention.mockResolvedValue(null)
        await service.settle(executionId, organizationId)
        expect(credits.capture).not.toHaveBeenCalled()
        expect(credits.release).not.toHaveBeenCalled()
        expect(settlements.confirmSettlement).not.toHaveBeenCalled()
        expect(emailAdministration.upsertEmail).not.toHaveBeenCalled()
    })

    it('repairs cache publication on a confirmed replay without recapturing credits', async () => {
        settlements.findIntention.mockResolvedValue(intention({ state: 'confirmed', confirmedAt: new Date() }))
        await service.settle(executionId, organizationId)
        expect(credits.capture).not.toHaveBeenCalled()
        expect(settlements.confirmSettlement).toHaveBeenCalledWith(executionId, organizationId)
        expect(emailAdministration.upsertEmail).toHaveBeenCalledWith(organizationId, 'person@example.test', {
            exists: true,
            lastVerificationId: 'result-1',
        })
    })

    it('confirms after a replayed capture that already applied on a prior crash-interrupted attempt', async () => {
        settlements.findIntention.mockResolvedValue(intention())
        credits.capture.mockResolvedValue({ disposition: 'replayed' } as never)
        await service.settle(executionId, organizationId)
        expect(settlements.confirmSettlement).toHaveBeenCalledWith(executionId, organizationId)
    })

    it('advances the email cache last-verification link after settlement is confirmed', async () => {
        settlements.findIntention.mockResolvedValue(intention())
        settlements.confirmSettlement.mockResolvedValue({
            resultId: 'result-1',
            normalizedAddress: 'person@example.test',
            exists: true,
        })
        await service.settle(executionId, organizationId)
        expect(emailAdministration.upsertEmail).toHaveBeenCalledWith(organizationId, 'person@example.test', {
            exists: true,
            lastVerificationId: 'result-1',
        })
    })
})
