import { BatchAdmissionRecord } from './batch-admission-store'
import { BatchAdmissionAdvance, BatchAdmissionService } from './batch-admission.service'
import { BatchAdmissionRecoveryService } from './batch-admission-recovery.service'
import { InMemoryBatchAdmissionStore } from './__tests__/in-memory-batch-admission'

const now = new Date('2026-09-15T00:00:00.000Z')

function group(index: number, overrides: Partial<BatchAdmissionRecord> = {}): BatchAdmissionRecord {
    return {
        batchId: `batch-${String(index).padStart(3, '0')}`,
        organizationId: 'organization-1',
        state: 'admitting',
        fundingDecision: 'pending',
        finalizationState: 'preparing',
        admissionLeaseOwnerId: null,
        admissionLeaseExpiresAt: null,
        admissionGeneration: 0,
        totalRows: 1,
        uniqueAddressCount: 1,
        clientRequestKey: null,
        contentDigest: null,
        createdAt: now,
        updatedAt: new Date(now.getTime() - 1_000_000 + index),
        ...overrides,
    }
}

describe('BatchAdmissionRecoveryService', () => {
    let admissions: InMemoryBatchAdmissionStore
    let admit: jest.Mock<Promise<BatchAdmissionAdvance>, [string, string]>
    let recovery: BatchAdmissionRecoveryService

    beforeEach(() => {
        admissions = new InMemoryBatchAdmissionStore()
        // Model one bounded advancement: take and release the lease, which touches the group's timestamp.
        admit = jest.fn(async (batchId: string, organizationId: string): Promise<BatchAdmissionAdvance> => {
            const lease = await admissions.claimAdmissionLease(
                batchId,
                organizationId,
                `owner-${batchId}`,
                now,
                new Date(now.getTime() + 60_000),
            )
            if (lease.kind === 'acquired') {
                await admissions.releaseAdmissionLease(batchId, organizationId, {
                    ownerId: `owner-${batchId}`,
                    generation: lease.generation,
                    now,
                })
            }
            return { kind: 'continuation', retryAt: now, phase: 'resolution', afterFirstSeenRow: 0 }
        })
        recovery = new BatchAdmissionRecoveryService(admissions, { admit } as unknown as BatchAdmissionService, {
            now: () => now,
        })
    })

    it('advances at most the limit of distinct groups per sweep and rotates the rest fairly', async () => {
        for (let index = 0; index < 101; index++) admissions.seed(group(index), [])

        const first = await recovery.reconcile(100)

        expect(first.groupsChecked).toBe(100)
        const firstIds = admit.mock.calls.map(([batchId]) => batchId)
        expect(new Set(firstIds).size).toBe(100)
        expect(firstIds).not.toContain('batch-100')

        admit.mockClear()
        await recovery.reconcile(100)

        expect(admit.mock.calls[0][0]).toBe('batch-100')
    })

    it('skips live leases, ready groups, and closed decisions but includes groups still preparing receipts', async () => {
        admissions.seed(
            group(0, { admissionLeaseOwnerId: 'live', admissionLeaseExpiresAt: new Date(now.getTime() + 1) }),
            [],
        )
        admissions.seed(
            group(1, { admissionLeaseOwnerId: 'expired', admissionLeaseExpiresAt: new Date(now.getTime() - 1) }),
            [],
        )
        admissions.seed(group(2, { state: 'admitted', finalizationState: 'ready' }), [])
        admissions.seed(group(3, { state: 'funding', fundingDecision: 'closed' }), [])
        admissions.seed(group(4, { state: 'insufficient_credits' }), [])
        admissions.seed(group(5, { state: 'funding', fundingDecision: 'denied' }), [])

        await recovery.reconcile(100)

        expect(admit.mock.calls.map(([batchId]) => batchId)).toEqual(['batch-001', 'batch-004', 'batch-005'])
    })

    it('continues past a group whose advancement fails and counts outcomes', async () => {
        admissions.seed(group(0), [])
        admissions.seed(group(1), [])
        admissions.seed(group(2), [])
        admit.mockRejectedValueOnce(new Error('credits unavailable')).mockResolvedValueOnce({ kind: 'complete' })

        await expect(recovery.reconcile(100)).resolves.toEqual({
            groupsChecked: 3,
            groupsCompleted: 1,
            groupsFailed: 1,
        })
        expect(admit).toHaveBeenCalledTimes(3)
    })
})
