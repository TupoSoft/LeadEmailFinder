import { EntityManager } from 'typeorm'
import { BatchAdmissionFence } from '../../application/delivery/batch/batch-admission-store'
import { BatchAdmissionEntity } from './typeorm/batch-admission.entity'

export function holdsAdmissionFence(admission: BatchAdmissionEntity, fence: BatchAdmissionFence): boolean {
    return (
        admission.admissionLeaseOwnerId === fence.ownerId &&
        admission.admissionGeneration === fence.generation &&
        admission.admissionLeaseExpiresAt !== null &&
        admission.admissionLeaseExpiresAt.getTime() > fence.now.getTime()
    )
}

/**
 * Locks the batch group row and returns it only while `fence` still owns an unexpired lease. Group transitions lock
 * this row before any execution row, so a stale owner cannot claim, queue, or cancel work after a newer generation
 * decided the group. `read` (FOR SHARE) lets address writes proceed concurrently while still blocking a takeover.
 */
export async function lockFencedAdmission(
    manager: EntityManager,
    batchId: string,
    organizationId: string,
    fence: BatchAdmissionFence,
    mode: 'read' | 'write',
): Promise<BatchAdmissionEntity | null> {
    const admission = await manager.findOne(BatchAdmissionEntity, {
        where: { batchId, organizationId },
        lock: { mode: mode === 'read' ? 'pessimistic_read' : 'pessimistic_write' },
    })
    return admission && holdsAdmissionFence(admission, fence) ? admission : null
}
