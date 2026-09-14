import { Test, TestingModule } from '@nestjs/testing'
import { TypeOrmModule } from '@nestjs/typeorm'
import { DataSource } from 'typeorm'
import { randomUUID } from 'node:crypto'
import {
    AuditLogEntry,
    CREDIT_LEDGER_STORE,
    CREDIT_RESERVATION_STORE,
    CreditDebit,
    CreditGrant,
    CreditLedgerStore,
    CreditReservation,
    CreditReservationStore,
    ExternalIdentity,
    IdentityModule,
    Organization,
    OrganizationCreditAccount,
    OrganizationInvitation,
    OrganizationMembership,
    ServiceCredential,
} from '@tuposoft/lead-email-finder/modules/identity'
import { CreditsService } from './credits.service'
import { CreditReservationService } from './credit-reservation.service'
import { CreditIdempotencyConflict } from '../domain/credits.error'

// Deliberately its own env var, not TEST_POSTGRES_URL: identity-schema.integration.spec.ts also gates on
// TEST_POSTGRES_URL and does its own dropSchema+synchronize. Jest runs spec files in parallel workers, so
// both tests racing dropSchema against the same database in one full-suite run would corrupt each other.
const postgresUrl = process.env['TEST_CREDITS_POSTGRES_URL']
const describeWithPostgres = postgresUrl === undefined ? describe.skip : describe

// The full identity entity set, not just the three credit tables: IdentityModule's own TypeOrmModule.forFeature
// call registers repositories for all ten, so the root DataSource must already know all ten or repository
// resolution fails with a "no metadata found" error.
const entities = [
    Organization,
    ExternalIdentity,
    OrganizationMembership,
    ServiceCredential,
    OrganizationCreditAccount,
    CreditDebit,
    CreditGrant,
    CreditReservation,
    OrganizationInvitation,
    AuditLogEntry,
]

