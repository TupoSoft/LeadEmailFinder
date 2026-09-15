import { CreditReservationService, InsufficientCreditsException } from '@tuposoft/lead-email-finder/modules/credits'
import { VerificationClock } from '../../ports/verification-clock'
import { VerificationCooldownReader } from '../../ports/verification-cooldown-reader'
import { VerificationResultCacheReader } from '../../ports/verification-result-cache-reader'
import { ClaimAddressOutcome, ExecutionFundingOwner, VerificationExecutionStore } from '../../ports/verification-execution-store'
import { InsertRequestOutcome, NewVerificationRequestInput, VerificationRequestStore } from '../../ports/verification-request-store'
import {
    BatchAdmissionRecord,
    BatchAdmissionState,
    BatchAdmissionStore,
    BatchStatusCounts,
    BatchUniqueAddressAdmissionKind,
    BatchUniqueAddressRecord,
    CreateBatchAdmissionOutcome,
    NewBatchAdmissionInput,
} from './batch-admission-store'
import { BatchAdmissionService } from './batch-admission.service'

const organizationId = '10000000-0000-4000-8000-000000000001'
const batchId = '20000000-0000-4000-8000-000000000002'
const now = new Date('2026-09-15T00:00:00.000Z')
const cacheTtlMs = 24 * 60 * 60 * 1000
const executionDeadlineMs = 24 * 60 * 60 * 1000
const addressCooldownMs = 60_000

class FakeBatchAdmissionStore implements BatchAdmissionStore {
    private admission: BatchAdmissionRecord | null = null
    private addresses: BatchUniqueAddressRecord[] = []

    seed(record: BatchAdmissionRecord, addresses: readonly { normalizedAddress: string; firstSeenRow: number }[]): void {
        this.admission = record
        this.addresses = addresses.map(address => ({
            batchId: record.batchId,
            normalizedAddress: address.normalizedAddress,
            firstSeenRow: address.firstSeenRow,
            admissionKind: null,
            executionId: null,
            resultId: null,
            payerRequestId: null,
        }))
    }

    createOrReplay(input: NewBatchAdmissionInput): Promise<CreateBatchAdmissionOutcome> {
        this.admission = {
            batchId: input.batchId,
            organizationId: input.organizationId,
            state: 'validating',
            totalRows: input.totalRows,
            uniqueAddressCount: input.uniqueAddressCount,
            clientRequestKey: input.clientRequestKey,
            contentDigest: input.contentDigest,
            createdAt: now,
            updatedAt: now,
        }
        return Promise.resolve({ kind: 'created', record: this.admission })
    }

    findById(id: string, _organizationId: string): Promise<BatchAdmissionRecord | null> {
        return Promise.resolve(this.admission && this.admission.batchId === id ? this.admission : null)
    }

    findByClientKey(): Promise<BatchAdmissionRecord | null> {
        return Promise.resolve(null)
    }

    updateState(id: string, _organizationId: string, state: BatchAdmissionState): Promise<void> {
        if (this.admission && this.admission.batchId === id) this.admission = { ...this.admission, state }
        return Promise.resolve()
    }

    insertUniqueAddresses(): Promise<void> {
        // Seeded directly via `seed()` in these tests.
        return Promise.resolve()
    }

    pageUniqueAddresses(id: string, _organizationId: string, skip: number, take: number): Promise<readonly BatchUniqueAddressRecord[]> {
        if (!this.admission || this.admission.batchId !== id) return Promise.resolve([])
        return Promise.resolve(this.addresses.slice(skip, skip + take))
    }

    recordAdmissionOutcome(
        id: string,
        normalizedAddress: string,
        outcome: { readonly admissionKind: BatchUniqueAddressAdmissionKind; readonly executionId: string | null; readonly resultId: string | null },
    ): Promise<void> {
        const index = this.addresses.findIndex(address => address.batchId === id && address.normalizedAddress === normalizedAddress)
        if (index >= 0 && this.addresses[index].admissionKind === null) {
            this.addresses[index] = { ...this.addresses[index], ...outcome }
        }
        return Promise.resolve()
    }

    recordPayerRequestId(id: string, normalizedAddress: string, payerRequestId: string): Promise<void> {
        const index = this.addresses.findIndex(address => address.batchId === id && address.normalizedAddress === normalizedAddress)
        if (index >= 0) this.addresses[index] = { ...this.addresses[index], payerRequestId }
        return Promise.resolve()
    }

    snapshot(): readonly BatchUniqueAddressRecord[] {
        return this.addresses
    }

    countUnsettledAddresses(): Promise<number> {
        return Promise.resolve(this.addresses.filter(address => address.payerRequestId === null).length)
    }

    getStatusCounts(): Promise<BatchStatusCounts> {
        return Promise.resolve({
            cachedAddresses: 0,
            sharedAddresses: 0,
            cooldownAddresses: 0,
            completedAddresses: 0,
            conclusiveAddresses: 0,
            inconclusiveAddresses: 0,
            failedAddresses: 0,
            reserved: 0,
            charged: 0,
        })
    }
}

