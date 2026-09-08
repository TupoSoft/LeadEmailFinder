export const BATCH_CHILD_FLOW = Symbol('BatchChildFlow')

export interface BatchChildFlowChild {
    email: string
    organizationId: string
    credentialId: string
}

export interface BatchChildFlow {
    dispatchChild(parent: { id: string; queueQualifiedName: string }, child: BatchChildFlowChild): Promise<void>
    awaitChildren(jobId: string, token: string): Promise<{ shouldWait: boolean }>
}
