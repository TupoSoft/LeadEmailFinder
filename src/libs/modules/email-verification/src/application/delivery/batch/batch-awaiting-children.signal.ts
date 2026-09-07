// Raised by the batch workflow when the WaitForChildren step must park the current run. The infrastructure
// worker translates this into BullMQ's own WaitingChildrenError; the pure workflow cannot reference that
// class directly without importing bullmq.
export class BatchAwaitingChildrenSignal extends Error {
    name = 'BatchAwaitingChildrenSignal'
}