describe('BatchAdmissionService', () => {
    let admissions: FakeBatchAdmissionStore
    let executions: jest.Mocked<VerificationExecutionStore>
    let requests: jest.Mocked<VerificationRequestStore>
    let cacheReader: jest.Mocked<VerificationResultCacheReader>
    let cooldownReader: jest.Mocked<VerificationCooldownReader>
    let credits: jest.Mocked<Pick<CreditReservationService, 'reserveMany' | 'closeAdmissionMany'>>
    let clock: VerificationClock
    let service: BatchAdmissionService
    let insertedRequests: NewVerificationRequestInput[]

    beforeEach(() => {
        admissions = new FakeBatchAdmissionStore()
        insertedRequests = []
        executions = {
            claimOrJoin: jest.fn(),
            findById: jest.fn(),
            markQueued: jest.fn(),
            cancelFundingFailure: jest.fn(),
            acquireLease: jest.fn(),
            renewLease: jest.fn(),
            takeoverForRetry: jest.fn(),
            cancelIfNoCaptureIntention: jest.fn(),
            pageNonterminal: jest.fn(),
            pageCanceledPendingCleanup: jest.fn(),
            cancelBatchGroupUnstarted: jest.fn(),
        }
        requests = {
            findByClientKey: jest.fn(),
            insert: jest.fn((input: NewVerificationRequestInput): Promise<InsertRequestOutcome> => {
                insertedRequests.push(input)
                return Promise.resolve({
                    kind: 'inserted',
                    record: {
                        requestId: input.requestId,
                        organizationId: input.organizationId,
                        normalizedAddress: input.normalizedAddress,
                        deliveryMode: input.deliveryMode,
                        clientRequestKey: input.clientRequestKey,
                        executionId: input.executionId,
                        resultId: input.resultId,
                        source: input.source,
                        billingState: input.billingState,
                        reservedCount: input.reservedCount,
                        chargedCount: 0,
                        finalReason: input.finalReason,
                        createdAt: now,
                        settledAt: null,
                    },
                })
            }),
            findById: jest.fn(),
            attachExecution: jest.fn(),
            settleCanceled: jest.fn(),
        }
        cacheReader = { findLatestCandidate: jest.fn().mockResolvedValue(null) }
        cooldownReader = { findLatestOutcome: jest.fn().mockResolvedValue(null) }
        credits = { reserveMany: jest.fn(), closeAdmissionMany: jest.fn() }
        clock = { now: () => now }
        service = new BatchAdmissionService(
            admissions,
            executions,
            requests,
            cacheReader,
            cooldownReader,
            credits as unknown as CreditReservationService,
            clock,
            cacheTtlMs,
            executionDeadlineMs,
            addressCooldownMs,
        )
    })

    function seedAdmission(state: BatchAdmissionState, addresses: readonly { normalizedAddress: string; firstSeenRow: number }[]): void {
        admissions.seed(
            {
                batchId,
                organizationId,
                state,
                totalRows: addresses.length,
                uniqueAddressCount: addresses.length,
                clientRequestKey: null,
                contentDigest: null,
                createdAt: now,
                updatedAt: now,
            },
            addresses,
        )
    }

    it('admits an all-cached/shared/cooldown batch without ever calling reserveMany', async () => {
        cacheReader.findLatestCandidate.mockImplementation((_org, address) =>
            Promise.resolve(
                address === 'cached@example.test' ? { resultId: 'result-cache', verificationQuality: 'conclusive_positive', evidenceObservedAt: now, evidencePolicyVersion: 1 } : null,
            ),
        )
        cooldownReader.findLatestOutcome.mockImplementation((_org, address) =>
            Promise.resolve(
                address === 'cooldown@example.test'
                    ? { resultId: 'result-cooldown', verificationQuality: 'inconclusive', createdAt: new Date(now.getTime() - 1_000) }
                    : null,
            ),
        )
        executions.claimOrJoin.mockImplementation(
            (_org, address): Promise<ClaimAddressOutcome> =>
                Promise.resolve(
                    address === 'shared@example.test'
                        ? {
                              kind: 'joined',
                              execution: {
                                  executionId: 'execution-shared',
                                  organizationId,
                                  normalizedAddress: address,
                                  payerRequestId: 'other-request',
                                  state: 'running',
                                  fundingOwnerType: 'single',
                                  fundingOwnerId: 'execution-shared',
                                  attemptGeneration: 0,
                                  leaseOwnerId: null,
                                  leaseExpiresAt: null,
                                  resultId: null,
                                  retryAt: null,
                                  deadlineAt: now,
                                  createdAt: now,
                                  updatedAt: now,
                              },
                          }
                        : (() => {
                              throw new Error('unexpected claimOrJoin call')
                          })(),
                ),
        )
        seedAdmission('validating', [
            { normalizedAddress: 'cached@example.test', firstSeenRow: 1 },
            { normalizedAddress: 'cooldown@example.test', firstSeenRow: 2 },
            { normalizedAddress: 'shared@example.test', firstSeenRow: 3 },
        ])

        await service.admit(batchId, organizationId)

        expect(credits.reserveMany).not.toHaveBeenCalled()
        expect((await admissions.findById(batchId, organizationId))?.state).toBe('admitted')

        const byAddress = new Map(insertedRequests.map(request => [request.normalizedAddress, request]))
        expect(byAddress.get('cached@example.test')).toMatchObject({ source: 'cache', billingState: 'settled', finalReason: 'cached', reservedCount: 0, resultId: 'result-cache' })
        expect(byAddress.get('cooldown@example.test')).toMatchObject({ source: 'cooldown', billingState: 'settled', finalReason: 'inconclusive', reservedCount: 0, resultId: 'result-cooldown' })
        expect(byAddress.get('shared@example.test')).toMatchObject({ source: 'shared', billingState: 'pending', reservedCount: 0, executionId: 'execution-shared' })
    })

    it('reserves and dispatches every newly created execution as one atomic group', async () => {
        executions.claimOrJoin.mockImplementation(
            (_org, _address, payerRequestId, newExecutionId, _deadlineAt, _isUsable, fundingOwner?: ExecutionFundingOwner): Promise<ClaimAddressOutcome> => {
                expect(fundingOwner).toEqual({ type: 'batch_group', id: batchId })
                return Promise.resolve({
                    kind: 'created',
                    execution: {
                        executionId: newExecutionId,
                        organizationId,
                        normalizedAddress: 'new@example.test',
                        payerRequestId,
                        state: 'funding_pending',
                        fundingOwnerType: 'batch_group',
                        fundingOwnerId: batchId,
                        attemptGeneration: 0,
                        leaseOwnerId: null,
                        leaseExpiresAt: null,
                        resultId: null,
                        retryAt: null,
                        deadlineAt: now,
                        createdAt: now,
                        updatedAt: now,
                    },
                })
            },
        )
        seedAdmission('validating', [{ normalizedAddress: 'new@example.test', firstSeenRow: 1 }])

        await service.admit(batchId, organizationId)

        expect(credits.reserveMany).toHaveBeenCalledWith(organizationId, [{ operationId: expect.any(String), amount: 1 }])
        expect(executions.markQueued).toHaveBeenCalledTimes(1)
        expect((await admissions.findById(batchId, organizationId))?.state).toBe('admitted')
        expect(insertedRequests[0]).toMatchObject({ source: 'fresh', billingState: 'pending', reservedCount: 1 })
    })

    it('fences the whole group as insufficient credits without funding any created execution', async () => {
        executions.claimOrJoin.mockImplementation((_org, _address, payerRequestId, newExecutionId): Promise<ClaimAddressOutcome> => Promise.resolve({
            kind: 'created',
            execution: {
                executionId: newExecutionId,
                organizationId,
                normalizedAddress: 'new@example.test',
                payerRequestId,
                state: 'funding_pending',
                fundingOwnerType: 'batch_group',
                fundingOwnerId: batchId,
                attemptGeneration: 0,
                leaseOwnerId: null,
                leaseExpiresAt: null,
                resultId: null,
                retryAt: null,
                deadlineAt: now,
                createdAt: now,
                updatedAt: now,
            },
        }))
        credits.reserveMany.mockRejectedValue(new InsufficientCreditsException(organizationId))
        seedAdmission('validating', [{ normalizedAddress: 'new@example.test', firstSeenRow: 1 }])

        await service.admit(batchId, organizationId)

        expect(executions.cancelFundingFailure).toHaveBeenCalledTimes(1)
        expect(credits.closeAdmissionMany).toHaveBeenCalledWith(organizationId, [{ operationId: expect.any(String), amount: 1 }])
        expect(executions.markQueued).not.toHaveBeenCalled()
        expect((await admissions.findById(batchId, organizationId))?.state).toBe('insufficient_credits')
        expect(insertedRequests[0]).toMatchObject({ source: 'fresh', billingState: 'settled', finalReason: 'failed', reservedCount: 0 })
    })

    it('resumes materializing requests on a retry after the group already reached a terminal admission state', async () => {
        seedAdmission('admitted', [{ normalizedAddress: 'cached@example.test', firstSeenRow: 1 }])
        // Simulate a prior interrupted attempt that already resolved the address but crashed before materializing it.
        await admissions.recordAdmissionOutcome(batchId, 'cached@example.test', {
            admissionKind: 'cache',
            executionId: null,
            resultId: 'result-cache',
        })

        await service.admit(batchId, organizationId)

        expect(cacheReader.findLatestCandidate).not.toHaveBeenCalled()
        expect(insertedRequests).toHaveLength(1)
        expect(insertedRequests[0]).toMatchObject({ source: 'cache', resultId: 'result-cache' })
    })

    it('is a no-op on a second call once every address already has a payer request', async () => {
        seedAdmission('validating', [{ normalizedAddress: 'cached@example.test', firstSeenRow: 1 }])
        cacheReader.findLatestCandidate.mockResolvedValue({
            resultId: 'result-cache',
            verificationQuality: 'conclusive_positive',
            evidenceObservedAt: now,
            evidencePolicyVersion: 1,
        })

        await service.admit(batchId, organizationId)
        await service.admit(batchId, organizationId)

        expect(insertedRequests).toHaveLength(1)
    })
})
