import { DataSource, EntityManager } from 'typeorm'
import { CreditDebit } from './credit-debit.entity'
import { CreditReservation } from './credit-reservation.entity'
import { OrganizationCreditAccount } from './organization-credit-account.entity'
import { TypeOrmCreditReservationStore } from './typeorm-credit-reservation-store'

type InsertMock = Record<'insert' | 'into' | 'values' | 'onConflict' | 'returning' | 'execute', jest.Mock>

function createInsertMock(): InsertMock {
    return {
        insert: jest.fn().mockReturnThis(),
        into: jest.fn().mockReturnThis(),
        values: jest.fn().mockReturnThis(),
        onConflict: jest.fn().mockReturnThis(),
        returning: jest.fn().mockReturnThis(),
        execute: jest.fn().mockResolvedValue({ raw: [] }),
    }
}

function account(overrides: Partial<OrganizationCreditAccount> = {}): OrganizationCreditAccount {
    return { organizationId: 'org-1', balance: 10, reserved: 0, ...overrides } as OrganizationCreditAccount
}

function reservation(overrides: Partial<CreditReservation> = {}): CreditReservation {
    return {
        organizationId: 'org-1',
        operationId: 'op-1',
        amount: 3,
        state: 'reserved',
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        updatedAt: new Date('2026-01-01T00:00:00.000Z'),
        settledAt: null,
        ...overrides,
    } as CreditReservation
}

