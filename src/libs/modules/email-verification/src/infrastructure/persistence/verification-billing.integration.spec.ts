import { randomUUID } from 'node:crypto'
import { Test, TestingModule } from '@nestjs/testing'
import { TypeOrmModule } from '@nestjs/typeorm'
import { DataSource } from 'typeorm'
import {
    AuditLogEntry,
    CREDIT_RESERVATION_STORE,
    CreditDebit,
    CreditGrant,
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
import { CreditReservationService, InsufficientCreditsException } from '@tuposoft/lead-email-finder/modules/credits'
import { VerificationClock } from '../../application/ports/verification-clock'
import { VerificationAdmissionService } from '../../application/operations/verification-admission.service'
import { VerificationSettlementService } from '../../application/operations/verification-settlement.service'
import { EmailAdministrationService } from '../../application/email-administration.service'
import { BatchAdmissionService } from '../../application/delivery/batch/batch-admission.service'
import { TypeOrmVerificationRequestStore } from './typeorm-verification-request.store'
import { TypeOrmVerificationExecutionStore } from './typeorm-verification-execution.store'
import { TypeOrmVerificationSettlementStore } from './typeorm-verification-settlement.store'
import { TypeOrmVerificationResultCacheReader } from './typeorm-verification-result-cache-reader'
import { TypeOrmBatchAdmissionStore } from './typeorm-batch-admission.store'
import { TypeOrmEmailStore } from './typeorm-email.store'
import { EmailEntity } from './typeorm/email.entity'
import { EmailVerificationEntity } from './typeorm/email-verification.entity'
import { VerificationRequestEntity } from './typeorm/verification-request.entity'
import { VerificationExecutionEntity } from './typeorm/verification-execution.entity'
import { VerificationSettlementIntentionEntity } from './typeorm/verification-settlement-intention.entity'
import { BatchAdmissionEntity } from './typeorm/batch-admission.entity'
import { BatchUniqueAddressEntity } from './typeorm/batch-unique-address.entity'
import { NewEmailVerification } from '../../domain/email-verification'

// Deliberately its own env var: this schema owns identity's full entity set (for a real CreditReservationService)
// plus the verification-billing tables, in one disposable database separate from credits-postgres's own.
const postgresUrl = process.env['TEST_VERIFICATION_BILLING_POSTGRES_URL']
const describeWithPostgres = postgresUrl === undefined ? describe.skip : describe

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
    EmailEntity,
    EmailVerificationEntity,
    VerificationRequestEntity,
    VerificationExecutionEntity,
    VerificationSettlementIntentionEntity,
    BatchAdmissionEntity,
    BatchUniqueAddressEntity,
]

const CACHE_TTL_MS = 24 * 60 * 60 * 1000
const EXECUTION_DEADLINE_MS = 24 * 60 * 60 * 1000
const ADDRESS_COOLDOWN_MS = 60_000

function conclusiveResult(overrides: Partial<NewEmailVerification> = {}): NewEmailVerification {
    return {
        email: 'person@example.test',
        domain: 'example.test',
        localPart: 'person',
        exists: true,
        catchAll: false,
        reason: 'accepted_email' as NewEmailVerification['reason'],
        sources: [],
        verificationQuality: 'conclusive_positive',
        evidenceObservedAt: new Date(),
        evidencePolicyVersion: 1,
        ...overrides,
    }
}

