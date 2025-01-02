import type { Redis } from 'ioredis'
import { Worker } from 'bullmq'
import { LEAD_QUEUE_NAME } from './constants'
import type { FindLeadBulkDataType, FindLeadBulkResultType, LeadQueueNameType } from './queue'
import type { LeadFinder } from './finder'
import type { FindLeadResult } from './dto'

const PERCENTAGE = 100

export class LeadQueueWorker {
    private readonly worker

    constructor(connection: Redis, leadFinder: LeadFinder) {
        this.worker = new Worker<FindLeadBulkDataType, FindLeadBulkResultType, LeadQueueNameType>(
            LEAD_QUEUE_NAME,
            async job => {
                const {
                    data: { leads },
                } = job

                const findLeadResults: FindLeadResult[] = []
                for (const lead of leads) {
                    const result = await leadFinder.findLead(lead)
                    findLeadResults.push(result)
                    await job.updateProgress((findLeadResults.length / leads.length) * PERCENTAGE)
                }

                return { findLeadResults }
            },
            {
                connection,
                autorun: false,
            },
        )
    }

    async run(): Promise<void> {
        await this.worker.run()
    }
}
