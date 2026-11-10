import {
    CreditReservationAdmission,
    CreditReservationRecord,
    CreditReservationSettlement,
    CreditReservationStore,
} from '@tuposoft/lead-email-finder/modules/identity'
import {
    CreditReservationAmountConflict,
    CreditReservationConflict,
    CreditReservationNotFound,
    InsufficientCreditsException,
} from '../domain/credits.error'
import { CreditReservationService } from './credit-reservation.service'

const createdAt = new Date('2026-01-01T00:00:00.000Z')
const updatedAt = createdAt

function record(overrides: Partial<CreditReservationRecord> = {}): CreditReservationRecord {
    return {
        operationId: 'op-1',
        amount: 3,
        state: 'reserved',
        createdAt,
        updatedAt,
        settledAt: null,
        ...overrides,
    }
}

function admission(
    disposition: CreditReservationAdmission['disposition'],
    overrides: Partial<CreditReservationRecord> = {},
): CreditReservationAdmission {
    return { ...record(overrides), disposition }
}

function settlement(
    disposition: CreditReservationSettlement['disposition'],
    overrides: Partial<CreditReservationRecord> = {},
): CreditReservationSettlement {
    return { ...record(overrides), disposition }
}

describe('CreditReservationService', () => {
    let store: jest.Mocked<CreditReservationStore>
    let service: CreditReservationService

    beforeEach(() => {
        store = {
            reserveMany: jest.fn(),
            getReservation: jest.fn(),
            capture: jest.fn(),
            release: jest.fn(),
            closeAdmissionMany: jest.fn(),
        }
        service = new CreditReservationService(store)
    })

    describe('reserve', () => {
        it('delegates to reserveMany with a single item and unwraps the result', async () => {
            store.reserveMany.mockResolvedValue({
                kind: 'admitted',
                reservations: [admission('inserted')],
            })

            await expect(service.reserve('org-1', { operationId: 'op-1', amount: 3 })).resolves.toEqual(
                admission('inserted'),
            )
            expect(store.reserveMany).toHaveBeenCalledWith('org-1', [{ operationId: 'op-1', amount: 3 }])
        })
    })

    describe('reserveMany', () => {
        it('rejects a nonpositive amount without calling the store', async () => {
            await expect(service.reserveMany('org-1', [{ operationId: 'op-1', amount: 0 }])).rejects.toThrow(
                'positive safe integer',
            )
            expect(store.reserveMany).not.toHaveBeenCalled()
        })

        it('rejects a non-integer amount without calling the store', async () => {
            await expect(service.reserveMany('org-1', [{ operationId: 'op-1', amount: 1.5 }])).rejects.toThrow(
                'positive safe integer',
            )
            expect(store.reserveMany).not.toHaveBeenCalled()
        })

        it('rejects a duplicate operation ID within one input without calling the store', async () => {
            await expect(
                service.reserveMany('org-1', [
                    { operationId: 'op-1', amount: 1 },
                    { operationId: 'op-1', amount: 2 },
                ]),
            ).rejects.toThrow('repeat an operation ID')
            expect(store.reserveMany).not.toHaveBeenCalled()
        })

        it('rejects an empty item list without calling the store', async () => {
            await expect(service.reserveMany('org-1', [])).rejects.toThrow('at least one item')
            expect(store.reserveMany).not.toHaveBeenCalled()
        })

        it('returns admitted reservations in input order', async () => {
            store.reserveMany.mockResolvedValue({
                kind: 'admitted',
                reservations: [admission('existing'), admission('inserted', { operationId: 'op-2' })],
            })

            await expect(
                service.reserveMany('org-1', [
                    { operationId: 'op-1', amount: 3 },
                    { operationId: 'op-2', amount: 3 },
                ]),
            ).resolves.toEqual([admission('existing'), admission('inserted', { operationId: 'op-2' })])
        })

        it('throws InsufficientCreditsException when the store reports insufficient-balance', async () => {
            store.reserveMany.mockResolvedValue({ kind: 'insufficient-balance' })

            await expect(service.reserveMany('org-1', [{ operationId: 'op-1', amount: 3 }])).rejects.toBeInstanceOf(
                InsufficientCreditsException,
            )
        })

        it('throws CreditReservationAmountConflict when the store reports an amount conflict', async () => {
            store.reserveMany.mockResolvedValue({ kind: 'amount-conflict', operationId: 'op-1' })

            const error = await service
                .reserveMany('org-1', [{ operationId: 'op-1', amount: 3 }])
                .catch((caught: unknown) => caught)

            expect(error).toBeInstanceOf(CreditReservationAmountConflict)
            expect((error as CreditReservationAmountConflict).operationId).toBe('op-1')
        })
    })

    describe('getReservation', () => {
        it('delegates to the store and maps a found record', async () => {
            store.getReservation.mockResolvedValue(record())

            await expect(service.getReservation('org-1', 'op-1')).resolves.toEqual(record())
            expect(store.getReservation).toHaveBeenCalledWith('org-1', 'op-1')
        })

        it('returns null when no reservation exists', async () => {
            store.getReservation.mockResolvedValue(null)

            await expect(service.getReservation('org-1', 'op-1')).resolves.toBeNull()
        })
    })

    describe('capture', () => {
        it('returns the settlement when the store reports settled', async () => {
            store.capture.mockResolvedValue({
                kind: 'settled',
                reservation: settlement('applied', { state: 'captured' }),
            })

            await expect(service.capture('org-1', 'op-1')).resolves.toEqual(
                settlement('applied', { state: 'captured' }),
            )
        })

        it('throws CreditReservationNotFound when the store reports missing', async () => {
            store.capture.mockResolvedValue({ kind: 'missing' })

            await expect(service.capture('org-1', 'op-1')).rejects.toBeInstanceOf(CreditReservationNotFound)
        })

        it('throws CreditReservationConflict when the store reports a conflict', async () => {
            store.capture.mockResolvedValue({ kind: 'conflict' })

            await expect(service.capture('org-1', 'op-1')).rejects.toBeInstanceOf(CreditReservationConflict)
        })
    })

    describe('release', () => {
        it('returns the settlement when the store reports settled', async () => {
            store.release.mockResolvedValue({
                kind: 'settled',
                reservation: settlement('applied', { state: 'released' }),
            })

            await expect(service.release('org-1', 'op-1')).resolves.toEqual(
                settlement('applied', { state: 'released' }),
            )
        })

        it('throws CreditReservationNotFound when the store reports missing', async () => {
            store.release.mockResolvedValue({ kind: 'missing' })

            await expect(service.release('org-1', 'op-1')).rejects.toBeInstanceOf(CreditReservationNotFound)
        })

        it('throws CreditReservationConflict when the store reports a conflict', async () => {
            store.release.mockResolvedValue({ kind: 'conflict' })

            await expect(service.release('org-1', 'op-1')).rejects.toBeInstanceOf(CreditReservationConflict)
        })
    })

    describe('closeAdmissionMany', () => {
        it('validates input before calling the store', async () => {
            await expect(service.closeAdmissionMany('org-1', [])).rejects.toThrow('at least one item')
            expect(store.closeAdmissionMany).not.toHaveBeenCalled()
        })

        it('returns closure settlements', async () => {
            store.closeAdmissionMany.mockResolvedValue({
                kind: 'closed',
                reservations: [settlement('applied', { state: 'released' })],
            })

            await expect(service.closeAdmissionMany('org-1', [{ operationId: 'op-1', amount: 3 }])).resolves.toEqual([
                settlement('applied', { state: 'released' }),
            ])
        })

        it('throws CreditReservationConflict for an amount conflict', async () => {
            store.closeAdmissionMany.mockResolvedValue({ kind: 'amount-conflict', operationId: 'op-1' })

            await expect(
                service.closeAdmissionMany('org-1', [{ operationId: 'op-1', amount: 3 }]),
            ).rejects.toBeInstanceOf(CreditReservationConflict)
        })

        it('throws CreditReservationConflict when an ID is already captured', async () => {
            store.closeAdmissionMany.mockResolvedValue({ kind: 'already-captured', operationId: 'op-1' })

            await expect(
                service.closeAdmissionMany('org-1', [{ operationId: 'op-1', amount: 3 }]),
            ).rejects.toBeInstanceOf(CreditReservationConflict)
        })
    })
})