describeWithPostgres('Verification billing against a real, freshly-synced Postgres schema', () => {
    let schemaDataSource: DataSource
    let moduleRef: TestingModule
    let requests: TypeOrmVerificationRequestStore
    let executions: TypeOrmVerificationExecutionStore
    let settlements: TypeOrmVerificationSettlementStore
    let cacheReader: TypeOrmVerificationResultCacheReader
    let credits: CreditReservationService
    let admission: VerificationAdmissionService
    let settlementService: VerificationSettlementService
    let batchAdmissions: TypeOrmBatchAdmissionStore
    let batchAdmissionService: BatchAdmissionService
    let organizationId: string
    let clock: VerificationClock

    beforeAll(async () => {
        const databaseName = new URL(postgresUrl!).pathname.slice(1)
        if (!databaseName.endsWith('_test')) {
            throw new Error('TEST_VERIFICATION_BILLING_POSTGRES_URL must select a database whose name ends with _test')
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
            imports: [TypeOrmModule.forRoot({ type: 'postgres', url: postgresUrl, synchronize: false, entities }), IdentityModule],
            providers: [
                {
                    provide: CreditReservationService,
                    useFactory: (store: CreditReservationStore) => new CreditReservationService(store),
                    inject: [CREDIT_RESERVATION_STORE],
                },
            ],
        }).compile()

        credits = moduleRef.get(CreditReservationService)
    })

    afterAll(async () => {
        await moduleRef?.close()
        if (schemaDataSource?.isInitialized) await schemaDataSource.destroy()
    })

    beforeEach(async () => {
        organizationId = randomUUID()
        await schemaDataSource.getRepository(Organization).save({ id: organizationId, name: 'verification-billing-test-org' })
        await schemaDataSource.getRepository(OrganizationCreditAccount).save({ organizationId, balance: 10 })

        requests = new TypeOrmVerificationRequestStore(schemaDataSource)
        executions = new TypeOrmVerificationExecutionStore(schemaDataSource)
        settlements = new TypeOrmVerificationSettlementStore(schemaDataSource)
        cacheReader = new TypeOrmVerificationResultCacheReader(schemaDataSource.manager)
        const emailAdministration = new EmailAdministrationService(
            new TypeOrmEmailStore(schemaDataSource.getRepository(EmailEntity)),
        )
        settlementService = new VerificationSettlementService(settlements, credits, emailAdministration)
        clock = { now: () => new Date('2026-09-11T00:00:00.000Z') }
        admission = new VerificationAdmissionService(
            requests,
            executions,
            cacheReader,
            cacheReader,
            credits,
            clock,
            CACHE_TTL_MS,
            EXECUTION_DEADLINE_MS,
            ADDRESS_COOLDOWN_MS,
        )
        batchAdmissions = new TypeOrmBatchAdmissionStore(schemaDataSource)
        batchAdmissionService = new BatchAdmissionService(
            batchAdmissions,
            executions,
            requests,
            cacheReader,
            cacheReader,
            credits,
            clock,
            CACHE_TTL_MS,
            EXECUTION_DEADLINE_MS,
            ADDRESS_COOLDOWN_MS,
        )
    })

    async function readAccount(): Promise<OrganizationCreditAccount> {
        return schemaDataSource.getRepository(OrganizationCreditAccount).findOneByOrFail({ organizationId })
    }

    it('admits exactly one execution when two concurrent requests race for the same address', async () => {
        const [first, second] = await Promise.all([
            admission.admit({ organizationId, email: 'race@example.test', deliveryMode: 'sync' }),
            admission.admit({ organizationId, email: 'race@example.test', deliveryMode: 'sync' }),
        ])

        const outcomes = [first, second]
        expect(outcomes.filter(outcome => outcome.kind === 'funded')).toHaveLength(1)
        expect(outcomes.filter(outcome => outcome.kind === 'joined')).toHaveLength(1)

        const executionRows = await schemaDataSource
            .getRepository(VerificationExecutionEntity)
            .findBy({ organizationId, normalizedAddress: 'race@example.test' })
        expect(executionRows).toHaveLength(1)
        await expect(readAccount()).resolves.toEqual(expect.objectContaining({ balance: 10, reserved: 1 }))
    })

    it('recovers via the catch branch when a genuine uncommitted concurrent insert forces a real unique violation', async () => {
        const executions = new TypeOrmVerificationExecutionStore(schemaDataSource)
        const address = 'genuine-race@example.test'
        const holderExecutionId = randomUUID()
        const holderQueryRunner = schemaDataSource.createQueryRunner()
        await holderQueryRunner.connect()
        await holderQueryRunner.startTransaction()
        await holderQueryRunner.manager.save(VerificationExecutionEntity, {
            executionId: holderExecutionId,
            organizationId,
            normalizedAddress: address,
            payerRequestId: randomUUID(),
            state: 'funding_pending',
            fundingOwnerType: 'single',
            fundingOwnerId: holderExecutionId,
            attemptGeneration: 0,
            leaseOwnerId: null,
            leaseExpiresAt: null,
            resultId: null,
            retryAt: null,
            deadlineAt: new Date(Date.now() + 60_000),
        })

        try {
            // The holder's insert is uncommitted, so claimOrJoin's own findOne sees nothing and proceeds to
            // insert a competing row; that insert blocks on the partial unique index until the holder resolves.
            const claimPromise = executions.claimOrJoin(
                organizationId,
                address,
                randomUUID(),
                randomUUID(),
                new Date(Date.now() + 60_000),
                () => false,
            )
            await new Promise(resolve => setTimeout(resolve, 300))
            await holderQueryRunner.commitTransaction()

            await expect(claimPromise).resolves.toEqual({
                kind: 'joined',
                execution: expect.objectContaining({ executionId: holderExecutionId }),
            })
        } finally {
            await holderQueryRunner.release()
        }
    })

    it('runs the full funded execution through capture and reuses the cached result for free afterward', async () => {
        const funded = await admission.admit({ organizationId, email: 'person@example.test', deliveryMode: 'sync' })
        expect(funded.kind).toBe('funded')
        if (funded.kind !== 'funded') throw new Error('unreachable')

        await expect(readAccount()).resolves.toEqual(expect.objectContaining({ balance: 10, reserved: 1 }))

        const persisted = await settlements.persistResultAndIntention({
            executionId: funded.executionId,
            organizationId,
            expectedGeneration: 0,
            newVerification: conclusiveResult(),
            decision: 'capture',
            finalReason: 'conclusive',
        })
        expect(persisted.kind).toBe('persisted')
        if (persisted.kind !== 'persisted') throw new Error('unreachable')

        await settlementService.settle(funded.executionId, organizationId)

        await expect(readAccount()).resolves.toEqual(expect.objectContaining({ balance: 9, reserved: 0 }))
        const payerRequest = await requests.findById(funded.requestId, organizationId)
        expect(payerRequest).toEqual(
            expect.objectContaining({ billingState: 'settled', finalReason: 'conclusive', chargedCount: 1 }),
        )
        const emailCacheRow = await schemaDataSource
            .getRepository(EmailEntity)
            .findOneByOrFail({ organizationId, id: 'person@example.test' })
        expect(emailCacheRow).toEqual(expect.objectContaining({ exists: true, lastVerificationId: persisted.resultId }))

        const cached = await admission.admit({ organizationId, email: 'person@example.test', deliveryMode: 'sync' })
        expect(cached.kind).toBe('cached')
        await expect(readAccount()).resolves.toEqual(expect.objectContaining({ balance: 9, reserved: 0 }))
    })

    it('releases the reservation on an inconclusive result without ever debiting the account', async () => {
        const funded = await admission.admit({ organizationId, email: 'unclear@example.test', deliveryMode: 'sync' })
        expect(funded.kind).toBe('funded')
        if (funded.kind !== 'funded') throw new Error('unreachable')

        await settlements.persistResultAndIntention({
            executionId: funded.executionId,
            organizationId,
            expectedGeneration: 0,
            newVerification: conclusiveResult({ verificationQuality: 'inconclusive', exists: null, evidenceObservedAt: null }),
            decision: 'release',
            finalReason: 'inconclusive',
        })
        await settlementService.settle(funded.executionId, organizationId)

        await expect(readAccount()).resolves.toEqual(expect.objectContaining({ balance: 10, reserved: 0 }))

        const next = await admission.admit({ organizationId, email: 'unclear@example.test', deliveryMode: 'sync' })
        expect(next.kind).toBe('funded')
        await expect(readAccount()).resolves.toEqual(expect.objectContaining({ balance: 10, reserved: 1 }))
    })

    it('fences an insufficient-funds admission by canceling its execution and freeing the address slot', async () => {
        await schemaDataSource.getRepository(OrganizationCreditAccount).update({ organizationId }, { balance: 0 })

        const outcome = await admission.admit({ organizationId, email: 'broke@example.test', deliveryMode: 'sync' })
        expect(outcome.kind).toBe('insufficient-funds')

        const executionRows = await schemaDataSource
            .getRepository(VerificationExecutionEntity)
            .findBy({ organizationId, normalizedAddress: 'broke@example.test' })
        expect(executionRows).toEqual([expect.objectContaining({ state: 'canceled' })])
        await expect(readAccount()).resolves.toEqual(expect.objectContaining({ balance: 0, reserved: 0 }))

        // The canceled row falls outside the partial unique index, so the address slot is free again.
        await schemaDataSource.getRepository(OrganizationCreditAccount).update({ organizationId }, { balance: 10 })
        const retried = await admission.admit({ organizationId, email: 'broke@example.test', deliveryMode: 'sync' })
        expect(retried.kind).toBe('funded')
    })

    it('pages a canceled execution whose linked request cleanup never completed, until settleCanceled runs', async () => {
        const funded = await admission.admit({ organizationId, email: 'stuck-cleanup@example.test', deliveryMode: 'sync' })
        if (funded.kind !== 'funded') throw new Error('unreachable')

        // Models the reconciler's own recovery scenario: the row is already terminal `canceled` (as if
        // `cancelIfNoCaptureIntention` had already run), but the credit release / request settlement that must
        // follow never completed — the linked request is still `pending`.
        const canceled = await executions.cancelIfNoCaptureIntention(funded.executionId, organizationId)
        expect(canceled.state).toBe('canceled')

        const pending = await executions.pageCanceledPendingCleanup(100)
        expect(pending.map(execution => execution.executionId)).toContain(funded.executionId)

        await credits.release(organizationId, funded.executionId)
        await requests.settleCanceled(funded.executionId, organizationId)

        const afterCleanup = await executions.pageCanceledPendingCleanup(100)
        expect(afterCleanup.map(execution => execution.executionId)).not.toContain(funded.executionId)
        await expect(readAccount()).resolves.toEqual(expect.objectContaining({ balance: 10, reserved: 0 }))
        const payerRequest = await requests.findById(funded.requestId, organizationId)
        expect(payerRequest).toEqual(expect.objectContaining({ billingState: 'settled', finalReason: 'failed', chargedCount: 0 }))
    })

    it('replays settlement confirmation idempotently without a second credit call', async () => {
        const funded = await admission.admit({ organizationId, email: 'replay@example.test', deliveryMode: 'sync' })
        if (funded.kind !== 'funded') throw new Error('unreachable')

        await settlements.persistResultAndIntention({
            executionId: funded.executionId,
            organizationId,
            expectedGeneration: 0,
            newVerification: conclusiveResult({ email: 'replay@example.test' }),
            decision: 'capture',
            finalReason: 'conclusive',
        })
        await settlementService.settle(funded.executionId, organizationId)
        await settlementService.settle(funded.executionId, organizationId)

        await expect(readAccount()).resolves.toEqual(expect.objectContaining({ balance: 9, reserved: 0 }))
        const debitRows = await schemaDataSource
            .getRepository(CreditDebit)
            .findBy({ organizationId, reference: `verification-reservation:${funded.executionId}` })
        expect(debitRows).toHaveLength(1)
    })

    it('admits a batch of unique addresses with exactly one reservation per address, not per row', async () => {
        const batchId = randomUUID()
        await batchAdmissions.createOrReplay({
            batchId,
            organizationId,
            totalRows: 5,
            uniqueAddressCount: 3,
            clientRequestKey: null,
            contentDigest: null,
        })
        await batchAdmissions.insertUniqueAddresses(batchId, organizationId, [
            { normalizedAddress: 'a@example.test', firstSeenRow: 1 },
            { normalizedAddress: 'b@example.test', firstSeenRow: 2 },
            { normalizedAddress: 'c@example.test', firstSeenRow: 3 },
        ])

        await batchAdmissionService.admit(batchId, organizationId)

        await expect(readAccount()).resolves.toEqual(expect.objectContaining({ balance: 10, reserved: 3 }))
        await expect(batchAdmissions.findById(batchId, organizationId)).resolves.toEqual(
            expect.objectContaining({ state: 'admitted' }),
        )
        const executionRows = await schemaDataSource
            .getRepository(VerificationExecutionEntity)
            .findBy({ organizationId, fundingOwnerType: 'batch_group', fundingOwnerId: batchId })
        expect(executionRows).toHaveLength(3)
        expect(executionRows.every(execution => execution.state === 'queued')).toBe(true)

        const addresses = await batchAdmissions.pageUniqueAddresses(batchId, organizationId, 0, 10)
        expect(addresses.every(address => address.admissionKind === 'created' && address.payerRequestId !== null)).toBe(true)
        for (const address of addresses) {
            const payerRequest = await requests.findById(address.payerRequestId!, organizationId)
            expect(payerRequest).toEqual(
                expect.objectContaining({ source: 'fresh', billingState: 'pending', reservedCount: 1, deliveryMode: 'batch' }),
            )
        }
    })

    it('fences an insufficient-funds batch group, charging nothing and marking every address a free failure', async () => {
        await schemaDataSource.getRepository(OrganizationCreditAccount).update({ organizationId }, { balance: 2 })
        const batchId = randomUUID()
        await batchAdmissions.createOrReplay({
            batchId,
            organizationId,
            totalRows: 3,
            uniqueAddressCount: 3,
            clientRequestKey: null,
            contentDigest: null,
        })
        await batchAdmissions.insertUniqueAddresses(batchId, organizationId, [
            { normalizedAddress: 'x@example.test', firstSeenRow: 1 },
            { normalizedAddress: 'y@example.test', firstSeenRow: 2 },
            { normalizedAddress: 'z@example.test', firstSeenRow: 3 },
        ])

        await batchAdmissionService.admit(batchId, organizationId)

        await expect(readAccount()).resolves.toEqual(expect.objectContaining({ balance: 2, reserved: 0 }))
        await expect(batchAdmissions.findById(batchId, organizationId)).resolves.toEqual(
            expect.objectContaining({ state: 'insufficient_credits' }),
        )
        const executionRows = await schemaDataSource
            .getRepository(VerificationExecutionEntity)
            .findBy({ organizationId, fundingOwnerType: 'batch_group', fundingOwnerId: batchId })
        expect(executionRows.every(execution => execution.state === 'canceled')).toBe(true)

        const addresses = await batchAdmissions.pageUniqueAddresses(batchId, organizationId, 0, 10)
        for (const address of addresses) {
            const payerRequest = await requests.findById(address.payerRequestId!, organizationId)
            expect(payerRequest).toEqual(
                expect.objectContaining({ billingState: 'settled', finalReason: 'failed', reservedCount: 0, chargedCount: 0 }),
            )
        }
    })

    it('shares a single reservation between a batch address and a concurrent single-verification submission', async () => {
        const batchId = randomUUID()
        await batchAdmissions.createOrReplay({
            batchId,
            organizationId,
            totalRows: 1,
            uniqueAddressCount: 1,
            clientRequestKey: null,
            contentDigest: null,
        })
        await batchAdmissions.insertUniqueAddresses(batchId, organizationId, [
            { normalizedAddress: 'shared-race@example.test', firstSeenRow: 1 },
        ])

        const [, singleOutcome] = await Promise.all([
            batchAdmissionService.admit(batchId, organizationId),
            admission.admit({ organizationId, email: 'shared-race@example.test', deliveryMode: 'sync' }),
        ])

        await expect(readAccount()).resolves.toEqual(expect.objectContaining({ balance: 10, reserved: 1 }))
        const executionRows = await schemaDataSource
            .getRepository(VerificationExecutionEntity)
            .findBy({ organizationId, normalizedAddress: 'shared-race@example.test' })
        expect(executionRows).toHaveLength(1)
        expect(['funded', 'joined']).toContain(singleOutcome.kind)
    })
})
