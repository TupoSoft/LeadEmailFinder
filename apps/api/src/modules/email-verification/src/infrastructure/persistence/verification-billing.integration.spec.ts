import { randomUUID } from 'node:crypto'
import { PassThrough } from 'node:stream'
import { Upload } from '@aws-sdk/lib-storage'
import { S3 } from 'nestjs-s3'
import { parse } from 'csv-parse/sync'
import { Test, TestingModule } from '@nestjs/testing'
import { TypeOrmModule } from '@nestjs/typeorm'
import { DataSource, In } from 'typeorm'
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
import { CreditReservationService } from '@tuposoft/lead-email-finder/modules/credits'
import { VerificationClock } from '../../application/ports/verification-clock'
import { VerificationAdmissionService } from '../../application/operations/verification-admission.service'
import { VerificationSettlementService } from '../../application/operations/verification-settlement.service'
import { EmailAdministrationService } from '../../application/email-administration.service'
import { BatchAdmissionService } from '../../application/delivery/batch/batch-admission.service'
import { BatchAdmissionRecoveryService } from '../../application/delivery/batch/batch-admission-recovery.service'
import { BatchAdmissionFence } from '../../application/delivery/batch/batch-admission-store'
import { VerificationReconciler } from '../../application/operations/verification-reconciler'
import { VerificationExecutionDispatcher } from '../../application/ports/verification-execution-dispatcher'
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
import { VerificationCommandOutboxEntity } from './typeorm/verification-command-outbox.entity'
import { VerificationSettlementIntentionEntity } from './typeorm/verification-settlement-intention.entity'
import { BatchAdmissionEntity } from './typeorm/batch-admission.entity'
import { BatchUniqueAddressEntity } from './typeorm/batch-unique-address.entity'
import { BatchRowEntity } from './typeorm/batch-row.entity'
import { TypeOrmBatchRowStore } from './typeorm-batch-row.store'
import { S3BatchResultWriter } from '../storage/batch-verification/s3-batch-result-writer'
import { NewEmailVerification } from '../../domain/email-verification'
import { NewVerificationRequestInput } from '../../application/ports/verification-request-store'

// Keep the real database cursor and CSV projection; replace only the external object upload.
jest.mock('@aws-sdk/lib-storage')

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
    VerificationCommandOutboxEntity,
    VerificationSettlementIntentionEntity,
    BatchAdmissionEntity,
    BatchUniqueAddressEntity,
    BatchRowEntity,
]

