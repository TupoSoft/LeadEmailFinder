export const VERIFICATION_EXECUTION_DISPATCHER = Symbol('VerificationExecutionDispatcher')

/** Dispatches one execution attempt onto the `verification-execution` queue. Idempotent: dispatching an
 *  execution that already has an active job for it is a safe no-op, since the adapter uses the execution ID as
 *  the job ID. */
export interface VerificationExecutionDispatcher {
    dispatch(executionId: string, organizationId: string): Promise<void>
}
