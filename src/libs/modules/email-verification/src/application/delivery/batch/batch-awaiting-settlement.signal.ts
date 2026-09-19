// Raised by the batch workflow when the AwaitSettlement step must park the current run until every unique
// address's payer request has settled. The infrastructure worker translates this into BullMQ's own
// `job.moveToDelayed()` + `DelayedError`; the pure workflow cannot reference those classes directly without
// importing bullmq.
export class BatchAwaitingSettlementSignal extends Error {
    name = 'BatchAwaitingSettlementSignal'

    constructor(readonly retryAtMs: number) {
        super()
    }
}
