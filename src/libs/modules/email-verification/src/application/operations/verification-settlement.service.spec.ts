import { CreditReservationService } from '@tuposoft/lead-email-finder/modules/credits'
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
    let service: VerificationSettlementService

    beforeEach(() => {
        settlements = {
            persistResultAndIntention: jest.fn(),
            findIntention: jest.fn(),
            confirmSettlement: jest.fn(),
            pagePendingIntentions: jest.fn(),
        }
        credits = { capture: jest.fn(), release: jest.fn() }
        service = new VerificationSettlementService(settlements, credits as unknown as CreditReservationService)
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
    })

    it('is a no-op replay when the intention is already confirmed', async () => {
        settlements.findIntention.mockResolvedValue(intention({ state: 'confirmed', confirmedAt: new Date() }))
        await service.settle(executionId, organizationId)
        expect(credits.capture).not.toHaveBeenCalled()
        expect(settlements.confirmSettlement).not.toHaveBeenCalled()
    })

    it('confirms after a replayed capture that already applied on a prior crash-interrupted attempt', async () => {
        settlements.findIntention.mockResolvedValue(intention())
        credits.capture.mockResolvedValue({ disposition: 'replayed' } as never)
        await service.settle(executionId, organizationId)
        expect(settlements.confirmSettlement).toHaveBeenCalledWith(executionId, organizationId)
    })
})