describe('TypeOrmCreditReservationStore', () => {
    let store: TypeOrmCreditReservationStore
    let managerMock: jest.Mocked<
        Pick<
            EntityManager,
            'findOne' | 'findOneOrFail' | 'findBy' | 'findOneBy' | 'save' | 'insert' | 'createQueryBuilder'
        >
    >
    let dataSourceMock: { transaction: jest.Mock; manager: { findOneBy: jest.Mock } }
    let accountInsertMock: ReturnType<typeof createInsertMock>

    beforeEach(() => {
        managerMock = {
            findOne: jest.fn(),
            findOneOrFail: jest.fn(),
            findBy: jest.fn().mockResolvedValue([]),
            findOneBy: jest.fn(),
            save: jest.fn(),
            insert: jest.fn(),
            createQueryBuilder: jest.fn(),
        }
        accountInsertMock = createInsertMock()
        managerMock.createQueryBuilder.mockReturnValue(
            accountInsertMock as unknown as ReturnType<EntityManager['createQueryBuilder']>,
        )
        dataSourceMock = {
            transaction: jest.fn(async (callback: (manager: unknown) => Promise<unknown>) => callback(managerMock)),
            manager: { findOneBy: jest.fn() },
        }
        store = new TypeOrmCreditReservationStore(dataSourceMock as unknown as DataSource)
    })

    describe('reserveMany', () => {
        it('inserts missing operation IDs, increases reserved, and reports dispositions in input order', async () => {
            managerMock.findOneOrFail.mockResolvedValue(account({ balance: 10, reserved: 0 }))
            const existing = reservation({ operationId: 'op-existing', amount: 2 })
            managerMock.findBy
                .mockResolvedValueOnce([existing])
                .mockResolvedValueOnce([existing, reservation({ operationId: 'op-new', amount: 5 })])

            const outcome = await store.reserveMany('org-1', [
                { operationId: 'op-existing', amount: 2 },
                { operationId: 'op-new', amount: 5 },
            ])

            expect(outcome).toEqual({
                kind: 'admitted',
                reservations: [
                    expect.objectContaining({ operationId: 'op-existing', disposition: 'existing' }),
                    expect.objectContaining({ operationId: 'op-new', disposition: 'inserted' }),
                ],
            })
            expect(managerMock.insert).toHaveBeenCalledWith(CreditReservation, [
                { organizationId: 'org-1', operationId: 'op-new', amount: 5, state: 'reserved' },
            ])
            expect(managerMock.save).toHaveBeenCalledWith(
                OrganizationCreditAccount,
                expect.objectContaining({ reserved: 5 }),
            )
        })

        it('observes an existing reservation without reserving it again or changing the account', async () => {
            managerMock.findOneOrFail.mockResolvedValue(account({ balance: 10, reserved: 2 }))
            const existing = reservation({ operationId: 'op-1', amount: 2 })
            managerMock.findBy.mockResolvedValue([existing])

            const outcome = await store.reserveMany('org-1', [{ operationId: 'op-1', amount: 2 }])

            expect(outcome).toEqual({
                kind: 'admitted',
                reservations: [expect.objectContaining({ operationId: 'op-1', disposition: 'existing' })],
            })
            expect(managerMock.insert).not.toHaveBeenCalled()
            expect(managerMock.save).not.toHaveBeenCalled()
        })

        it('conflicts the entire group when an existing operation ID has a different amount', async () => {
            managerMock.findOneOrFail.mockResolvedValue(account({ balance: 10, reserved: 2 }))
            managerMock.findBy.mockResolvedValue([reservation({ operationId: 'op-1', amount: 2 })])

            await expect(
                store.reserveMany('org-1', [
                    { operationId: 'op-1', amount: 9 },
                    { operationId: 'op-2', amount: 1 },
                ]),
            ).resolves.toEqual({ kind: 'amount-conflict', operationId: 'op-1' })
            expect(managerMock.insert).not.toHaveBeenCalled()
            expect(managerMock.save).not.toHaveBeenCalled()
        })

        it('applies no new reservation when the missing total exceeds available credits', async () => {
            managerMock.findOneOrFail.mockResolvedValue(account({ balance: 10, reserved: 4 }))
            managerMock.findBy.mockResolvedValue([])

            await expect(store.reserveMany('org-1', [{ operationId: 'op-1', amount: 7 }])).resolves.toEqual({
                kind: 'insufficient-balance',
            })
            expect(managerMock.insert).not.toHaveBeenCalled()
            expect(managerMock.save).not.toHaveBeenCalled()
        })

        it('inserts the account before locking it', async () => {
            managerMock.findOneOrFail.mockResolvedValue(account({ balance: 0, reserved: 0 }))
            managerMock.findBy.mockResolvedValue([])

            await store.reserveMany('org-1', [{ operationId: 'op-1', amount: 1 }])

            expect(accountInsertMock.values).toHaveBeenCalledWith({ organizationId: 'org-1', balance: 0, reserved: 0 })
            expect(accountInsertMock.execute.mock.invocationCallOrder[0]).toBeLessThan(
                managerMock.findOneOrFail.mock.invocationCallOrder[0],
            )
        })
    })

    describe('getReservation', () => {
        it('returns the reservation record for the organization and operation', async () => {
            dataSourceMock.manager.findOneBy.mockResolvedValue(reservation())

            await expect(store.getReservation('org-1', 'op-1')).resolves.toEqual(
                expect.objectContaining({ operationId: 'op-1', amount: 3, state: 'reserved' }),
            )
        })

        it('returns null when no reservation exists', async () => {
            dataSourceMock.manager.findOneBy.mockResolvedValue(null)

            await expect(store.getReservation('org-1', 'op-1')).resolves.toBeNull()
        })
    })

    describe('capture', () => {
        it('captures a reserved hold: debits, decreases balance and reserved, and marks captured', async () => {
            managerMock.findOneOrFail.mockResolvedValue(account({ balance: 10, reserved: 3 }))
            managerMock.findOne.mockResolvedValueOnce(reservation({ amount: 3 })).mockResolvedValueOnce(null)
            managerMock.save.mockImplementation((_entity, value) => Promise.resolve(value))

            const outcome = await store.capture('org-1', 'op-1')

            expect(outcome).toEqual({
                kind: 'settled',
                reservation: expect.objectContaining({ state: 'captured', disposition: 'applied' }),
            })
            expect(managerMock.insert).toHaveBeenCalledWith(CreditDebit, {
                organizationId: 'org-1',
                reference: 'verification-reservation:op-1',
                amount: 3,
            })
            expect(managerMock.save).toHaveBeenCalledWith(
                OrganizationCreditAccount,
                expect.objectContaining({ balance: 7, reserved: 0 }),
            )
        })

        it('returns missing without mutation when no reservation exists', async () => {
            managerMock.findOneOrFail.mockResolvedValue(account())
            managerMock.findOne.mockResolvedValue(null)

            await expect(store.capture('org-1', 'op-1')).resolves.toEqual({ kind: 'missing' })
            expect(managerMock.save).not.toHaveBeenCalled()
        })

        it('replays an already-captured reservation without mutating the ledger again', async () => {
            managerMock.findOneOrFail.mockResolvedValue(account({ balance: 7, reserved: 0 }))
            managerMock.findOne.mockResolvedValueOnce(reservation({ state: 'captured' }))

            await expect(store.capture('org-1', 'op-1')).resolves.toEqual({
                kind: 'settled',
                reservation: expect.objectContaining({ state: 'captured', disposition: 'replayed' }),
            })
            expect(managerMock.save).not.toHaveBeenCalled()
            expect(managerMock.insert).not.toHaveBeenCalled()
        })

        it('conflicts the opposite transition from released to captured', async () => {
            managerMock.findOneOrFail.mockResolvedValue(account())
            managerMock.findOne.mockResolvedValueOnce(reservation({ state: 'released' }))

            await expect(store.capture('org-1', 'op-1')).resolves.toEqual({ kind: 'conflict' })
            expect(managerMock.save).not.toHaveBeenCalled()
        })

        it('conflicts instead of silently claiming success over an unexpected preexisting debit reference', async () => {
            managerMock.findOneOrFail.mockResolvedValue(account({ balance: 10, reserved: 3 }))
            managerMock.findOne.mockResolvedValueOnce(reservation({ amount: 3 })).mockResolvedValueOnce({
                organizationId: 'org-1',
                reference: 'verification-reservation:op-1',
                amount: 3,
            })

            await expect(store.capture('org-1', 'op-1')).resolves.toEqual({ kind: 'conflict' })
            expect(managerMock.save).not.toHaveBeenCalled()
        })
    })

    describe('release', () => {
        it('releases a reserved hold and decreases only reserved, inserting no grant or debit', async () => {
            managerMock.findOneOrFail.mockResolvedValue(account({ balance: 10, reserved: 3 }))
            managerMock.findOne.mockResolvedValue(reservation({ amount: 3 }))
            managerMock.save.mockImplementation((_entity, value) => Promise.resolve(value))

            const outcome = await store.release('org-1', 'op-1')

            expect(outcome).toEqual({
                kind: 'settled',
                reservation: expect.objectContaining({ state: 'released', disposition: 'applied' }),
            })
            expect(managerMock.save).toHaveBeenCalledWith(
                OrganizationCreditAccount,
                expect.objectContaining({ balance: 10, reserved: 0 }),
            )
            expect(managerMock.insert).not.toHaveBeenCalled()
        })

        it('returns missing without mutation when no reservation exists', async () => {
            managerMock.findOneOrFail.mockResolvedValue(account())
            managerMock.findOne.mockResolvedValue(null)

            await expect(store.release('org-1', 'op-1')).resolves.toEqual({ kind: 'missing' })
            expect(managerMock.save).not.toHaveBeenCalled()
        })

        it('replays an already-released reservation', async () => {
            managerMock.findOneOrFail.mockResolvedValue(account())
            managerMock.findOne.mockResolvedValue(reservation({ state: 'released' }))

            await expect(store.release('org-1', 'op-1')).resolves.toEqual({
                kind: 'settled',
                reservation: expect.objectContaining({ state: 'released', disposition: 'replayed' }),
            })
            expect(managerMock.save).not.toHaveBeenCalled()
        })

        it('conflicts the opposite transition from captured to released', async () => {
            managerMock.findOneOrFail.mockResolvedValue(account())
            managerMock.findOne.mockResolvedValue(reservation({ state: 'captured' }))

            await expect(store.release('org-1', 'op-1')).resolves.toEqual({ kind: 'conflict' })
            expect(managerMock.save).not.toHaveBeenCalled()
        })
    })

    describe('closeAdmissionMany', () => {
        it('inserts a durable released receipt for a missing ID without a preceding hold', async () => {
            managerMock.findOneOrFail.mockResolvedValue(account({ balance: 10, reserved: 0 }))
            managerMock.findBy
                .mockResolvedValueOnce([])
                .mockResolvedValueOnce([reservation({ operationId: 'op-1', amount: 4, state: 'released' })])

            const outcome = await store.closeAdmissionMany('org-1', [{ operationId: 'op-1', amount: 4 }])

            expect(outcome).toEqual({
                kind: 'closed',
                reservations: [
                    expect.objectContaining({ operationId: 'op-1', state: 'released', disposition: 'applied' }),
                ],
            })
            expect(managerMock.insert).toHaveBeenCalledWith(CreditReservation, [
                expect.objectContaining({ organizationId: 'org-1', operationId: 'op-1', amount: 4, state: 'released' }),
            ])
            expect(managerMock.save).not.toHaveBeenCalledWith(OrganizationCreditAccount, expect.anything())
        })

        it('releases a reserved hold and decreases account reserved', async () => {
            managerMock.findOneOrFail.mockResolvedValue(account({ balance: 10, reserved: 4 }))
            const existing = reservation({ operationId: 'op-1', amount: 4, state: 'reserved' })
            managerMock.findBy
                .mockResolvedValueOnce([existing])
                .mockResolvedValueOnce([reservation({ operationId: 'op-1', amount: 4, state: 'released' })])
            managerMock.save.mockImplementation((_entity, value) => Promise.resolve(value))

            const outcome = await store.closeAdmissionMany('org-1', [{ operationId: 'op-1', amount: 4 }])

            expect(outcome).toEqual({
                kind: 'closed',
                reservations: [
                    expect.objectContaining({ operationId: 'op-1', state: 'released', disposition: 'applied' }),
                ],
            })
            expect(managerMock.save).toHaveBeenCalledWith(
                OrganizationCreditAccount,
                expect.objectContaining({ reserved: 0 }),
            )
        })

        it('replays an already-released ID without an effect', async () => {
            managerMock.findOneOrFail.mockResolvedValue(account({ balance: 10, reserved: 0 }))
            const existing = reservation({ operationId: 'op-1', amount: 4, state: 'released' })
            managerMock.findBy.mockResolvedValue([existing])

            const outcome = await store.closeAdmissionMany('org-1', [{ operationId: 'op-1', amount: 4 }])

            expect(outcome).toEqual({
                kind: 'closed',
                reservations: [expect.objectContaining({ operationId: 'op-1', disposition: 'replayed' })],
            })
            expect(managerMock.insert).not.toHaveBeenCalled()
            expect(managerMock.save).not.toHaveBeenCalledWith(OrganizationCreditAccount, expect.anything())
        })

        it('conflicts the whole closure, including missing-ID receipts, when one ID is already captured', async () => {
            managerMock.findOneOrFail.mockResolvedValue(account({ balance: 10, reserved: 4 }))
            managerMock.findBy.mockResolvedValue([reservation({ operationId: 'op-1', amount: 4, state: 'captured' })])

            await expect(
                store.closeAdmissionMany('org-1', [
                    { operationId: 'op-1', amount: 4 },
                    { operationId: 'op-missing', amount: 1 },
                ]),
            ).resolves.toEqual({ kind: 'already-captured', operationId: 'op-1' })
            expect(managerMock.insert).not.toHaveBeenCalled()
            expect(managerMock.save).not.toHaveBeenCalled()
        })

        it('conflicts the whole closure when an existing amount does not match the input', async () => {
            managerMock.findOneOrFail.mockResolvedValue(account({ balance: 10, reserved: 4 }))
            managerMock.findBy.mockResolvedValue([reservation({ operationId: 'op-1', amount: 4, state: 'reserved' })])

            await expect(store.closeAdmissionMany('org-1', [{ operationId: 'op-1', amount: 9 }])).resolves.toEqual({
                kind: 'amount-conflict',
                operationId: 'op-1',
            })
            expect(managerMock.insert).not.toHaveBeenCalled()
            expect(managerMock.save).not.toHaveBeenCalled()
        })
    })
})