describeWithPostgres('CreditsService against a real, freshly-synced Postgres schema', () => {
    let schemaDataSource: DataSource
    let moduleRef: TestingModule
    let service: CreditsService
    let reservations: CreditReservationService
    let organizationId: string

    beforeAll(async () => {
        const databaseName = new URL(postgresUrl!).pathname.slice(1)
        if (!databaseName.endsWith('_test')) {
            throw new Error('TEST_CREDITS_POSTGRES_URL must select a database whose name ends with _test')
        }

        schemaDataSource = new DataSource({
            type: 'postgres',
            url: postgresUrl,
            dropSchema: true,
            synchronize: true,
            entities,
        })
        await schemaDataSource.initialize()

        moduleRef = await Test.createTestingModule({
            imports: [
                TypeOrmModule.forRoot({ type: 'postgres', url: postgresUrl, synchronize: false, entities }),
                IdentityModule,
            ],
            providers: [
                {
                    provide: CreditsService,
                    useFactory: (store: CreditLedgerStore) => new CreditsService(store),
                    inject: [CREDIT_LEDGER_STORE],
                },
                {
                    provide: CreditReservationService,
                    useFactory: (store: CreditReservationStore) => new CreditReservationService(store),
                    inject: [CREDIT_RESERVATION_STORE],
                },
            ],
        }).compile()

        service = moduleRef.get(CreditsService)
        reservations = moduleRef.get(CreditReservationService)
    }, 30_000)

    afterAll(async () => {
        await moduleRef?.close()
        if (schemaDataSource?.isInitialized) await schemaDataSource.destroy()
    })

    beforeEach(async () => {
        organizationId = randomUUID()
        await schemaDataSource.getRepository(Organization).save({ id: organizationId, name: 'credits-test-org' })
        await schemaDataSource.getRepository(OrganizationCreditAccount).save({ organizationId, balance: 10 })
    })

    afterEach(async () => {
        if (schemaDataSource?.isInitialized && organizationId) {
            await schemaDataSource.getRepository(Organization).delete(organizationId)
        }
    })

    describe.each([
        { name: 'an existing account', startingBalance: 10 },
        { name: 'no account row', startingBalance: 0 },
    ])('platform grants with $name', ({ startingBalance }) => {
        beforeEach(async () => {
            if (startingBalance === 0) {
                await schemaDataSource.getRepository(OrganizationCreditAccount).delete({ organizationId })
                expect(
                    await schemaDataSource.getRepository(OrganizationCreditAccount).countBy({ organizationId }),
                ).toBe(0)
            }
        })

        async function assertLedger(balance: number, grantAmounts: number[]): Promise<void> {
            await expect(service.getBalance(organizationId)).resolves.toBe(balance)
            const accounts = await schemaDataSource.getRepository(OrganizationCreditAccount).findBy({ organizationId })
            expect(accounts).toHaveLength(1)
            expect(accounts[0].balance).toBe(balance)
            const grants = await schemaDataSource.getRepository(CreditGrant).findBy({ organizationId })
            expect(grants.map(grant => grant.amount).sort((a, b) => a - b)).toEqual(
                [...grantAmounts].sort((a, b) => a - b),
            )
            expect(grants.every(grant => grant.reference.startsWith('platform-credit-add:'))).toBe(true)
        }

        it('applies a sequential retry once and returns the current balance after another operation', async () => {
            const key = randomUUID()
            await expect(service.addPlatformCredits(organizationId, 5, key)).resolves.toBe(startingBalance + 5)
            await expect(service.addPlatformCredits(organizationId, 5, key)).resolves.toBe(startingBalance + 5)
            await service.addPlatformCredits(organizationId, 3, randomUUID())
            await expect(service.addPlatformCredits(organizationId, 5, key)).resolves.toBe(startingBalance + 8)
            await assertLedger(startingBalance + 8, [5, 3])
        })

        it('rejects different-amount reuse without changing the ledger', async () => {
            const key = randomUUID()
            await service.addPlatformCredits(organizationId, 5, key)
            await expect(service.addPlatformCredits(organizationId, 7, key)).rejects.toBeInstanceOf(
                CreditIdempotencyConflict,
            )
            await assertLedger(startingBalance + 5, [5])
        })

        it('serializes concurrent duplicate grants with one account and one effect', async () => {
            const key = randomUUID()
            await expect(
                Promise.all(Array.from({ length: 6 }, () => service.addPlatformCredits(organizationId, 5, key))),
            ).resolves.toEqual(Array<number>(6).fill(startingBalance + 5))
            await assertLedger(startingBalance + 5, [5])
        }, 15_000)

        it('adds both concurrent distinct keys without losing an update', async () => {
            await Promise.all([
                service.addPlatformCredits(organizationId, 3, randomUUID()),
                service.addPlatformCredits(organizationId, 7, randomUUID()),
            ])
            await assertLedger(startingBalance + 10, [3, 7])
        })

        it('allows exactly one amount when conflicting first requests race', async () => {
            const key = randomUUID()
            const results = await Promise.allSettled([
                service.addPlatformCredits(organizationId, 3, key),
                service.addPlatformCredits(organizationId, 7, key),
            ])
            expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1)
            const rejected = results.filter(result => result.status === 'rejected')
            expect(rejected).toHaveLength(1)
            expect(rejected[0].reason).toBeInstanceOf(CreditIdempotencyConflict)
            const grants = await schemaDataSource.getRepository(CreditGrant).findBy({ organizationId })
            expect(grants).toHaveLength(1)
            expect([3, 7]).toContain(grants[0].amount)
            await assertLedger(startingBalance + grants[0].amount, [grants[0].amount])
        })
    })

    it('isolates platform keys from existing payment references and preserves payment replay policy', async () => {
        const key = randomUUID()
        await expect(service.credit(organizationId, 5, key)).resolves.toBe(15)
        await expect(service.addPlatformCredits(organizationId, 7, key)).resolves.toBe(22)
        await expect(service.credit(organizationId, 99, key)).resolves.toBe(22)
        expect(await schemaDataSource.getRepository(CreditGrant).countBy({ organizationId })).toBe(2)
    })

    it('never lets concurrent debits push the balance negative', async () => {
        const results = await Promise.allSettled([
            service.debit(organizationId, 10, 'ref-a'),
            service.debit(organizationId, 10, 'ref-b'),
        ])

        const fulfilled = results.filter(result => result.status === 'fulfilled')
        expect(fulfilled).toHaveLength(1)

        const balance = await service.getBalance(organizationId)
        expect(balance).toBe(0)
    })

    it('does not double-charge when the same reference is retried concurrently', async () => {
        await Promise.all([service.debit(organizationId, 1, 'dup-ref'), service.debit(organizationId, 1, 'dup-ref')])

        const balance = await service.getBalance(organizationId)
        expect(balance).toBe(9)

        const debitRows = await schemaDataSource
            .getRepository(CreditDebit)
            .findBy({ organizationId, reference: 'dup-ref' })
        expect(debitRows).toHaveLength(1)
    })

    it('creates an account and records the first grant', async () => {
        const newOrganizationId = randomUUID()
        await schemaDataSource.getRepository(Organization).save({ id: newOrganizationId, name: 'new-credits-test-org' })

        await expect(service.credit(newOrganizationId, 5, 'first-grant')).resolves.toBe(5)
        await expect(service.getBalance(newOrganizationId)).resolves.toBe(5)

        const grantRows = await schemaDataSource
            .getRepository(CreditGrant)
            .findBy({ organizationId: newOrganizationId, reference: 'first-grant' })
        expect(grantRows).toEqual([expect.objectContaining({ amount: 5 })])
    })

    it('applies a repeated grant reference once', async () => {
        await expect(service.credit(organizationId, 5, 'dup-grant')).resolves.toBe(15)
        await expect(service.credit(organizationId, 5, 'dup-grant')).resolves.toBe(15)

        await expect(service.getBalance(organizationId)).resolves.toBe(15)
        const grantRows = await schemaDataSource
            .getRepository(CreditGrant)
            .findBy({ organizationId, reference: 'dup-grant' })
        expect(grantRows).toHaveLength(1)
    })

    it('sums concurrent grants with distinct references', async () => {
        await Promise.all([service.credit(organizationId, 3, 'grant-a'), service.credit(organizationId, 7, 'grant-b')])

        await expect(service.getBalance(organizationId)).resolves.toBe(20)
        const grantRows = await schemaDataSource.getRepository(CreditGrant).findBy({ organizationId })
        expect(grantRows).toHaveLength(2)
    })

    it('clamps and replays the same adjustment debit result concurrently', async () => {
        await service.setBalance(organizationId, 3)

        await expect(
            Promise.all([
                service.debitUpTo(organizationId, 10, 'adjustment-debit'),
                service.debitUpTo(organizationId, 10, 'adjustment-debit'),
            ]),
        ).resolves.toEqual([3, 3])
        await expect(service.getBalance(organizationId)).resolves.toBe(0)
        await expect(
            schemaDataSource.getRepository(CreditDebit).findBy({ organizationId, reference: 'adjustment-debit' }),
        ).resolves.toEqual([expect.objectContaining({ amount: 3 })])
    })

    it('persists a zero clamp so replay after replenishment does not debit later credits', async () => {
        await service.setBalance(organizationId, 0)

        await expect(service.debitUpTo(organizationId, 10, 'zero-adjustment')).resolves.toBe(0)
        await service.setBalance(organizationId, 10)
        await expect(service.debitUpTo(organizationId, 10, 'zero-adjustment')).resolves.toBe(0)

        await expect(service.getBalance(organizationId)).resolves.toBe(10)
        await expect(
            schemaDataSource.getRepository(CreditDebit).findBy({ organizationId, reference: 'zero-adjustment' }),
        ).resolves.toEqual([expect.objectContaining({ amount: 0 })])
    })

    it('applies one restoration when the same reference is credited concurrently', async () => {
        await expect(
            Promise.all([
                service.creditOnce(organizationId, 5, 'adjustment-restore'),
                service.creditOnce(organizationId, 5, 'adjustment-restore'),
            ]),
        ).resolves.toEqual([5, 5])

        await expect(service.getBalance(organizationId)).resolves.toBe(15)
        await expect(
            schemaDataSource.getRepository(CreditGrant).findBy({ organizationId, reference: 'adjustment-restore' }),
        ).resolves.toEqual([expect.objectContaining({ amount: 5 })])
    })

    describe('CreditReservationService reserve/capture/release against a real, freshly-synced Postgres schema', () => {
        async function readAccount(): Promise<OrganizationCreditAccount> {
            return schemaDataSource.getRepository(OrganizationCreditAccount).findOneByOrFail({ organizationId })
        }

        it('holds without reducing balance, then captures once and debits once', async () => {
            const operationId = randomUUID()
            await reservations.reserve(organizationId, { operationId, amount: 3 })
            await expect(readAccount()).resolves.toEqual(expect.objectContaining({ balance: 10, reserved: 3 }))
            await expect(service.getBalance(organizationId)).resolves.toBe(10)

            const settlement = await reservations.capture(organizationId, operationId)
            expect(settlement.disposition).toBe('applied')
            await expect(readAccount()).resolves.toEqual(expect.objectContaining({ balance: 7, reserved: 0 }))

            const debitRows = await schemaDataSource
                .getRepository(CreditDebit)
                .findBy({ organizationId, reference: `verification-reservation:${operationId}` })
            expect(debitRows).toEqual([expect.objectContaining({ amount: 3 })])

            const replay = await reservations.capture(organizationId, operationId)
            expect(replay.disposition).toBe('replayed')
            await expect(readAccount()).resolves.toEqual(expect.objectContaining({ balance: 7, reserved: 0 }))
            await expect(
                schemaDataSource
                    .getRepository(CreditDebit)
                    .countBy({ organizationId, reference: `verification-reservation:${operationId}` }),
            ).resolves.toBe(1)
        })

        it('restores available credit on release without ever touching balance or the ledger', async () => {
            const operationId = randomUUID()
            await reservations.reserve(organizationId, { operationId, amount: 3 })

            const settlement = await reservations.release(organizationId, operationId)
            expect(settlement.disposition).toBe('applied')
            await expect(readAccount()).resolves.toEqual(expect.objectContaining({ balance: 10, reserved: 0 }))
            await expect(schemaDataSource.getRepository(CreditGrant).countBy({ organizationId })).resolves.toBe(0)
            await expect(schemaDataSource.getRepository(CreditDebit).countBy({ organizationId })).resolves.toBe(0)

            const replay = await reservations.release(organizationId, operationId)
            expect(replay.disposition).toBe('replayed')
            await expect(readAccount()).resolves.toEqual(expect.objectContaining({ balance: 10, reserved: 0 }))
        })

        it('never admits a hold that would push available credit negative', async () => {
            await expect(
                reservations.reserve(organizationId, { operationId: randomUUID(), amount: 11 }),
            ).rejects.toThrow()
            await expect(readAccount()).resolves.toEqual(expect.objectContaining({ balance: 10, reserved: 0 }))
        })

        it('closes a batch of missing, still-reserved, and already-released IDs atomically without ever touching balance', async () => {
            const stillReservedId = randomUUID()
            const alreadyReleasedId = randomUUID()
            const missingId = randomUUID()
            await reservations.reserveMany(organizationId, [
                { operationId: stillReservedId, amount: 2 },
                { operationId: alreadyReleasedId, amount: 4 },
            ])
            await reservations.release(organizationId, alreadyReleasedId)
            await expect(readAccount()).resolves.toEqual(expect.objectContaining({ balance: 10, reserved: 2 }))

            const closed = await reservations.closeAdmissionMany(organizationId, [
                { operationId: stillReservedId, amount: 2 },
                { operationId: alreadyReleasedId, amount: 4 },
                { operationId: missingId, amount: 5 },
            ])

            const byOperationId = new Map(closed.map(settlement => [settlement.operationId, settlement]))
            expect(byOperationId.get(stillReservedId)).toEqual(
                expect.objectContaining({ state: 'released', disposition: 'applied' }),
            )
            expect(byOperationId.get(alreadyReleasedId)).toEqual(
                expect.objectContaining({ state: 'released', disposition: 'replayed' }),
            )
            expect(byOperationId.get(missingId)).toEqual(
                expect.objectContaining({ state: 'released', disposition: 'applied' }),
            )

            await expect(readAccount()).resolves.toEqual(expect.objectContaining({ balance: 10, reserved: 0 }))
            await expect(schemaDataSource.getRepository(CreditGrant).countBy({ organizationId })).resolves.toBe(0)
            await expect(schemaDataSource.getRepository(CreditDebit).countBy({ organizationId })).resolves.toBe(0)
        })

        it('rolls back the whole closure batch when one ID is already captured', async () => {
            const capturedId = randomUUID()
            const reservedId = randomUUID()
            await reservations.reserveMany(organizationId, [
                { operationId: capturedId, amount: 2 },
                { operationId: reservedId, amount: 3 },
            ])
            await reservations.capture(organizationId, capturedId)
            await expect(readAccount()).resolves.toEqual(expect.objectContaining({ balance: 8, reserved: 3 }))

            await expect(
                reservations.closeAdmissionMany(organizationId, [
                    { operationId: capturedId, amount: 2 },
                    { operationId: reservedId, amount: 3 },
                ]),
            ).rejects.toThrow()

            await expect(readAccount()).resolves.toEqual(expect.objectContaining({ balance: 8, reserved: 3 }))
            await expect(reservations.getReservation(organizationId, reservedId)).resolves.toEqual(
                expect.objectContaining({ state: 'reserved' }),
            )
        })

        it('rolls back the whole closure batch when one ID carries a mismatched amount', async () => {
            const mismatchedId = randomUUID()
            const reservedId = randomUUID()
            await reservations.reserveMany(organizationId, [
                { operationId: mismatchedId, amount: 2 },
                { operationId: reservedId, amount: 3 },
            ])

            await expect(
                reservations.closeAdmissionMany(organizationId, [
                    { operationId: mismatchedId, amount: 9 },
                    { operationId: reservedId, amount: 3 },
                ]),
            ).rejects.toThrow()

            await expect(readAccount()).resolves.toEqual(expect.objectContaining({ balance: 10, reserved: 5 }))
            await expect(reservations.getReservation(organizationId, reservedId)).resolves.toEqual(
                expect.objectContaining({ state: 'reserved' }),
            )
        })

        it('fences a delayed duplicate reserve after an insufficient-funds denial is closed and the account is replenished', async () => {
            const operationId = randomUUID()
            await expect(reservations.reserve(organizationId, { operationId, amount: 11 })).rejects.toThrow()

            await reservations.closeAdmissionMany(organizationId, [{ operationId, amount: 11 }])
            await service.credit(organizationId, 20, 'replenish-after-denial')
            await expect(readAccount()).resolves.toEqual(expect.objectContaining({ balance: 30, reserved: 0 }))

            const delayedDuplicate = await reservations.reserve(organizationId, { operationId, amount: 11 })
            expect(delayedDuplicate).toEqual(expect.objectContaining({ state: 'released', disposition: 'existing' }))
            await expect(readAccount()).resolves.toEqual(expect.objectContaining({ balance: 30, reserved: 0 }))
        })

        it('serializes a reserve racing a close on the same operation ID without ever admitting a captured amount twice', async () => {
            const operationId = randomUUID()
            const results = await Promise.allSettled([
                reservations.reserve(organizationId, { operationId, amount: 3 }),
                reservations.closeAdmissionMany(organizationId, [{ operationId, amount: 3 }]),
            ])

            expect(results.every(result => result.status === 'fulfilled')).toBe(true)
            const finalReservation = await reservations.getReservation(organizationId, operationId)
            expect(finalReservation?.state).toBe('released')
            await expect(readAccount()).resolves.toEqual(expect.objectContaining({ balance: 10, reserved: 0 }))
        })
    })
})
