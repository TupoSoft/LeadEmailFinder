import { BatchAdmissionRecovery, BatchAdmissionRecoveryReport } from '../../ports/batch-admission-recovery'
import { VerificationClock } from '../../ports/verification-clock'
import { BatchAdmissionStore } from './batch-admission-store'
import { BatchAdmissionService } from './batch-admission.service'

/**
 * Gives each recoverable group without a live owner one bounded advancement per sweep, oldest `updatedAt` first.
 * Every advancement that takes the lease touches the group when it releases, so successive sweeps rotate fairly
 * through more groups than one page holds. One group's retryable failure never stops the rest of the sweep.
 */
export class BatchAdmissionRecoveryService implements BatchAdmissionRecovery {
    constructor(
        private readonly admissions: BatchAdmissionStore,
        private readonly admission: BatchAdmissionService,
        private readonly clock: VerificationClock,
    ) {}

    async reconcile(limit: number): Promise<BatchAdmissionRecoveryReport> {
        const groups = await this.admissions.pageRecoverableGroups(this.clock.now(), limit)
        let groupsCompleted = 0
        let groupsFailed = 0
        for (const group of groups) {
            try {
                const advance = await this.admission.admit(group.batchId, group.organizationId)
                if (advance.kind === 'complete') groupsCompleted += 1
            } catch {
                // The group keeps its saved phase and stays eligible; errors are counted, never logged with
                // customer addresses or credit details.
                groupsFailed += 1
            }
        }
        return { groupsChecked: groups.length, groupsCompleted, groupsFailed }
    }
}
