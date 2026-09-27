export const BATCH_ADMISSION_RECOVERY = Symbol('BatchAdmissionRecovery')

export interface BatchAdmissionRecoveryReport {
    readonly groupsChecked: number
    readonly groupsCompleted: number
    readonly groupsFailed: number
}

/** Advances batch groups whose admission owner stopped or yielded, independently of batch queue availability. */
export interface BatchAdmissionRecovery {
    reconcile(limit: number): Promise<BatchAdmissionRecoveryReport>
}
