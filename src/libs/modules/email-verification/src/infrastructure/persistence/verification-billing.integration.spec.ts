import { randomUUID } from 'node:crypto'
import { PassThrough } from 'node:stream'
import { Upload } from '@aws-sdk/lib-storage'
import { S3 } from 'nestjs-s3'
import { parse } from 'csv-parse/sync'
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
import { CreditReservationService } from '@tuposoft/lead-email-finder/modules/credits'
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
    VerificationSettlementIntentionEntity,
    BatchAdmissionEntity,
    BatchUniqueAddressEntity,
    BatchRowEntity,
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
        if (schemaDataSource?.isInitialized) await schemaDataSource.destroy()
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

    async function prepareBatch(emails: string[]): Promise<string> {
        const batchId = randomUUID()
        const addresses = new Map<string, number>()
        emails.forEach((email, index) => {
            if (!addresses.has(email.toLowerCase())) addresses.set(email.toLowerCase(), index + 1)
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
        expect(payerRequest).toEqual(
            expect.objectContaining({ billingState: 'settled', finalReason: 'failed', chargedCount: 0 }),
        )
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
            if (result.kind !== 'persisted') throw new Error('Expected persisted batch result')
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
        if (owner.kind !== 'funded') throw new Error('Expected funded owner')
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

        await expect(batchAdmissionService.admit(batchId, organizationId)).rejects.toThrow('injected_outcome_write_interruption')
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

        await expect(batchAdmissionService.admit(batchId, organizationId)).rejects.toThrow('injected_first_interruption')
        const firstClaim = await schemaDataSource
            .getRepository(VerificationExecutionEntity)
            .findBy({ organizationId, fundingOwnerType: 'batch_group', fundingOwnerId: batchId })
        expect(firstClaim).toHaveLength(1)

        await expect(batchAdmissionService.admit(batchId, organizationId)).rejects.toThrow('injected_second_interruption')
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
        expect(payerRequest).toEqual(expect.objectContaining({ source: 'shared', billingState: 'pending', reservedCount: 0 }))
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
})