const CACHE_TTL_MS = 24 * 60 * 60 * 1000
const EXECUTION_DEADLINE_MS = 24 * 60 * 60 * 1000
const ADDRESS_COOLDOWN_MS = 60_000
const LEASE_DURATION_MS = 60_000
const LEASE_RENEWAL_MS = 5_000

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
    let secondDataSource: DataSource
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
    let currentTime: Date

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
        // A separate pool models a second worker process racing the first one through its own connections.
        secondDataSource = new DataSource({ type: 'postgres', url: postgresUrl, synchronize: false, entities })
        await secondDataSource.initialize()

        moduleRef = await Test.createTestingModule({
            imports: [
                TypeOrmModule.forRoot({ type: 'postgres', url: postgresUrl, synchronize: false, entities }),
                IdentityModule,
            ],
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
        if (secondDataSource?.isInitialized) {
            await secondDataSource.destroy()
        }
        if (schemaDataSource?.isInitialized) {
            await schemaDataSource.destroy()
        }
    })

    beforeEach(async () => {
        jest.restoreAllMocks()
        organizationId = randomUUID()
        await schemaDataSource
            .getRepository(Organization)
            .save({ id: organizationId, name: 'verification-billing-test-org' })
        await schemaDataSource.getRepository(OrganizationCreditAccount).save({ organizationId, balance: 10 })

        requests = new TypeOrmVerificationRequestStore(schemaDataSource)
        executions = new TypeOrmVerificationExecutionStore(schemaDataSource)
        settlements = new TypeOrmVerificationSettlementStore(schemaDataSource)
        cacheReader = new TypeOrmVerificationResultCacheReader(schemaDataSource.manager)
        const emailAdministration = new EmailAdministrationService(
            new TypeOrmEmailStore(schemaDataSource.getRepository(EmailEntity)),
        )
        settlementService = new VerificationSettlementService(settlements, credits, emailAdministration)
        currentTime = new Date('2026-09-11T00:00:00.000Z')
        clock = { now: () => currentTime }
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
            LEASE_DURATION_MS,
            LEASE_RENEWAL_MS,
        )
    })

    /** Drives bounded advancements until the group finishes admission and receipt finalization. */
    async function admitToCompletion(
        batchId: string,
        service: BatchAdmissionService = batchAdmissionService,
    ): Promise<number> {
        for (let advancements = 1; advancements <= 50; advancements++) {
            const outcome = await service.admit(batchId, organizationId)
            if (outcome.kind === 'complete') {
                return advancements
            }
            if (outcome.kind === 'busy') {
                throw new Error('Unexpected busy batch admission')
            }
        }
        throw new Error('Batch admission did not complete')
    }

    async function readAccount(): Promise<OrganizationCreditAccount> {
        return schemaDataSource.getRepository(OrganizationCreditAccount).findOneByOrFail({ organizationId })
    }

    async function prepareBatch(emails: string[]): Promise<string> {
        const batchId = randomUUID()
        const addresses = new Map<string, number>()
        emails.forEach((email, index) => {
            if (!addresses.has(email.toLowerCase())) {
                addresses.set(email.toLowerCase(), index + 1)
            }
        })
        await batchAdmissions.createOrReplay({
            batchId,
            organizationId,
            totalRows: emails.length,
            uniqueAddressCount: addresses.size,
            clientRequestKey: null,
            contentDigest: null,
        })
        await batchAdmissions.insertUniqueAddresses(
            batchId,
            organizationId,
            [...addresses].map(([normalizedAddress, firstSeenRow]) => ({ normalizedAddress, firstSeenRow })),
        )
        await new TypeOrmBatchRowStore(schemaDataSource).insertMany(
            organizationId,
            emails.map((originalEmail, index) => ({
                batchId,
                sourceRow: index + 1,
                originalEmail,
                normalizedAddress: originalEmail.toLowerCase(),
            })),
        )
        return batchId
    }

    async function readBatchCsv(batchId: string): Promise<Record<string, string>[]> {
        const chunks: Buffer[] = []
        jest.mocked(Upload).mockImplementation(({ params }) => {
            const body = params.Body as PassThrough
            body.on('data', (chunk: Buffer) => chunks.push(chunk))
            return {
                done: () =>
                    new Promise((resolve, reject) => {
                        body.on('end', resolve)
                        body.on('error', reject)
                    }),
            } as unknown as Upload
        })
        const writer = new S3BatchResultWriter(
            {} as S3,
            { mode: 'development-local', cacheControl: 'no-store' },
            schemaDataSource,
        )
        await writer.write(
            'test-bucket',
            `organizations/${organizationId}/uploads/${batchId}.csv`,
            organizationId,
            batchId,
        )
        return parse(Buffer.concat(chunks), { columns: true })
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
        if (funded.kind !== 'funded') {
            throw new Error('unreachable')
        }

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
        if (persisted.kind !== 'persisted') {
            throw new Error('unreachable')
        }

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
        if (funded.kind !== 'funded') {
            throw new Error('unreachable')
        }

        await settlements.persistResultAndIntention({
            executionId: funded.executionId,
            organizationId,
            expectedGeneration: 0,
            newVerification: conclusiveResult({
                verificationQuality: 'inconclusive',
                exists: null,
                evidenceObservedAt: null,
            }),
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
        const funded = await admission.admit({
            organizationId,
            email: 'stuck-cleanup@example.test',
            deliveryMode: 'sync',
        })
        if (funded.kind !== 'funded') {
            throw new Error('unreachable')
        }

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
        expect(payerRequest).toEqual(
            expect.objectContaining({ billingState: 'settled', finalReason: 'failed', chargedCount: 0 }),
        )
    })

    it('replays settlement confirmation idempotently without a second credit call', async () => {
        const funded = await admission.admit({ organizationId, email: 'replay@example.test', deliveryMode: 'sync' })
        if (funded.kind !== 'funded') {
            throw new Error('unreachable')
        }

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
        expect(addresses.every(address => address.admissionKind === 'created' && address.payerRequestId !== null)).toBe(
            true,
        )
        for (const address of addresses) {
            const payerRequest = await requests.findById(address.payerRequestId!, organizationId)
            expect(payerRequest).toEqual(
                expect.objectContaining({
                    source: 'fresh',
                    billingState: 'pending',
                    reservedCount: 1,
                    deliveryMode: 'batch',
                }),
            )
        }
    })

    it.each([
        { quality: 'conclusive_positive', decision: 'capture', finalReason: 'conclusive', charged: 1 },
        { quality: 'conclusive_negative', decision: 'capture', finalReason: 'conclusive', charged: 1 },
        { quality: 'inconclusive', decision: 'release', finalReason: 'inconclusive', charged: 0 },
    ] as const)(
        'keeps ledger, payer, status, and duplicate CSV charges consistent for $quality',
        async ({ quality, decision, finalReason, charged }) => {
            const originals = ['Payer@Example.test', 'payer@example.test', 'PAYER@EXAMPLE.TEST']
            const batchId = await prepareBatch(originals)
            await batchAdmissionService.admit(batchId, organizationId)
            const [address] = await batchAdmissions.pageUniqueAddresses(batchId, organizationId, 0, 10)
            const execution = await executions.findById(address.executionId!, organizationId)
            expect(execution?.payerRequestId).toBe(address.payerRequestId)
            await expect(readAccount()).resolves.toEqual(expect.objectContaining({ balance: 10, reserved: 1 }))

            const result = await settlements.persistResultAndIntention({
                executionId: address.executionId!,
                organizationId,
                expectedGeneration: 0,
                newVerification: conclusiveResult({
                    email: 'payer@example.test',
                    localPart: 'payer',
                    verificationQuality: quality,
                    exists: quality === 'inconclusive' ? null : quality === 'conclusive_positive',
                    evidenceObservedAt: quality === 'inconclusive' ? null : clock.now(),
                }),
                decision,
                finalReason,
            })
            if (result.kind !== 'persisted') {
                throw new Error('Expected persisted batch result')
            }
            await settlementService.settle(address.executionId!, organizationId)

            const receipt = await requests.findById(address.payerRequestId!, organizationId)
            expect(receipt).toEqual(
                expect.objectContaining({
                    requestId: execution!.payerRequestId,
                    source: 'fresh',
                    resultId: result.resultId,
                    billingState: 'settled',
                    chargedCount: charged,
                    finalReason,
                }),
            )
            await expect(readAccount()).resolves.toEqual(
                expect.objectContaining({ balance: 10 - charged, reserved: 0 }),
            )
            await expect(schemaDataSource.getRepository(CreditDebit).countBy({ organizationId })).resolves.toBe(charged)
            await expect(batchAdmissions.getStatusCounts(batchId, organizationId)).resolves.toEqual(
                expect.objectContaining({
                    charged,
                    completedAddresses: 1,
                    conclusiveAddresses: charged,
                    inconclusiveAddresses: 1 - charged,
                }),
            )
            await expect(batchAdmissions.countUnsettledAddresses(batchId, organizationId)).resolves.toBe(0)
            const csv = await readBatchCsv(batchId)
            expect(csv.map(row => row.email)).toEqual(originals)
            expect(csv.map(row => row.sourceRow)).toEqual(['1', '2', '3'])
            expect(csv.map(row => row.creditsCharged)).toEqual([String(charged), '0', '0'])
            expect(csv.map(row => row.billingReason)).toEqual([finalReason, 'duplicate', 'duplicate'])
            expect(csv.map(row => row.duplicateOfRow)).toEqual(['', '1', '1'])
            expect(csv.map(row => row.id)).toEqual([result.resultId, result.resultId, result.resultId])

            // An admission replay after settlement cannot reset the receipt or capture again.
            await batchAdmissionService.admit(batchId, organizationId)
            await expect(requests.findById(address.payerRequestId!, organizationId)).resolves.toEqual(receipt)

            const freeBatchId = await prepareBatch(originals)
            await batchAdmissionService.admit(freeBatchId, organizationId)
            const [freeAddress] = await batchAdmissions.pageUniqueAddresses(freeBatchId, organizationId, 0, 10)
            expect(freeAddress.admissionKind).toBe(charged ? 'cache' : 'cooldown')
            expect(freeAddress.payerRequestId).not.toBe(address.payerRequestId)
            expect(freeAddress.resultId).toBe(result.resultId)
            await expect(batchAdmissions.getStatusCounts(freeBatchId, organizationId)).resolves.toEqual(
                expect.objectContaining({
                    charged: 0,
                    completedAddresses: 1,
                    cachedAddresses: charged,
                    cooldownAddresses: 1 - charged,
                }),
            )
            const freeCsv = await readBatchCsv(freeBatchId)
            expect(freeCsv.map(row => row.creditsCharged)).toEqual(['0', '0', '0'])
            expect(freeCsv.map(row => row.id)).toEqual([result.resultId, result.resultId, result.resultId])
            await expect(readAccount()).resolves.toEqual(
                expect.objectContaining({ balance: 10 - charged, reserved: 0 }),
            )
        },
    )

    it('keeps a batch follower free when the single-verification payer captures its credit', async () => {
        const owner = await admission.admit({ organizationId, email: 'shared@example.test', deliveryMode: 'sync' })
        if (owner.kind !== 'funded') {
            throw new Error('Expected funded owner')
        }
        const batchId = await prepareBatch(['Shared@example.test', 'shared@example.test'])
        await batchAdmissionService.admit(batchId, organizationId)
        const [address] = await batchAdmissions.pageUniqueAddresses(batchId, organizationId, 0, 10)
        expect(address).toEqual(expect.objectContaining({ admissionKind: 'shared', executionId: owner.executionId }))
        expect(address.payerRequestId).not.toBe(owner.requestId)
        await settlements.persistResultAndIntention({
            executionId: owner.executionId,
            organizationId,
            expectedGeneration: 0,
            newVerification: conclusiveResult({ email: 'shared@example.test' }),
            decision: 'capture',
            finalReason: 'conclusive',
        })
        await settlementService.settle(owner.executionId, organizationId)
        await expect(requests.findById(address.payerRequestId!, organizationId)).resolves.toEqual(
            expect.objectContaining({
                source: 'shared',
                billingState: 'settled',
                chargedCount: 0,
                finalReason: 'shared',
            }),
        )
        await expect(batchAdmissions.getStatusCounts(batchId, organizationId)).resolves.toEqual(
            expect.objectContaining({
                sharedAddresses: 1,
                completedAddresses: 1,
                charged: 0,
            }),
        )
        const csv = await readBatchCsv(batchId)
        expect(csv.map(row => row.creditsCharged)).toEqual(['0', '0'])
        expect(csv.map(row => row.billingReason)).toEqual(['shared', 'duplicate'])
        expect(csv[0].id).toBe(csv[1].id)
        await expect(readAccount()).resolves.toEqual(expect.objectContaining({ balance: 9, reserved: 0 }))
    })

    it('assigns one manifest identity concurrently and rejects missing or foreign manifests', async () => {
        const batchId = await prepareBatch(['identity@example.test'])
        const contenders = Array.from({ length: 6 }, () => randomUUID())
        const identities = await Promise.all(
            contenders.map(id =>
                batchAdmissions.ensurePayerRequestId(batchId, organizationId, 'identity@example.test', id),
            ),
        )
        expect(new Set(identities).size).toBe(1)
        expect(contenders).toContain(identities[0])
        await expect(requests.findById(identities[0], organizationId)).resolves.toBeNull()
        await expect(batchAdmissions.countUnsettledAddresses(batchId, organizationId)).resolves.toBe(1)
        for (const [id, org, address] of [
            [randomUUID(), organizationId, 'identity@example.test'],
            [batchId, randomUUID(), 'identity@example.test'],
            [batchId, organizationId, 'missing@example.test'],
        ]) {
            await expect(batchAdmissions.ensurePayerRequestId(id, org, address, randomUUID())).rejects.toThrow()
        }
        await batchAdmissionService.admit(batchId, organizationId)
        const [address] = await batchAdmissions.pageUniqueAddresses(batchId, organizationId, 0, 10)
        expect(address.payerRequestId).toBe(identities[0])
        await expect(executions.findById(address.executionId!, organizationId)).resolves.toEqual(
            expect.objectContaining({
                payerRequestId: identities[0],
            }),
        )
    })

    it('resumes after identity assignment without allocating a second payer', async () => {
        const batchId = await prepareBatch(['interrupted@example.test'])
        jest.spyOn(cacheReader, 'findLatestCandidate').mockRejectedValueOnce(
            new Error('injected_resolution_interruption'),
        )
        await expect(batchAdmissionService.admit(batchId, organizationId)).rejects.toThrow(
            'injected_resolution_interruption',
        )
        const [before] = await batchAdmissions.pageUniqueAddresses(batchId, organizationId, 0, 10)
        expect(before.payerRequestId).not.toBeNull()
        await expect(batchAdmissions.countUnsettledAddresses(batchId, organizationId)).resolves.toBe(1)
        await batchAdmissionService.admit(batchId, organizationId)
        const [after] = await batchAdmissions.pageUniqueAddresses(batchId, organizationId, 0, 10)
        expect(after.payerRequestId).toBe(before.payerRequestId)
        await expect(executions.findById(after.executionId!, organizationId)).resolves.toEqual(
            expect.objectContaining({
                payerRequestId: before.payerRequestId,
            }),
        )
        await expect(
            schemaDataSource.getRepository(VerificationRequestEntity).countBy({ organizationId }),
        ).resolves.toBe(1)
    })

    it('resumes its own batch-owned claim as created after the outcome write was interrupted, funding it exactly once', async () => {
        const batchId = await prepareBatch(['resumed@example.test'])
        jest.spyOn(batchAdmissions, 'recordAdmissionOutcome').mockImplementationOnce(() => {
            throw new Error('injected_outcome_write_interruption')
        })

        await expect(batchAdmissionService.admit(batchId, organizationId)).rejects.toThrow(
            'injected_outcome_write_interruption',
        )
        const [before] = await batchAdmissions.pageUniqueAddresses(batchId, organizationId, 0, 10)
        expect(before.admissionKind).toBeNull()
        expect(before.payerRequestId).not.toBeNull()
        const claimedAfterInterruption = await schemaDataSource
            .getRepository(VerificationExecutionEntity)
            .findBy({ organizationId, fundingOwnerType: 'batch_group', fundingOwnerId: batchId })
        expect(claimedAfterInterruption).toHaveLength(1)
        const originalExecutionId = claimedAfterInterruption[0].executionId

        await batchAdmissionService.admit(batchId, organizationId)

        const [after] = await batchAdmissions.pageUniqueAddresses(batchId, organizationId, 0, 10)
        expect(after.admissionKind).toBe('created')
        expect(after.executionId).toBe(originalExecutionId)
        expect(after.payerRequestId).toBe(before.payerRequestId)
        await expect(readAccount()).resolves.toEqual(expect.objectContaining({ balance: 10, reserved: 1 }))
        const executionRows = await schemaDataSource
            .getRepository(VerificationExecutionEntity)
            .findBy({ organizationId, fundingOwnerType: 'batch_group', fundingOwnerId: batchId })
        expect(executionRows).toHaveLength(1)
        expect(executionRows[0].executionId).toBe(originalExecutionId)
        expect(executionRows[0].state).toBe('queued')
        const payerRequest = await requests.findById(after.payerRequestId!, organizationId)
        expect(payerRequest).toEqual(
            expect.objectContaining({
                source: 'fresh',
                billingState: 'pending',
                reservedCount: 1,
                executionId: originalExecutionId,
            }),
        )
    })

    it('preserves the same resumed identity across two consecutive interruptions', async () => {
        const batchId = await prepareBatch(['twice-resumed@example.test'])
        jest.spyOn(batchAdmissions, 'recordAdmissionOutcome')
            .mockImplementationOnce(() => {
                throw new Error('injected_first_interruption')
            })
            .mockImplementationOnce(() => {
                throw new Error('injected_second_interruption')
            })

        await expect(batchAdmissionService.admit(batchId, organizationId)).rejects.toThrow(
            'injected_first_interruption',
        )
        const firstClaim = await schemaDataSource
            .getRepository(VerificationExecutionEntity)
            .findBy({ organizationId, fundingOwnerType: 'batch_group', fundingOwnerId: batchId })
        expect(firstClaim).toHaveLength(1)

        await expect(batchAdmissionService.admit(batchId, organizationId)).rejects.toThrow(
            'injected_second_interruption',
        )
        const secondClaim = await schemaDataSource
            .getRepository(VerificationExecutionEntity)
            .findBy({ organizationId, fundingOwnerType: 'batch_group', fundingOwnerId: batchId })
        expect(secondClaim).toHaveLength(1)
        expect(secondClaim[0].executionId).toBe(firstClaim[0].executionId)

        await batchAdmissionService.admit(batchId, organizationId)

        const [after] = await batchAdmissions.pageUniqueAddresses(batchId, organizationId, 0, 10)
        expect(after.admissionKind).toBe('created')
        expect(after.executionId).toBe(firstClaim[0].executionId)
        await expect(readAccount()).resolves.toEqual(expect.objectContaining({ balance: 10, reserved: 1 }))
        const finalExecutions = await schemaDataSource
            .getRepository(VerificationExecutionEntity)
            .findBy({ organizationId, fundingOwnerType: 'batch_group', fundingOwnerId: batchId })
        expect(finalExecutions).toHaveLength(1)
    })

    it('still records a genuinely different batch owner as shared, never mistaking it for its own resumed claim', async () => {
        const firstBatchId = await prepareBatch(['cross-batch-shared@example.test'])
        await batchAdmissionService.admit(firstBatchId, organizationId)
        const [firstAddress] = await batchAdmissions.pageUniqueAddresses(firstBatchId, organizationId, 0, 10)
        expect(firstAddress.admissionKind).toBe('created')

        const secondBatchId = await prepareBatch(['cross-batch-shared@example.test'])
        await batchAdmissionService.admit(secondBatchId, organizationId)

        const [secondAddress] = await batchAdmissions.pageUniqueAddresses(secondBatchId, organizationId, 0, 10)
        expect(secondAddress.admissionKind).toBe('shared')
        expect(secondAddress.executionId).toBe(firstAddress.executionId)
        await expect(readAccount()).resolves.toEqual(expect.objectContaining({ balance: 10, reserved: 1 }))
        const payerRequest = await requests.findById(secondAddress.payerRequestId!, organizationId)
        expect(payerRequest).toEqual(
            expect.objectContaining({ source: 'shared', billingState: 'pending', reservedCount: 0 }),
        )
    })

    it('replays an insertion interrupted after commit without resetting the subsequently settled receipt', async () => {
        const batchId = await prepareBatch(['insert-replay@example.test'])
        const insert = requests.insert.bind(requests)
        let originalInput: NewVerificationRequestInput | undefined
        jest.spyOn(requests, 'insert').mockImplementationOnce(async input => {
            originalInput = input
            await insert(input)
            throw new Error('injected_after_insert')
        })
        await expect(batchAdmissionService.admit(batchId, organizationId)).rejects.toThrow('injected_after_insert')
        const [address] = await batchAdmissions.pageUniqueAddresses(batchId, organizationId, 0, 10)
        await settlements.persistResultAndIntention({
            executionId: address.executionId!,
            organizationId,
            expectedGeneration: 0,
            newVerification: conclusiveResult({ email: 'insert-replay@example.test' }),
            decision: 'capture',
            finalReason: 'conclusive',
        })
        await settlementService.settle(address.executionId!, organizationId)
        const settled = await requests.findById(address.payerRequestId!, organizationId)
        await expect(insert(originalInput!)).resolves.toEqual({ kind: 'replayed', record: settled })
        await batchAdmissionService.admit(batchId, organizationId)
        await expect(requests.findById(address.payerRequestId!, organizationId)).resolves.toEqual(settled)
        await expect(
            schemaDataSource.getRepository(VerificationRequestEntity).countBy({ organizationId }),
        ).resolves.toBe(1)
        await expect(readAccount()).resolves.toEqual(expect.objectContaining({ balance: 9, reserved: 0 }))
        await expect(batchAdmissions.getStatusCounts(batchId, organizationId)).resolves.toEqual(
            expect.objectContaining({ charged: 1 }),
        )
    })

    it('creates one request for concurrent UUID insertions and rejects conflicting batch replays', async () => {
        const input: NewVerificationRequestInput = {
            requestId: randomUUID(),
            organizationId,
            normalizedAddress: 'request-race@example.test',
            deliveryMode: 'batch',
            clientRequestKey: null,
            source: 'fresh',
            executionId: randomUUID(),
            resultId: null,
            reservedCount: 1,
            billingState: 'pending',
            finalReason: null,
        }
        const outcomes = await Promise.all(Array.from({ length: 6 }, () => requests.insert(input)))
        expect(outcomes.filter(outcome => outcome.kind === 'inserted')).toHaveLength(1)
        expect(outcomes.filter(outcome => outcome.kind === 'replayed')).toHaveLength(5)
        const winner = await requests.findById(input.requestId, organizationId)
        for (const conflict of [
            { organizationId: randomUUID() },
            { normalizedAddress: 'different@example.test' },
            { source: 'shared' as const },
            { executionId: randomUUID() },
            { deliveryMode: 'sync' as const },
            { clientRequestKey: randomUUID() },
        ]) {
            await expect(requests.insert({ ...input, ...conflict })).rejects.toThrow('batch_request_identity_conflict')
        }
        await expect(requests.findById(input.requestId, organizationId)).resolves.toEqual(winner)
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

        await admitToCompletion(batchId)

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
                expect.objectContaining({
                    billingState: 'settled',
                    finalReason: 'failed',
                    reservedCount: 0,
                    chargedCount: 0,
                }),
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

    describe('batch group funding recovery', () => {
        let recovery: BatchAdmissionRecoveryService
        let dispatcher: jest.Mocked<VerificationExecutionDispatcher>
        let reconciler: VerificationReconciler

        beforeEach(() => {
            recovery = new BatchAdmissionRecoveryService(batchAdmissions, batchAdmissionService, clock)
            dispatcher = { dispatch: jest.fn().mockResolvedValue(undefined) }
            reconciler = new VerificationReconciler(
                executions,
                requests,
                settlements,
                settlementService,
                dispatcher,
                credits,
                clock,
                recovery,
            )
        })

        function advanceClock(ms: number): void {
            currentTime = new Date(currentTime.getTime() + ms)
        }

        function barrier(): { reached: Promise<void>; release: () => void; wait: () => Promise<void> } {
            let reach!: () => void
            let release!: () => void
            const reached = new Promise<void>(resolve => (reach = resolve))
            const released = new Promise<void>(resolve => (release = resolve))
            return {
                reached,
                release,
                wait: () => {
                    reach()
                    return released
                },
            }
        }

        async function ownedExecutions(batchId: string): Promise<VerificationExecutionEntity[]> {
            return schemaDataSource.getRepository(VerificationExecutionEntity).find({
                where: { organizationId, fundingOwnerType: 'batch_group', fundingOwnerId: batchId },
                order: { normalizedAddress: 'ASC' },
            })
        }

        async function reservations(): Promise<CreditReservation[]> {
            return schemaDataSource.getRepository(CreditReservation).findBy({ organizationId })
        }

        async function receipts(batchId: string): Promise<VerificationRequestEntity[]> {
            const addresses = await batchAdmissions.pageUniqueAddresses(batchId, organizationId, 0, 1_000)
            return schemaDataSource
                .getRepository(VerificationRequestEntity)
                .find({ where: addresses.map(address => ({ requestId: address.payerRequestId ?? randomUUID() })) })
        }

        /** Simulates a worker that dies mid-advancement: the step fails and the lease is never released. */
        function crashWithoutRelease(): void {
            jest.spyOn(batchAdmissions, 'releaseAdmissionLease').mockResolvedValueOnce(undefined)
        }

        it('survives reconciliation ticks while paused before reservation, then funds every address', async () => {
            const batchId = await prepareBatch(['p1@example.test', 'p2@example.test'])
            const paused = barrier()
            const reserveMany = credits.reserveMany.bind(credits)
            jest.spyOn(credits, 'reserveMany').mockImplementationOnce(async (org, items) => {
                await paused.wait()
                return reserveMany(org, items)
            })

            const admitting = batchAdmissionService.admit(batchId, organizationId)
            await paused.reached
            for (let tick = 0; tick < 3; tick++) {
                await expect(reconciler.reconcile(100)).resolves.toEqual(
                    expect.objectContaining({ batchGroupsChecked: 0 }),
                )
                advanceClock(30_000)
                // The live owner renews at its liveness cadence; model that renewal for the paused call.
                const group = await batchAdmissions.findById(batchId, organizationId)
                await batchAdmissions.renewAdmissionLease(
                    batchId,
                    organizationId,
                    {
                        ownerId: group!.admissionLeaseOwnerId!,
                        generation: group!.admissionGeneration,
                        now: currentTime,
                    },
                    new Date(currentTime.getTime() + LEASE_DURATION_MS),
                )
            }
            expect((await ownedExecutions(batchId)).map(execution => execution.state)).toEqual([
                'funding_pending',
                'funding_pending',
            ])
            paused.release()

            await expect(admitting).resolves.toEqual({ kind: 'complete' })
            expect((await ownedExecutions(batchId)).map(execution => execution.state)).toEqual(['queued', 'queued'])
            await expect(readAccount()).resolves.toEqual(expect.objectContaining({ balance: 10, reserved: 2 }))
        })

        it('recovers worker loss during resolution only after lease expiry, keeping identities and holds unique', async () => {
            const batchId = await prepareBatch(['r1@example.test', 'r2@example.test', 'r3@example.test'])
            const record = batchAdmissions.recordAdmissionOutcome.bind(batchAdmissions)
            let outcomes = 0
            jest.spyOn(batchAdmissions, 'recordAdmissionOutcome').mockImplementation((...args) => {
                outcomes += 1
                if (outcomes === 2) {
                    return Promise.reject(new Error('injected_worker_loss'))
                }
                return record(...args)
            })
            crashWithoutRelease()

            await expect(batchAdmissionService.admit(batchId, organizationId)).rejects.toThrow('injected_worker_loss')
            const claimed = await ownedExecutions(batchId)
            const identities = await batchAdmissions.pageUniqueAddresses(batchId, organizationId, 0, 10)
            expect(claimed).toHaveLength(2)

            await expect(recovery.reconcile(100)).resolves.toEqual(expect.objectContaining({ groupsChecked: 0 }))
            await expect(batchAdmissionService.admit(batchId, organizationId)).resolves.toMatchObject({ kind: 'busy' })

            advanceClock(LEASE_DURATION_MS + 1)
            for (let sweep = 0; sweep < 5; sweep++) await recovery.reconcile(100)

            const group = await batchAdmissions.findById(batchId, organizationId)
            expect(group).toEqual(expect.objectContaining({ state: 'admitted', finalizationState: 'ready' }))
            expect(group!.admissionGeneration).toBeGreaterThanOrEqual(2)
            const finalExecutions = await ownedExecutions(batchId)
            expect(finalExecutions).toHaveLength(3)
            expect(finalExecutions.map(execution => execution.executionId)).toEqual(
                expect.arrayContaining(claimed.map(execution => execution.executionId)),
            )
            const finalIdentities = await batchAdmissions.pageUniqueAddresses(batchId, organizationId, 0, 10)
            // Identities assigned before the loss survive; the untouched address receives its first one on recovery.
            identities.forEach((address, index) => {
                if (address.payerRequestId !== null) {
                    expect(finalIdentities[index].payerRequestId).toBe(address.payerRequestId)
                }
            })
            expect(finalIdentities.every(address => address.payerRequestId !== null)).toBe(true)
            await expect(readAccount()).resolves.toEqual(expect.objectContaining({ balance: 10, reserved: 3 }))
            await expect(reservations()).resolves.toHaveLength(3)
            await expect(receipts(batchId)).resolves.toHaveLength(3)
        })

        it('resumes the exact manifest after worker loss between reservation and decision commit', async () => {
            const batchId = await prepareBatch(['d1@example.test', 'd2@example.test'])
            jest.spyOn(batchAdmissions, 'recordFundingDecision').mockRejectedValueOnce(
                new Error('injected_decision_loss'),
            )
            crashWithoutRelease()
            const reserveMany = jest.spyOn(credits, 'reserveMany')

            await expect(batchAdmissionService.admit(batchId, organizationId)).rejects.toThrow('injected_decision_loss')
            await expect(readAccount()).resolves.toEqual(expect.objectContaining({ reserved: 2 }))
            await expect(batchAdmissions.findById(batchId, organizationId)).resolves.toEqual(
                expect.objectContaining({ state: 'funding', fundingDecision: 'pending' }),
            )

            advanceClock(LEASE_DURATION_MS + 1)
            for (let sweep = 0; sweep < 3; sweep++) await recovery.reconcile(100)

            expect(reserveMany.mock.calls[1][1]).toEqual(reserveMany.mock.calls[0][1])
            await expect(readAccount()).resolves.toEqual(expect.objectContaining({ balance: 10, reserved: 2 }))
            await expect(reservations()).resolves.toHaveLength(2)
            expect((await ownedExecutions(batchId)).map(execution => execution.state)).toEqual(['queued', 'queued'])
        })

        it('fences an expired owner on a second connection after a newer generation denied and closed the group', async () => {
            await schemaDataSource.getRepository(OrganizationCreditAccount).update({ organizationId }, { balance: 1 })
            const batchId = await prepareBatch(['f1@example.test', 'f2@example.test'])
            const staleStore = new TypeOrmBatchAdmissionStore(secondDataSource)
            const staleExecutions = new TypeOrmVerificationExecutionStore(secondDataSource)
            const leased = await staleStore.claimAdmissionLease(
                batchId,
                organizationId,
                randomUUID(),
                currentTime,
                new Date(currentTime.getTime() + LEASE_DURATION_MS),
            )
            if (leased.kind !== 'acquired') {
                throw new Error('Expected the first owner to acquire the lease')
            }
            const stale: BatchAdmissionFence = {
                ownerId: leased.record.admissionLeaseOwnerId!,
                generation: leased.generation,
                now: currentTime,
            }
            await expect(
                staleStore.transitionState(batchId, organizationId, stale, 'validating', 'admitting'),
            ).resolves.toBe('applied')

            advanceClock(LEASE_DURATION_MS + 1)
            await admitToCompletion(batchId)
            const staleNow = { ...stale, now: currentTime }
            const [owned] = await ownedExecutions(batchId)

            await expect(
                staleExecutions.claimOrJoinForBatchGroup(
                    batchId,
                    staleNow,
                    organizationId,
                    'f3@example.test',
                    randomUUID(),
                    randomUUID(),
                    currentTime,
                    () => false,
                ),
            ).resolves.toEqual({ kind: 'stale-admission' })
            await expect(staleStore.freezeFundingManifest(batchId, organizationId, staleNow)).resolves.toBe('stale')
            await expect(staleStore.recordFundingDecision(batchId, organizationId, staleNow, 'approved')).resolves.toBe(
                'stale',
            )
            await expect(
                staleExecutions.markBatchGroupQueued(owned.executionId, organizationId, batchId, staleNow),
            ).resolves.toBe('stale')
            await expect(
                staleStore.renewAdmissionLease(batchId, organizationId, staleNow, new Date(currentTime.getTime() + 1)),
            ).resolves.toBe(false)
            await expect(batchAdmissions.findById(batchId, organizationId)).resolves.toEqual(
                expect.objectContaining({
                    state: 'insufficient_credits',
                    fundingDecision: 'denied',
                    finalizationState: 'ready',
                }),
            )
            expect((await ownedExecutions(batchId)).every(execution => execution.state === 'canceled')).toBe(true)
            await expect(readAccount()).resolves.toEqual(expect.objectContaining({ balance: 1, reserved: 0 }))
        })

        it.each(['close-then-late-reserve', 'reserve-then-close'] as const)(
            'leaves no hold for a stale reservation racing closure (%s)',
            async order => {
                await schemaDataSource
                    .getRepository(OrganizationCreditAccount)
                    .update({ organizationId }, { balance: 1 })
                const batchId = await prepareBatch(['o1@example.test', 'o2@example.test'])
                await admitToCompletion(batchId)
                const owned = (await batchAdmissions.listOwnedExecutionIds(batchId, organizationId)).map(
                    operationId => ({ operationId, amount: 1 }),
                )
                await schemaDataSource
                    .getRepository(OrganizationCreditAccount)
                    .update({ organizationId }, { balance: 10 })

                if (order === 'close-then-late-reserve') {
                    const late = await credits.reserveMany(organizationId, owned)
                    expect(late.map(reservation => reservation.state)).toEqual(['released', 'released'])
                } else {
                    // A stale reservation that won before closure is released by the repeated closure.
                    await schemaDataSource.getRepository(CreditReservation).delete({ organizationId })
                    await credits.reserveMany(organizationId, owned)
                    await expect(readAccount()).resolves.toEqual(expect.objectContaining({ reserved: 2 }))
                    await credits.closeAdmissionMany(organizationId, owned)
                }

                await expect(readAccount()).resolves.toEqual(expect.objectContaining({ balance: 10, reserved: 0 }))
                expect((await reservations()).map(reservation => reservation.state)).toEqual(['released', 'released'])
                expect((await ownedExecutions(batchId)).every(execution => execution.state === 'canceled')).toBe(true)
                expect(
                    (await receipts(batchId)).every(
                        receipt => receipt.finalReason === 'failed' && receipt.chargedCount === 0,
                    ),
                ).toBe(true)
                await expect(admitToCompletion(batchId)).resolves.toBe(1)
                await expect(batchAdmissions.findById(batchId, organizationId)).resolves.toEqual(
                    expect.objectContaining({ state: 'insufficient_credits', fundingDecision: 'denied' }),
                )
            },
        )

        it('never reopens a denied group after interrupted closure and a later top-up', async () => {
            await schemaDataSource.getRepository(OrganizationCreditAccount).update({ organizationId }, { balance: 1 })
            const batchId = await prepareBatch(['t1@example.test', 't2@example.test'])
            const reserveMany = jest.spyOn(credits, 'reserveMany')
            jest.spyOn(credits, 'closeAdmissionMany').mockRejectedValueOnce(new Error('injected_closure_interruption'))

            await expect(batchAdmissionService.admit(batchId, organizationId)).resolves.toMatchObject({
                kind: 'continuation',
                phase: 'closure',
            })
            await expect(batchAdmissionService.admit(batchId, organizationId)).rejects.toThrow(
                'injected_closure_interruption',
            )
            await schemaDataSource.getRepository(OrganizationCreditAccount).update({ organizationId }, { balance: 100 })
            await admitToCompletion(batchId)

            expect(reserveMany).toHaveBeenCalledTimes(1)
            await expect(readAccount()).resolves.toEqual(expect.objectContaining({ balance: 100, reserved: 0 }))
            expect((await reservations()).map(reservation => reservation.state)).toEqual(['released', 'released'])
            await expect(batchAdmissions.findById(batchId, organizationId)).resolves.toEqual(
                expect.objectContaining({ state: 'insufficient_credits', fundingDecision: 'denied' }),
            )
        })

        it('denies a group whose reservation replay returns a released tombstone', async () => {
            const batchId = await prepareBatch(['tomb1@example.test', 'tomb2@example.test'])
            const reserveMany = credits.reserveMany.bind(credits)
            jest.spyOn(credits, 'reserveMany').mockImplementationOnce(async (org, items) => {
                // Another generation already closed the first operation before this reservation ran.
                await credits.closeAdmissionMany(org, [items[0]])
                return reserveMany(org, items)
            })

            await admitToCompletion(batchId)

            expect((await ownedExecutions(batchId)).every(execution => execution.state === 'canceled')).toBe(true)
            await expect(readAccount()).resolves.toEqual(expect.objectContaining({ balance: 10, reserved: 0 }))
            await expect(batchAdmissions.findById(batchId, organizationId)).resolves.toEqual(
                expect.objectContaining({ state: 'insufficient_credits', fundingDecision: 'denied' }),
            )
        })

        it('replays an approved group without reserving again after its execution already captured', async () => {
            const batchId = await prepareBatch(['cap@example.test'])
            jest.spyOn(batchAdmissions, 'markFinalizationReady').mockRejectedValueOnce(
                new Error('injected_finalization_loss'),
            )
            await expect(batchAdmissionService.admit(batchId, organizationId)).rejects.toThrow(
                'injected_finalization_loss',
            )
            const [execution] = await ownedExecutions(batchId)
            await settlements.persistResultAndIntention({
                executionId: execution.executionId,
                organizationId,
                expectedGeneration: 0,
                newVerification: conclusiveResult({ email: 'cap@example.test' }),
                decision: 'capture',
                finalReason: 'conclusive',
            })
            await settlementService.settle(execution.executionId, organizationId)
            const reserveMany = jest.spyOn(credits, 'reserveMany')

            await admitToCompletion(batchId)

            expect(reserveMany).not.toHaveBeenCalled()
            expect((await reservations()).map(reservation => reservation.state)).toEqual(['captured'])
            await expect(readAccount()).resolves.toEqual(expect.objectContaining({ balance: 9, reserved: 0 }))
        })

        it('yields a 101-address group at its budget and resumes from the first incomplete persisted row', async () => {
            await schemaDataSource.getRepository(OrganizationCreditAccount).update({ organizationId }, { balance: 200 })
            const emails = Array.from(
                { length: 101 },
                (_, index) => `bulk-${String(index).padStart(3, '0')}@example.test`,
            )
            const batchId = await prepareBatch(emails)
            const record = batchAdmissions.recordAdmissionOutcome.bind(batchAdmissions)
            let outcomes = 0
            jest.spyOn(batchAdmissions, 'recordAdmissionOutcome').mockImplementation((...args) => {
                outcomes += 1
                // Interrupt just before the last budgeted write of the first advancement.
                if (outcomes === 100) {
                    return Promise.reject(new Error('injected_last_write_interruption'))
                }
                return record(...args)
            })

            const reserveMany = jest.spyOn(credits, 'reserveMany')

            await expect(batchAdmissionService.admit(batchId, organizationId)).rejects.toThrow(
                'injected_last_write_interruption',
            )
            const first = await batchAdmissionService.admit(batchId, organizationId)
            expect(first).toEqual(expect.objectContaining({ kind: 'continuation' }))
            const released = await batchAdmissions.findById(batchId, organizationId)
            expect(released).toEqual(
                expect.objectContaining({ admissionLeaseOwnerId: null, admissionLeaseExpiresAt: null }),
            )
            const releasedFence = { ownerId: randomUUID(), generation: released!.admissionGeneration, now: currentTime }
            await expect(
                batchAdmissions.renewAdmissionLease(
                    batchId,
                    organizationId,
                    releasedFence,
                    new Date(currentTime.getTime() + 1),
                ),
            ).resolves.toBe(false)

            await admitToCompletion(batchId)

            expect(reserveMany).toHaveBeenCalledTimes(1)
            expect(reserveMany.mock.calls[0][1]).toHaveLength(101)
            const owned = await ownedExecutions(batchId)
            expect(owned).toHaveLength(101)
            expect(new Set(owned.map(execution => execution.normalizedAddress)).size).toBe(101)
            expect(owned.every(execution => execution.state === 'queued')).toBe(true)
            await expect(readAccount()).resolves.toEqual(expect.objectContaining({ reserved: 101 }))
            await expect(receipts(batchId)).resolves.toHaveLength(101)
        })

        it('runs single executions before a bounded, fair group sweep and recovers a missing receipt next sweep', async () => {
            // Recovery sweeps every organization; retire earlier scenarios' groups in this disposable schema.
            await schemaDataSource
                .getRepository(BatchAdmissionEntity)
                .update({ finalizationState: 'preparing' }, { finalizationState: 'ready' })
            await schemaDataSource
                .getRepository(VerificationExecutionEntity)
                .update(
                    { state: In(['funding_pending', 'queued', 'running', 'awaiting_retry', 'settling']) },
                    { state: 'canceled' },
                )
            const single = await admission.admit({
                organizationId,
                email: 'single-first@example.test',
                deliveryMode: 'async',
            })
            if (single.kind !== 'funded') {
                throw new Error('Expected a funded single execution')
            }
            const cached = await schemaDataSource.getRepository(EmailVerificationEntity).save(
                schemaDataSource.getRepository(EmailVerificationEntity).create({
                    ...conclusiveResult({ email: 'fair@example.test', evidenceObservedAt: currentTime }),
                    organizationId,
                }),
            )
            expect(cached.id).toBeDefined()
            const batchIds: string[] = []
            for (let index = 0; index < 101; index++) batchIds.push(await prepareBatch(['fair@example.test']))
            const order: string[] = []
            dispatcher.dispatch.mockImplementation(executionId => {
                order.push(`single:${executionId}`)
                return Promise.resolve()
            })
            const admit = batchAdmissionService.admit.bind(batchAdmissionService)
            jest.spyOn(batchAdmissionService, 'admit').mockImplementation((batchId, org) => {
                order.push(`group:${batchId}`)
                return admit(batchId, org)
            })
            const insert = requests.insert.bind(requests)
            jest.spyOn(requests, 'insert')
                .mockRejectedValueOnce(new Error('injected_receipt_loss'))
                .mockImplementation(insert)

            const first = await reconciler.reconcile(100)

            const firstGroup = order.findIndex(entry => entry.startsWith('group:'))
            expect(order.indexOf(`single:${single.executionId}`)).toBeGreaterThanOrEqual(0)
            expect(order.indexOf(`single:${single.executionId}`)).toBeLessThan(firstGroup)
            expect(order.slice(firstGroup).every(entry => entry.startsWith('group:'))).toBe(true)
            const firstGroups = order.filter(entry => entry.startsWith('group:'))
            expect(firstGroups).toHaveLength(100)
            expect(new Set(firstGroups).size).toBe(100)
            expect(first.batchGroupsChecked).toBe(100)
            const untouched = batchIds.filter(batchId => !firstGroups.includes(`group:${batchId}`))
            expect(untouched).toHaveLength(1)

            order.length = 0
            await reconciler.reconcile(100)

            const secondGroups = order.filter(entry => entry.startsWith('group:'))
            expect(secondGroups).toContain(`group:${untouched[0]}`)
            expect(secondGroups).toHaveLength(2)
            for (const batchId of batchIds) {
                await expect(batchAdmissions.findById(batchId, organizationId)).resolves.toEqual(
                    expect.objectContaining({ state: 'admitted', finalizationState: 'ready' }),
                )
            }
        })
    })
})
